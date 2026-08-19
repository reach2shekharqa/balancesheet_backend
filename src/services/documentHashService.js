import fs from "fs";
import crypto from "crypto";
import { query } from "../db/db.js";

export function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(filePath);

        stream.on("error", reject);

        stream.on("data", chunk => {
            hash.update(chunk);
        });

        stream.on("end", () => {
            resolve(hash.digest("hex"));
        });
    });
}

export async function findDocumentByHash(fileHash) {
    const result = await query(
        `
        SELECT
            id,
            file_hash,
            original_filename,
            extraction_status,
            extraction_payload,
            user_id,
            file_size_mb,
            created_at
        FROM documents
        WHERE file_hash = $1
        LIMIT 1
        `,
        [fileHash]
    );

    return result.rows[0] ?? null;
}