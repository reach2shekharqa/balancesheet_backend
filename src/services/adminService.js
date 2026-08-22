import { pool } from "../db/db.js";

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const DOCUMENT_ID_PATTERN = /^\d+$/;
const ALLOWED_ROLES = new Set(["user", "admin"]);

function assertUserId(userId) {
    if (typeof userId !== "string" || !USER_ID_PATTERN.test(userId)) throw new Error("Invalid user ID");
}

function assertDocumentId(documentId) {
    if (!DOCUMENT_ID_PATTERN.test(String(documentId))) throw new Error("Invalid document ID");
}

function parseNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label}`);
    return value;
}

export async function writeAudit(client, { actorId, action, targetType, targetId, changes = {} }) {
    await client.query(
        `INSERT INTO audit_logs (admin_id, action, target_type, target_id, changes) VALUES ($1, $2, $3, $4, $5)`,
        [actorId, action, targetType, targetId == null ? null : String(targetId), changes]
    );
}

export async function getDashboard() {
    const result = await pool.query(`
        SELECT
            COUNT(*)::int AS total_users,
            COUNT(*) FILTER (WHERE is_active = TRUE AND is_deleted = FALSE)::int AS active_users,
            COUNT(*) FILTER (WHERE is_deleted = TRUE)::int AS deleted_users,
            COUNT(*) FILTER (WHERE role = 'admin' AND is_deleted = FALSE)::int AS admin_count,
            COALESCE(SUM(uploads_used), 0)::int AS total_uploads,
            COALESCE(SUM(storage_used_mb), 0)::int AS total_storage_used_mb,
            (SELECT COUNT(*)::int FROM documents) AS total_documents
        FROM users`);
    const activity = await pool.query(`
        SELECT a.id, a.action, a.target_type AS "targetType", a.target_id AS "targetId",
               a.changes, a.created_at AS "createdAt", u.user_name AS "actorName", u.email AS "actorEmail"
        FROM audit_logs a LEFT JOIN users u ON u.user_id = a.admin_id
        ORDER BY a.created_at DESC LIMIT 20`);
    return { statistics: result.rows[0], recentActivity: activity.rows };
}

export async function listUsers({ search = "", filter = "all" } = {}) {
    const filters = [];
    const params = [];
    if (search) {
        params.push(`%${String(search).trim()}%`);
        filters.push(`(u.email ILIKE $${params.length} OR u.user_name ILIKE $${params.length} OR u.user_id ILIKE $${params.length})`);
    }
    if (filter === "active") filters.push("u.is_active = TRUE AND u.is_deleted = FALSE");
    if (filter === "inactive") filters.push("u.is_active = FALSE AND u.is_deleted = FALSE");
    if (filter === "deleted") filters.push("u.is_deleted = TRUE");
    if (filter === "admin" || filter === "user") { params.push(filter); filters.push(`u.role = $${params.length}`); }
    const result = await pool.query(`
        SELECT u.user_id AS "userId", u.user_name AS "userName", u.email, u.role, u.uploads_used AS "uploadsUsed",
               u.upload_quota AS "uploadLimit", u.storage_used_mb AS "storageUsedMb", u.storage_limit_mb AS "storageLimitMb",
               u.is_active AS "isActive", u.is_deleted AS "isDeleted", u.created_at AS "createdAt"
        FROM users u ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY u.created_at DESC`, params);
    return result.rows;
}

export async function getUser(userId) {
    assertUserId(userId);
    const user = await pool.query(`
        SELECT user_id AS "userId", user_name AS "userName", email, role, is_active AS "isActive", is_deleted AS "isDeleted",
               created_at AS "createdAt", updated_at AS "updatedAt", uploads_used AS "uploadsUsed", upload_quota AS "uploadLimit",
               storage_used_mb AS "storageUsedMb", storage_limit_mb AS "storageLimitMb", NULL AS "lastSignInAt",
               deleted_at AS "deletedAt", deleted_by AS "deletedBy", deletion_reason AS "deletionReason"
        FROM users WHERE user_id = $1`, [userId]);
    if (!user.rows[0]) return null;
    const documents = await pool.query(`SELECT id, original_filename AS "originalFilename", file_size_mb AS "fileSizeMb", extraction_status AS "status", uploaded_at AS "uploadedAt" FROM documents WHERE user_id = $1 ORDER BY uploaded_at DESC`, [userId]);
    return { ...user.rows[0], documents: documents.rows };
}

export async function changeRole({ actorId, userId, role }) {
    assertUserId(userId);
    if (!ALLOWED_ROLES.has(role)) throw new Error("Invalid role");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const current = await client.query(`SELECT role FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);
        if (!current.rows[0]) throw new Error("User not found");
        if (role !== "admin" && current.rows[0].role === "admin") {
            const admins = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_deleted = FALSE`);
            if (admins.rows[0].count <= 1) throw new Error("Cannot remove the last administrator");
        }
        const updated = await client.query(`UPDATE users SET role = $2, updated_at = NOW() WHERE user_id = $1 RETURNING user_id AS "userId", role`, [userId, role]);
        await writeAudit(client, { actorId, action: "USER_ROLE_CHANGED", targetType: "user", targetId: userId, changes: { role } });
        await client.query("COMMIT");
        return updated.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function updateUser({ actorId, userId, field, value, action }) {
    assertUserId(userId);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const current = await client.query(`SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);
        if (!current.rows[0]) throw new Error("User not found");
        const updated = await client.query(`UPDATE users SET ${field} = $2, updated_at = NOW() WHERE user_id = $1 RETURNING user_id AS "userId", ${field} AS value`, [userId, value]);
        await writeAudit(client, { actorId, action, targetType: "user", targetId: userId, changes: { [field]: value } });
        await client.query("COMMIT");
        return updated.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function softDeleteUser({ actorId, userId, reason }) {
    assertUserId(userId);
    if (typeof reason !== "string" || reason.trim().length < 3 || reason.length > 500) throw new Error("Deletion reason is required");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const current = await client.query(`SELECT role FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);
        if (!current.rows[0]) throw new Error("User not found");
        if (userId === actorId && current.rows[0].role === "admin") throw new Error("You cannot delete your own administrator account");
        await client.query(`UPDATE users SET is_deleted = TRUE, is_active = FALSE, deleted_at = NOW(), deleted_by = $2, deletion_reason = $3, updated_at = NOW() WHERE user_id = $1`, [userId, actorId, reason.trim()]);
        await writeAudit(client, { actorId, action: "USER_SOFT_DELETED", targetType: "user", targetId: userId, changes: { reason: reason.trim() } });
        await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function listDocuments({ search = "", userId, status } = {}) {
    const params = []; const filters = [];
    if (search) { params.push(`%${String(search).trim()}%`); filters.push(`(d.original_filename ILIKE $${params.length} OR d.id::text ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }
    if (userId) { assertUserId(userId); params.push(userId); filters.push(`d.user_id = $${params.length}`); }
    if (status) { params.push(status); filters.push(`d.extraction_status = $${params.length}`); }
    const result = await pool.query(`SELECT d.id, d.original_filename AS "originalFilename", d.user_id AS "userId", u.user_name AS "ownerName", u.email AS "ownerEmail", d.uploaded_at AS "uploadedAt", d.file_size_mb AS "sizeMb", d.extraction_status AS status FROM documents d LEFT JOIN users u ON u.user_id = d.user_id ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY d.uploaded_at DESC`, params);
    return result.rows;
}

export async function deleteDocument({ actorId, documentId }) {
    assertDocumentId(documentId);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const document = await client.query(`SELECT id, user_id, file_size_mb FROM documents WHERE id = $1 FOR UPDATE`, [documentId]);
        if (!document.rows[0]) throw new Error("Document not found");
        for (const table of ["document_rows", "document_tables", "financial_metrics", "calculated_metrics", "metric_variance_alerts", "user_documents"]) await client.query(`DELETE FROM ${table} WHERE document_id = $1`, [documentId]);
        await client.query(`DELETE FROM row_change_log WHERE document_id = $1 OR previous_document_id = $1`, [documentId]);
        await client.query(`DELETE FROM user_storage_logs WHERE extraction_id = $1`, [documentId]);
        await client.query(`DELETE FROM documents WHERE id = $1`, [documentId]);
        await writeAudit(client, { actorId, action: "DOCUMENT_DELETED", targetType: "document", targetId: documentId, changes: { userId: document.rows[0].user_id } });
        await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function deleteDocumentWithClient(client, documentId) {
    for (const table of ["document_rows", "document_tables", "financial_metrics", "calculated_metrics", "metric_variance_alerts", "user_documents"]) {
        await client.query(`DELETE FROM ${table} WHERE document_id = $1`, [documentId]);
    }
    await client.query(`DELETE FROM row_change_log WHERE document_id = $1 OR previous_document_id = $1`, [documentId]);
    await client.query(`DELETE FROM user_storage_logs WHERE extraction_id = $1`, [documentId]);
    await client.query(`DELETE FROM documents WHERE id = $1`, [documentId]);
}

export async function permanentlyDeleteExpiredUsers() {
    const client = await pool.connect();
    let deletedUsers = 0;
    try {
        await client.query("BEGIN");
        const expired = await client.query(`SELECT user_id FROM users WHERE is_deleted = TRUE AND deleted_at IS NOT NULL AND deleted_at <= NOW() - INTERVAL '2 days' FOR UPDATE`);
        for (const user of expired.rows) {
            const documents = await client.query(`SELECT id FROM documents WHERE user_id = $1`, [user.user_id]);
            for (const document of documents.rows) await deleteDocumentWithClient(client, document.id);
            await client.query(`DELETE FROM user_storage_logs WHERE user_id = $1`, [user.user_id]);
            await client.query(`DELETE FROM user_subscriptions WHERE user_id = $1`, [user.user_id]);
            await client.query(`DELETE FROM audit_logs WHERE target_type = 'user' AND target_id = $1`, [user.user_id]);
            await client.query(`DELETE FROM users WHERE user_id = $1`, [user.user_id]);
            deletedUsers += 1;
        }
        await client.query("COMMIT");
        return deletedUsers;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export { parseNonNegativeInteger };