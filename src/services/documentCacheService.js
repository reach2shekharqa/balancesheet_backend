import crypto from "crypto";
import fs from "fs";
import { pool } from "../db/db.js";

export function calculateFileHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);

    return crypto
        .createHash("sha256")
        .update(fileBuffer)
        .digest("hex");
}
export async function getDocumentCacheStatus(fileHash) {

    const document = await findDocumentByHash(fileHash);

    if (!document) {
        return {
            status: "MISS",
            document: null
        };
    }

    if (
        document.extraction_status === "completed" &&
        document.extraction_payload
    ) {
        return {
            status: "READY",
            document
        };
    }

    if (document.extraction_status === "pending") {
        return {
            status: "PENDING",
            document
        };
    }

    if (document.extraction_status === "failed") {
        return {
            status: "FAILED",
            document
        };
    }

    return {
        status: "UNKNOWN",
        document
    };
}

export async function findDocumentByHash(fileHash) {

    const result = await pool.query(
        `
        SELECT
            id,
            file_hash,
            original_filename,
            extraction_status,
            extraction_payload,
            created_at
        FROM documents
        WHERE file_hash = $1
        ORDER BY id DESC
        LIMIT 1
        `,
        [fileHash]
    );

    return result.rows[0] ?? null;
}