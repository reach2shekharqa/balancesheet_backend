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
export async function getDocumentCacheStatus(fileHash, ownership) {

    const document = await findDocumentByHash(fileHash, ownership);

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

export async function findDocumentByHash(fileHash, ownership) {
    const ownershipPredicate = ownership?.companyId !== undefined && ownership?.companyId !== null
        ? "company_id = $2"
        : ownership?.independent === true && ownership?.userId !== undefined
            ? "company_id IS NULL AND user_id = $2"
            : null;

    if (!ownershipPredicate) {
        throw new Error("Document cache lookup requires an ownership scope.");
    }

    const result = await pool.query(
        `
        SELECT
            id,
            file_hash,
            user_id,
            original_filename,
            company_id,
            extraction_status,
            extraction_payload,
            created_at
        FROM documents
                WHERE file_hash = $1
                    AND ${ownershipPredicate}
        LIMIT 1
        `,
                [fileHash, ownership.companyId ?? ownership.userId]
    );

    return result.rows[0] ?? null;
}

export async function findReadyDocumentByHash(fileHash) {
    const result = await pool.query(
        `
        SELECT extraction_payload
        FROM documents
        WHERE file_hash = $1
          AND extraction_status = 'completed'
          AND extraction_payload IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
        `,
        [fileHash]
    );

    return result.rows[0] ?? null;
}