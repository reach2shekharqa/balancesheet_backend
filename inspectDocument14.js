import { pool } from "./src/db/db.js";

const result = await pool.query(
    SELECT
        id,
        extraction_status,
        extraction_payload
    FROM documents
    WHERE id = 14
);

console.dir(result.rows, { depth: null });

await pool.end();
