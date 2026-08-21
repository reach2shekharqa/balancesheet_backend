import { pool } from "../db/db.js";


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

export async function getUserDocuments({ userId }) {

    const startedAt = Date.now();

    console.log("[USER DOCS DEBUG] query starting", {
        userId
    });

    try {

        const result = await pool.query(
            `
            SELECT
                d.id,
                d.original_filename,
                d.file_size_mb,
                d.extraction_status,
                d.uploaded_at,
                ud.created_at AS linked_at
            FROM user_documents ud
            INNER JOIN documents d
                ON d.id = ud.document_id
            WHERE ud.user_id = $1
            ORDER BY ud.created_at DESC, d.id DESC
            `,
            [userId]
        );

        console.log("[USER DOCS DEBUG] query completed", {
            rows: result.rows.length,
            elapsedMs: Date.now() - startedAt
        });

        return result.rows;

    } catch (error) {

        console.error("[USER DOCS DEBUG] query failed", {
            message: error?.message,
            stack: error?.stack,
            elapsedMs: Date.now() - startedAt
        });

        throw error;
    }
}