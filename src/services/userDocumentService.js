import { pool } from "../db/db.js";
import { getAccessibleDocuments } from "./companyAccessService.js";


/* =========================================================
   LINK DOCUMENT TO USER
   ========================================================= */

export async function linkDocumentToUser({
    userId,
    documentId
}) {

    const result = await pool.query(
        `
        INSERT INTO user_documents (
            user_id,
            document_id
        )
        VALUES ($1, $2)

        ON CONFLICT (user_id, document_id)
        DO UPDATE SET created_at = NOW()

        RETURNING
            id,
            user_id,
            document_id,
            created_at
        `,
        [
            userId,
            documentId
        ]
    );


    /*
     * New relationship created.
     */

    if (result.rows.length > 0) {

        return {
            created: true,
            relation: result.rows[0]
        };

    }


    /*
     * Relationship already exists.
     */

    const existing = await pool.query(
        `
        SELECT
            id,
            user_id,
            document_id,
            created_at
        FROM user_documents
        WHERE user_id = $1
          AND document_id = $2
        `,
        [
            userId,
            documentId
        ]
    );


    return {
        created: false,
        relation: existing.rows[0] ?? null
    };
}

export async function getUserDocuments({ userId, companyId = null }) {

    const startedAt = Date.now();

    console.log("[USER DOCS DEBUG] query starting", {
        userId,
        companyId
    });

    try {

        const documents = await getAccessibleDocuments({ userId, companyId });
        const result = documents
            .map(document => ({
                id: document.id,
                original_filename: document.original_filename,
                file_size_mb: document.file_size_mb,
                extraction_status: document.extraction_status,
                uploaded_at: document.uploaded_at,
                linked_at: document.linked_at
            }))
            .sort((left, right) => {
                const leftDate = left.linked_at ?? left.uploaded_at ?? 0;
                const rightDate = right.linked_at ?? right.uploaded_at ?? 0;
                return new Date(rightDate) - new Date(leftDate) || right.id - left.id;
            });

        console.log("[USER DOCS DEBUG] query completed", {
            rows: result.length,
            elapsedMs: Date.now() - startedAt
        });

        return result;

    } catch (error) {

        console.error("[USER DOCS DEBUG] query failed", {
            message: error?.message,
            stack: error?.stack,
            elapsedMs: Date.now() - startedAt
        });

        throw error;
    }
}