import { pool } from "../db/db.js";

function documentAccessQuery({ documentFilter, select = "d.*" }) {
    return {
        text: `
            SELECT
                                ${select},
                                (
                                        SELECT ud.created_at
                                        FROM user_documents ud
                                        WHERE ud.user_id = u.user_id
                                            AND ud.document_id = d.id
                                ) AS linked_at,
                u.role AS requester_role,
                u.is_active AS requester_is_active,
                u.is_deleted AS requester_is_deleted,
                EXISTS (
                    SELECT 1
                    FROM company_users cu
                    INNER JOIN companies c ON c.id = cu.company_id
                    WHERE cu.user_id = u.user_id
                      AND cu.company_id = d.company_id
                      AND c.is_active = TRUE
                ) AS has_company_access,
                EXISTS (
                    SELECT 1
                    FROM user_documents ud
                    WHERE ud.user_id = u.user_id
                      AND ud.document_id = d.id
                ) AS has_legacy_access
            FROM documents d
            INNER JOIN users u ON u.user_id = $1
            WHERE ${documentFilter}
        `
    };
}

export function canAccessDocument(document) {
    if (!document || document.requester_is_active === false || document.requester_is_deleted === true) {
        return false;
    }

    if (document.requester_role === "admin") {
        return true;
    }

    if (document.company_id !== null && document.company_id !== undefined) {
        return document.has_company_access === true || document.has_legacy_access === true;
    }

    return document.has_legacy_access === true;
}

export async function hasCompanyAccess({ userId, companyId, db = pool }) {
    const result = await db.query(
        `
        SELECT 1
        FROM users u
        WHERE u.user_id = $1
          AND u.is_active = TRUE
          AND u.is_deleted = FALSE
          AND (
              u.role = 'admin'
              OR EXISTS (
                  SELECT 1
                  FROM company_users cu
                  INNER JOIN companies c ON c.id = cu.company_id
                  WHERE cu.user_id = u.user_id
                    AND cu.company_id = $2
                    AND c.is_active = TRUE
              )
          )
        `,
        [userId, companyId]
    );

    return result.rows.length > 0;
}

export async function canUploadCompanyDocuments({ userId, companyId, db = pool }) {
    const result = await db.query(
        `
        SELECT 1
        FROM users u
        INNER JOIN company_users cu ON cu.user_id = u.user_id
        INNER JOIN companies c ON c.id = cu.company_id
        WHERE u.user_id = $1
          AND u.is_active = TRUE
          AND u.is_deleted = FALSE
          AND cu.company_id = $2
          AND cu.access_role = 'OWNER'
          AND c.is_active = TRUE
        `,
        [userId, companyId]
    );

    return result.rows.length > 0;
}

export async function getAccessibleDocument({ userId, documentId, companyId = null, db = pool }) {
    const result = await db.query(
        documentAccessQuery({ documentFilter: "d.id = $2" }).text,
        [userId, documentId]
    );
    const document = result.rows[0];
    if (!canAccessDocument(document)) {
        return null;
    }

    if (companyId !== null && String(document.company_id) !== String(companyId)) {
        return null;
    }

    return document;
}

export async function getAccessibleDocumentsByHashes({ userId, fileHashes, db = pool }) {
    const result = await db.query(
        documentAccessQuery({ documentFilter: "d.file_hash = ANY($2::text[])" }).text,
        [userId, fileHashes]
    );
    return result.rows.filter(canAccessDocument);
}

export async function getAccessibleDocuments({ userId, companyId = null, db = pool }) {
    const documentFilter = companyId === null ? "TRUE" : "d.company_id = $2";
    const result = await db.query(
        documentAccessQuery({ documentFilter }).text,
        companyId === null ? [userId] : [userId, companyId]
    );
    return result.rows.filter(canAccessDocument);
}