import { pool } from "../db/db.js";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const DOCUMENT_ID_PATTERN = /^\d+$/;
const ALLOWED_ROLES = new Set(["user", "admin"]);
const ACCESS_ROLES = new Set(["OWNER", "CONSUMER"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertUserId(userId) {
    if (typeof userId !== "string" || !USER_ID_PATTERN.test(userId)) throw new Error("Invalid user ID");
}

function assertDocumentId(documentId) {
    if (!DOCUMENT_ID_PATTERN.test(String(documentId))) throw new Error("Invalid document ID");
}

function assertCompanyId(companyId) {
    if (!/^\d+$/.test(String(companyId)) || Number(companyId) <= 0) throw new Error("Invalid company ID");
}

function assertAccessRole(accessRole) {
    if (!ACCESS_ROLES.has(accessRole)) throw new Error("Invalid access role");
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
            COALESCE((SELECT SUM(file_size_mb) FROM documents), 0)::float8 AS total_storage_used_mb,
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
               u.upload_count AS "uploadCount", u.upload_limit_mb AS "uploadLimitMb",
               COALESCE(p.upload_quota, u.upload_quota, 1)::int AS "uploadQuota",
               u.upload_quota AS "configuredUploadQuota", COALESCE((SELECT SUM(d.file_size_mb) FROM documents d WHERE d.user_id = u.user_id), 0)::float8 AS "storageUsedMb", u.storage_limit_mb AS "storageLimitMb",
               u.is_active AS "isActive", u.is_deleted AS "isDeleted", u.created_at AS "createdAt",
               CASE WHEN u.is_deleted OR NOT u.is_active THEN '[]'::json ELSE COALESCE((SELECT json_agg(json_build_object('companyId', c.id, 'companyName', c.company_name, 'accessRole', cu.access_role) ORDER BY c.company_name) FROM company_users cu JOIN companies c ON c.id = cu.company_id WHERE cu.user_id = u.user_id AND c.is_active = TRUE), '[]'::json) END AS companies
                FROM users u
                LEFT JOIN LATERAL (
                        SELECT p.upload_quota
                        FROM user_subscriptions s JOIN plans p ON p.id = s.plan_id AND p.is_active = TRUE
                        WHERE s.user_id = u.user_id AND s.status = 'active'
                            AND (s.expires_at IS NULL OR s.expires_at > NOW())
                        ORDER BY s.started_at DESC LIMIT 1
                ) p ON TRUE
                ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""} ORDER BY u.created_at DESC`, params);
    return result.rows;
}

export async function getUser(userId) {
    assertUserId(userId);
    const user = await pool.query(`
         SELECT u.user_id AS "userId", u.user_name AS "userName", u.email, u.role, u.is_active AS "isActive", u.is_deleted AS "isDeleted",
             u.created_at AS "createdAt", u.updated_at AS "updatedAt", u.uploads_used AS "uploadsUsed",
             u.upload_count AS "uploadCount", u.upload_limit_mb AS "uploadLimitMb",
             COALESCE(p.upload_quota, u.upload_quota, 1)::int AS "uploadQuota",
             u.upload_quota AS "configuredUploadQuota", COALESCE((SELECT SUM(d.file_size_mb) FROM documents d WHERE d.user_id = u.user_id), 0)::float8 AS "storageUsedMb", u.storage_limit_mb AS "storageLimitMb", NULL AS "lastSignInAt",
               deleted_at AS "deletedAt", deleted_by AS "deletedBy", deletion_reason AS "deletionReason"
         FROM users u
         LEFT JOIN LATERAL (
             SELECT p.upload_quota
             FROM user_subscriptions s JOIN plans p ON p.id = s.plan_id AND p.is_active = TRUE
             WHERE s.user_id = u.user_id AND s.status = 'active'
            AND (s.expires_at IS NULL OR s.expires_at > NOW())
             ORDER BY s.started_at DESC LIMIT 1
         ) p ON TRUE
         WHERE u.user_id = $1`, [userId]);
    if (!user.rows[0]) return null;
    const documents = await pool.query(`SELECT id, original_filename AS "originalFilename", file_size_mb AS "fileSizeMb", extraction_status AS "status", uploaded_at AS "uploadedAt" FROM documents WHERE user_id = $1 ORDER BY uploaded_at DESC`, [userId]);
    const companies = await listUserCompanies(userId);
    return { ...user.rows[0], companies: user.rows[0].isDeleted ? [] : companies, documents: documents.rows };
}

export async function listCompanies() {
    const result = await pool.query(`SELECT id AS "companyId", company_name AS "companyName", cin FROM companies WHERE is_active = TRUE ORDER BY company_name`);
    return result.rows;
}

export async function listAdminCompanies() {
    const result = await pool.query(`
        SELECT c.id AS "companyId", c.company_name AS "companyName", c.cin, c.pan,
               COUNT(DISTINCT cu.user_id)::int AS "userCount",
               COUNT(DISTINCT d.id)::int AS "documentCount"
        FROM companies c
        LEFT JOIN company_users cu ON cu.company_id = c.id
        LEFT JOIN documents d ON d.company_id = c.id
        WHERE c.is_active = TRUE
        GROUP BY c.id
        ORDER BY c.company_name`);
    return result.rows;
}

export async function deleteCompanies({ actorId, companyIds }) {
    if (!Array.isArray(companyIds) || companyIds.length === 0 || companyIds.length > 500) throw new Error("Invalid company list");
    const uniqueCompanyIds = [...new Set(companyIds)];
    uniqueCompanyIds.forEach(assertCompanyId);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const companies = await client.query(`SELECT id, company_name, cin FROM companies WHERE id = ANY($1::bigint[]) AND is_active = TRUE ORDER BY id FOR UPDATE`, [uniqueCompanyIds]);
        if (companies.rows.length !== uniqueCompanyIds.length) throw new Error("One or more companies were not found");
        for (const company of companies.rows) {
            const documents = await client.query(`SELECT COUNT(*)::int AS count FROM documents WHERE company_id = $1`, [company.id]);
            const memberships = await client.query(`SELECT COUNT(*)::int AS count FROM company_users WHERE company_id = $1`, [company.id]);
            await client.query(`UPDATE documents SET company_id = NULL WHERE company_id = $1`, [company.id]);
            await client.query(`DELETE FROM company_users WHERE company_id = $1`, [company.id]);
            await client.query(`DELETE FROM companies WHERE id = $1`, [company.id]);
            await writeAudit(client, { actorId, action: "COMPANY_DELETED", targetType: "company", targetId: company.id, changes: { companyName: company.company_name, cin: company.cin, documentsDetached: documents.rows[0].count, membershipsRemoved: memberships.rows[0].count } });
        }
        await client.query("COMMIT");
        return { companies: uniqueCompanyIds, count: uniqueCompanyIds.length };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function listUserCompanies(userId) {
    assertUserId(userId);
    const result = await pool.query(`
        SELECT c.id AS "companyId", c.company_name AS "companyName", c.cin, cu.access_role AS "accessRole"
        FROM company_users cu JOIN companies c ON c.id = cu.company_id
        JOIN users u ON u.user_id = cu.user_id
        WHERE cu.user_id = $1 AND u.is_active = TRUE AND u.is_deleted = FALSE AND c.is_active = TRUE
        ORDER BY c.company_name`, [userId]);
    return result.rows;
}

async function lockMembershipTarget(client, userId, companyId) {
    assertUserId(userId);
    assertCompanyId(companyId);
    const user = await client.query(`SELECT user_id, is_active, is_deleted FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);
    if (!user.rows[0]) throw new Error("User not found");
    if (user.rows[0].is_deleted || user.rows[0].is_active === false) throw new Error("Cannot manage access for an inactive or deleted user");
    const company = await client.query(`SELECT id FROM companies WHERE id = $1 AND is_active = TRUE FOR UPDATE`, [companyId]);
    if (!company.rows[0]) throw new Error("Company not found");
}

export async function createUser({ actorId, userName, email, password }) {
    const name = String(userName ?? "").trim();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (name.length < 2 || name.length > 200) throw new Error("Invalid user name");
    if (!EMAIL_PATTERN.test(normalizedEmail)) throw new Error("Invalid email");
    if (typeof password !== "string" || password.length < 8) throw new Error("Password must be at least 8 characters");
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = `usr_${crypto.randomUUID()}`;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(`INSERT INTO users (user_id, user_name, email, password, role) VALUES ($1, $2, $3, $4, 'user') RETURNING user_id AS "userId", user_name AS "userName", email, role`, [userId, name, normalizedEmail, passwordHash]);
        await writeAudit(client, { actorId, action: "USER_CREATED", targetType: "user", targetId: userId, changes: { role: "user" } });
        await client.query("COMMIT");
        return result.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function addCompanyAccess({ actorId, userId, companyId, accessRole }) {
    assertAccessRole(accessRole);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockMembershipTarget(client, userId, companyId);
        const existing = await client.query(`SELECT 1 FROM company_users WHERE user_id = $1 AND company_id = $2 FOR UPDATE`, [userId, companyId]);
        if (existing.rows[0]) throw new Error("User already has access to this company");
        const result = await client.query(`INSERT INTO company_users (company_id, user_id, access_role) VALUES ($1, $2, $3) RETURNING company_id AS "companyId", user_id AS "userId", access_role AS "accessRole"`, [companyId, userId, accessRole]);
        await writeAudit(client, { actorId, action: "COMPANY_ACCESS_GRANTED", targetType: "user", targetId: userId, changes: { companyId: String(companyId), accessRole } });
        await client.query("COMMIT");
        return result.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function changeCompanyAccessRole({ actorId, userId, companyId, accessRole }) {
    assertAccessRole(accessRole);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockMembershipTarget(client, userId, companyId);
        const membership = await client.query(`SELECT access_role FROM company_users WHERE user_id = $1 AND company_id = $2 FOR UPDATE`, [userId, companyId]);
        if (!membership.rows[0]) throw new Error("Company access not found");
        if (membership.rows[0].access_role === "OWNER" && accessRole === "CONSUMER") {
            const owners = await client.query(`SELECT COUNT(*)::int AS count FROM company_users WHERE company_id = $1 AND access_role = 'OWNER'`, [companyId]);
            if (owners.rows[0].count <= 1) throw new Error("This user is the last owner of this company. Assign another owner before changing access.");
        }
        const result = await client.query(`UPDATE company_users SET access_role = $3, updated_at = NOW() WHERE user_id = $1 AND company_id = $2 RETURNING company_id AS "companyId", user_id AS "userId", access_role AS "accessRole"`, [userId, companyId, accessRole]);
        await writeAudit(client, { actorId, action: "COMPANY_ACCESS_ROLE_CHANGED", targetType: "user", targetId: userId, changes: { companyId: String(companyId), from: membership.rows[0].access_role, accessRole } });
        await client.query("COMMIT");
        return result.rows[0];
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function removeCompanyAccess({ actorId, userId, companyId }) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        assertUserId(userId); assertCompanyId(companyId);
        const membership = await client.query(`SELECT access_role FROM company_users WHERE user_id = $1 AND company_id = $2 FOR UPDATE`, [userId, companyId]);
        if (!membership.rows[0]) throw new Error("Company access not found");
        await client.query(`SELECT id FROM companies WHERE id = $1 FOR UPDATE`, [companyId]);
        if (membership.rows[0].access_role === "OWNER") {
            const owners = await client.query(`SELECT COUNT(*)::int AS count FROM company_users WHERE company_id = $1 AND access_role = 'OWNER'`, [companyId]);
            if (owners.rows[0].count <= 1) throw new Error("This user is the last owner of this company. Assign another owner before removing access.");
        }
        await client.query(`DELETE FROM company_users WHERE user_id = $1 AND company_id = $2`, [userId, companyId]);
        await writeAudit(client, { actorId, action: "COMPANY_ACCESS_REMOVED", targetType: "user", targetId: userId, changes: { companyId: String(companyId), accessRole: membership.rows[0].access_role } });
        await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
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

export async function clearUserData({ actorId, userId }) {
    assertUserId(userId);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const user = await client.query(`SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);
        if (!user.rows[0]) throw new Error("User not found");

        const documents = await client.query(`SELECT id FROM documents WHERE user_id = $1 FOR UPDATE`, [userId]);
        const documentIds = documents.rows.map(row => row.id);
        const documentParams = [documentIds];
        const deleted = {};
        const deleteByDocumentId = async (table) => {
            const result = await client.query(`DELETE FROM ${table} WHERE document_id = ANY($1::bigint[])`, documentParams);
            deleted[table] = result.rowCount;
        };

        await deleteByDocumentId("document_rows");
        await deleteByDocumentId("financial_metrics");
        await deleteByDocumentId("calculated_metrics");
        await deleteByDocumentId("metric_variance_alerts");
        const rowChanges = await client.query(`DELETE FROM row_change_log WHERE document_id = ANY($1::bigint[]) OR previous_document_id = ANY($1::bigint[])`, documentParams);
        deleted.row_change_log = rowChanges.rowCount;
        const userDocuments = await client.query(`DELETE FROM user_documents WHERE user_id = $1 OR document_id = ANY($2::bigint[])`, [userId, documentIds]);
        deleted.user_documents = userDocuments.rowCount;
        const storageLogs = await client.query(`DELETE FROM user_storage_logs WHERE user_id = $1 OR extraction_id = ANY($2::bigint[])`, [userId, documentIds]);
        deleted.user_storage_logs = storageLogs.rowCount;
        const tables = await client.query(`DELETE FROM document_tables WHERE document_id = ANY($1::bigint[])`, documentParams);
        deleted.document_tables = tables.rowCount;
        const removedDocuments = await client.query(`DELETE FROM documents WHERE user_id = $1 RETURNING id`, [userId]);
        deleted.documents = removedDocuments.rowCount;

        await client.query(`UPDATE users SET uploads_used = 0, upload_count = 0, storage_used_mb = 0, updated_at = NOW() WHERE user_id = $1`, [userId]);
        const summary = {
            documents: deleted.documents,
            financialMetrics: deleted.financial_metrics,
            documentRows: deleted.document_rows,
            documentTables: deleted.document_tables,
            calculatedMetrics: deleted.calculated_metrics,
            metricVarianceAlerts: deleted.metric_variance_alerts,
            rowChangeLog: deleted.row_change_log,
            userDocuments: deleted.user_documents,
            userStorageLogs: deleted.user_storage_logs
        };
        await writeAudit(client, { actorId, action: "CLEAR_USER_DATA", targetType: "user", targetId: userId, changes: summary });
        await client.query("COMMIT");
        return summary;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function permanentlyDeleteUser({ actorId, userId }) {
    assertUserId(userId);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const user = await client.query(`SELECT user_id, role FROM users WHERE user_id = $1 FOR UPDATE`, [userId]);
        if (!user.rows[0]) throw new Error("User not found");
        if (userId === actorId) throw new Error("You cannot permanently delete your own account");
        if (user.rows[0].role === "admin") {
            const admins = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_deleted = FALSE`);
            if (admins.rows[0].count <= 1) throw new Error("Cannot delete the last administrator");
        }
        const documents = await client.query(`SELECT id FROM documents WHERE user_id = $1 FOR UPDATE`, [userId]);
        for (const document of documents.rows) await deleteDocumentWithClient(client, document.id);
        await client.query(`DELETE FROM user_documents WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM user_storage_logs WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM user_subscriptions WHERE user_id = $1`, [userId]);
        await client.query(`DELETE FROM company_users WHERE user_id = $1`, [userId]);
        await writeAudit(client, { actorId, action: "USER_PERMANENTLY_DELETED", targetType: "user", targetId: userId, changes: { role: user.rows[0].role } });
        await client.query(`DELETE FROM users WHERE user_id = $1`, [userId]);
        await client.query("COMMIT");
        return { userId };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function permanentlyDeleteUsers({ actorId, userIds }) {
    if (!Array.isArray(userIds) || userIds.length === 0 || userIds.length > 500) throw new Error("Invalid user list");
    const uniqueUserIds = [...new Set(userIds)];
    uniqueUserIds.forEach(assertUserId);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const users = await client.query(`SELECT user_id, role FROM users WHERE user_id = ANY($1::text[]) ORDER BY user_id FOR UPDATE`, [uniqueUserIds]);
        if (users.rows.length !== uniqueUserIds.length) throw new Error("One or more users were not found");
        if (uniqueUserIds.includes(actorId)) throw new Error("You cannot permanently delete your own account");
        const selectedAdmins = users.rows.filter(user => user.role === "admin").length;
        if (selectedAdmins) {
            const admins = await client.query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_deleted = FALSE`);
            if (admins.rows[0].count <= selectedAdmins) throw new Error("Cannot delete the last administrator");
        }
        for (const user of users.rows) {
            const documents = await client.query(`SELECT id FROM documents WHERE user_id = $1 FOR UPDATE`, [user.user_id]);
            for (const document of documents.rows) await deleteDocumentWithClient(client, document.id);
            await client.query(`DELETE FROM user_documents WHERE user_id = $1`, [user.user_id]);
            await client.query(`DELETE FROM user_storage_logs WHERE user_id = $1`, [user.user_id]);
            await client.query(`DELETE FROM user_subscriptions WHERE user_id = $1`, [user.user_id]);
            await client.query(`DELETE FROM company_users WHERE user_id = $1`, [user.user_id]);
            await writeAudit(client, { actorId, action: "USER_PERMANENTLY_DELETED", targetType: "user", targetId: user.user_id, changes: { role: user.role } });
            await client.query(`DELETE FROM users WHERE user_id = $1`, [user.user_id]);
        }
        await client.query("COMMIT");
        return { users: uniqueUserIds, count: uniqueUserIds.length };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function clearAuditLogs({ actorId }) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const deleted = await client.query(`DELETE FROM audit_logs`);
        await writeAudit(client, { actorId, action: "CLEAR_AUDIT_LOGS", targetType: "audit_log", changes: { deleted: deleted.rowCount } });
        await client.query("COMMIT");
        return { deleted: deleted.rowCount };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
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