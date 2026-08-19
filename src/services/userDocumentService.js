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
        DO NOTHING

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