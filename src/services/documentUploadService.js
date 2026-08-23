import {
    calculateFileHash,
    getDocumentCacheStatus,
    findReadyDocumentByHash
} from "./documentCacheService.js";

import { pool } from "../db/db.js";

import {
    processUploadedFile,
    removeUploadedFile
} from "./fileUploadService.js";

import {
    linkDocumentToUser
} from "./userDocumentService.js";

import {
    processPendingDocument
} from "./documentProcessingService.js";

import { parsePdfWithLlamaParse } from "./llamaParseService.js";
import { extractIdentityFromDocument } from "./companyIdentityService.js";
import { authorizeDocumentUpload, assertCachedDocumentAuthorized, cinMismatch } from "./uploadAuthorizationService.js";

import {
    getUserUploadQuota,
    releaseUploadQuota,
    reserveUploadQuota
} from "./planService.js";




export async function checkUploadedDocument(filePath, authorization) {

    const fileHash = calculateFileHash(filePath);

    const cache = await getDocumentCacheStatus(fileHash, authorization.type === "COMPANY"
        ? { companyId: authorization.companyId }
        : { independent: true, userId: authorization.userId });

    if (cache.status === "READY") {

        return {
            action: "REUSE",
            fileHash,
            document: cache.document
        };

    }

    if (cache.status === "PENDING") {

        return {
            action: "WAIT",
            fileHash,
            document: cache.document
        };

    }

    if (cache.status === "FAILED") {

        return {
            action: "RETRY",
            fileHash,
            document: cache.document
        };

    }

    return {
        action: "PARSE",
        fileHash,
        document: null
    };
}


/* =========================================================
   CREATE PENDING DOCUMENT
   ========================================================= */

export async function createPendingDocument({
    fileHash,
    userId,
    companyId = null,
    originalFilename,
    fileSizeMb
}) {

    const result = await pool.query(
        `
        INSERT INTO documents (
            file_hash,
            original_filename,
            user_id,
            file_size_mb,
            company_id,
            extraction_status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending')

        ON CONFLICT ${companyId === null
            ? "(user_id, file_hash) WHERE company_id IS NULL AND user_id IS NOT NULL"
            : "(company_id, file_hash) WHERE company_id IS NOT NULL"}
        DO NOTHING

        RETURNING
            id,
            file_hash,
            original_filename,
            user_id,
            file_size_mb,
            company_id,
            extraction_status,
            created_at
        `,
        [
            fileHash,
            originalFilename,
            userId,
            fileSizeMb,
            companyId
        ]
    );

    /*
     * INSERT succeeded.
     */
    if (result.rows.length > 0) {

        return {
            created: true,
            document: result.rows[0]
        };

    }


    /*
     * Document already exists.
     * Fetch the existing record.
     */

    const existing = await pool.query(
        `
        SELECT
            id,
            file_hash,
            original_filename,
            user_id,
            file_size_mb,
            company_id,
            extraction_status,
            extraction_payload,
            created_at
        FROM documents
                WHERE file_hash = $1
                    AND ${companyId === null ? "company_id IS NULL AND user_id = $2" : "company_id = $2"}
        `,
                [fileHash, companyId === null ? userId : companyId]
    );


    return {
        created: false,
        document: existing.rows[0] ?? null
    };
}
/* =========================================================
   PROCESS UPLOAD
   ========================================================= */

async function retryFailedDocument({
    userId,
    fileInfo,
    existingDocument,
    fileHash
}) {

    console.log(
        "RETRY START"
    );

    console.log(
        "document ID:",
        existingDocument?.id
    );


    console.log(
        "[UPLOAD DEBUG] linking document to user"
    );

    await linkDocumentToUser({
        userId,
        documentId: existingDocument.id
    });

    console.log(
        "[UPLOAD DEBUG] document linked to user"
    );


    const pendingDocument = await pool.query(
        `
        UPDATE documents
        SET
            extraction_status = 'pending',
            extraction_payload = NULL
        WHERE id = $1

        RETURNING
            id,
            file_hash,
            original_filename,
            user_id,
            file_size_mb,
            extraction_status,
            extraction_payload,
            created_at
        `,
        [existingDocument.id]
    );


    const retryDocument =
        pendingDocument.rows[0] ?? existingDocument;


    console.log(
        "RETRY -> PENDING"
    );

    console.log(
        "document ID:",
        retryDocument.id
    );


    console.log(
        "RETRY -> PROCESSING"
    );

    const extraction =
        await processPendingDocument({
            documentId:
                retryDocument.id,
            filePath:
                fileInfo.filePath
        });


    if (extraction.success) {

        console.log(
            "RETRY -> COMPLETED"
        );

        return {
            action: "COMPLETED",
            fileHash,
            document: extraction.document
        };
    }


    console.log(
        "RETRY -> FAILED"
    );

    return {
        action: "FAILED",
        fileHash,
        document: extraction.document,
        error: extraction.error
    };
}


async function processDocumentUploadPipeline({
    file,
    userId,
    companyId = null,
    authorization,
    prepared = null,
    onQuotaReserved,
    onQuotaReleased = () => {}
}) {

    console.log(
        "[UPLOAD DEBUG] processDocumentUpload started"
    );

    /*
     * STEP 1
     * Validate file and calculate SHA-256
     */

    console.log(
        "[UPLOAD DEBUG] starting file processing"
    );

    const fileInfo = prepared?.fileInfo ?? await processUploadedFile(file);

    console.log(
        "[UPLOAD DEBUG] file processing completed",
        {
            fileHash: fileInfo.fileHash,
            filePath: fileInfo.filePath
        }
    );


    /*
     * STEP 2
     * Check global document cache
     */

    console.log(
        "[UPLOAD DEBUG] checking document cache"
    );

    const cache = prepared?.cache ?? await checkUploadedDocument(fileInfo.filePath, {
        ...authorization,
        userId
    });

    assertCachedDocumentAuthorized(cache.document, authorization);

    console.log(cache.action === "REUSE" ? "[CACHE] hit" : `[CACHE] ${cache.action.toLowerCase()}`, {
        filename: fileInfo.originalFilename,
        fileHash: fileInfo.fileHash
    });

    console.log(
        "[UPLOAD DEBUG] cache result",
        {
            action: cache.action,
            fileHash: cache.fileHash,
            documentId: cache.document?.id,
            extractionStatus: cache.document?.extraction_status
        }
    );


    /*
     * =====================================================
     * CACHE HIT - READY
     * =====================================================
     */

    let parsed = prepared?.parsed ?? null;
    if (authorization.type === "INDEPENDENT") {
        if (parsed) {
            assertIndependentCin({ extraction_payload: { markdown: parsed?.markdown } });
        } else if (["REUSE", "RETRY"].includes(cache.action) && cache.document?.extraction_payload) {
            assertIndependentCin(cache.document);
        } else {
            const readySource = await findReadyDocumentByHash(fileInfo.fileHash);
            const payload = readySource?.extraction_payload;
            parsed = payload?.markdown
                ? { markdown: payload.markdown, pageCount: payload.pageCount }
                : await parsePdfWithLlamaParse(fileInfo.filePath);
            assertIndependentCin({ extraction_payload: { markdown: parsed?.markdown } });
        }
    }

    if (cache.action === "REUSE") {

        assertCompanyCin(cache.document, authorization);

        console.log(
            "[UPLOAD DEBUG] CACHE REUSE"
        );
        console.log("[LLAMAPARSE] skipped", { reason: "cache-hit", fileHash: cache.fileHash });

        removeUploadedFile(fileInfo.filePath);

        console.log(
            "[UPLOAD DEBUG] linking document to user"
        );

        await linkDocumentToUser({
            userId,
            documentId: cache.document.id
        });

        console.log(
            "[UPLOAD DEBUG] document linked to user"
        );

        return {
            action: "REUSE",
            fileHash: cache.fileHash,
            document: cache.document
        };
    }


    /*
     * =====================================================
     * CACHE HIT - PENDING
     * =====================================================
     */

    if (cache.action === "WAIT") {

        console.log("[LLAMAPARSE] skipped", { reason: "already-processing", fileHash: cache.fileHash });
        removeUploadedFile(fileInfo.filePath);

        console.log(
            "[UPLOAD DEBUG] linking document to user"
        );

        await linkDocumentToUser({
            userId,
            documentId: cache.document.id
        });

        console.log(
            "[UPLOAD DEBUG] document linked to user"
        );

        return {
            action: "WAIT",
            fileHash: cache.fileHash,
            document: cache.document
        };
    }


    /*
     * =====================================================
     * CACHE HIT - FAILED
     * =====================================================
     *
     * For now we only report RETRY.
     *
     * We will implement the actual retry state
     * transition when LlamaParse is connected.
     */

    if (cache.action === "RETRY") {

        assertCompanyCin(cache.document, authorization);

        return await retryFailedDocument({
            userId,
            fileInfo,
            existingDocument: cache.document,
            fileHash: cache.fileHash
        });
    }


    /*
     * =====================================================
     * CACHE MISS
     * =====================================================
     */

    if (authorization.type === "COMPANY") {
        parsed = prepared?.parsed ?? await parsePdfWithLlamaParse(fileInfo.filePath);
        assertCompanyCin({ extraction_payload: { markdown: parsed?.markdown } }, authorization);
    }

    await reserveQuotaOrThrow(userId);
    onQuotaReserved();

    const created =
        await createPendingDocument({
            fileHash: fileInfo.fileHash,
            userId,
            companyId,
            originalFilename: fileInfo.originalFilename,
            fileSizeMb: fileInfo.fileSizeMb
        });


    /*
     * Another request may have created
     * the document between our cache check
     * and INSERT.
     */

    const document =
        created.document;


    if (!document) {

        throw new Error(
            "Document could not be created or retrieved."
        );
    }

    if (!created.created) {
        await releaseUploadQuota(userId);
        onQuotaReleased();
        assertCachedDocumentAuthorized(document, authorization);
        if (["completed", "failed"].includes(document.extraction_status)) {
            assertCompanyCin(document, authorization);
        }
    }


    /*
     * Always link the current user.
     */

    console.log(
        "[UPLOAD DEBUG] linking document to user"
    );

    await linkDocumentToUser({
        userId,
        documentId: document.id
    });

    console.log(
        "[UPLOAD DEBUG] document linked to user"
    );


    /*
     * If another request created the document
     * first, do NOT start another parse.
     */

    if (!created.created) {

        if (
            document.extraction_status === "completed"
        ) {

            removeUploadedFile(fileInfo.filePath);

            return {
                action: "REUSE",
                fileHash: fileInfo.fileHash,
                document
            };
        }


        if (
            document.extraction_status === "pending"
        ) {

            removeUploadedFile(fileInfo.filePath);

            return {
                action: "WAIT",
                fileHash: fileInfo.fileHash,
                document
            };
        }


        if (
            document.extraction_status === "failed"
        ) {

            return await retryFailedDocument({
                userId,
                fileInfo,
                existingDocument: document,
                fileHash: fileInfo.fileHash
            });
        }
    }


    /*
     * This request successfully created
     * the PENDING document.
     *
     * LlamaParse will be connected here later.
     */

   
/*
 * =========================================================
 * NEW DOCUMENT
 * =========================================================
 *
 * This request successfully created the database row.
 *
 * Therefore this request owns the extraction job.
 *
 * No other request/user should start LlamaParse for
 * this SHA-256 because file_hash is UNIQUE.
 *
 * IMPORTANT:
 * The actual LlamaParse call is isolated inside
 * processPendingDocument().
 * =========================================================
 */

const extraction =
        await processPendingDocument({

        documentId:
            document.id,

            filePath: fileInfo.filePath,
            parsed

    });


if (extraction.success) {

    return {

        action: "COMPLETED",

        fileHash:
            fileInfo.fileHash,

        document:
            extraction.document

    };

}

/*
 * LlamaParse failed.
 *
 * The document remains in the database as FAILED.
 *
 * A future upload of the same SHA can therefore
 * be handled by the RETRY path.
 */

return {

    action: "FAILED",

    fileHash:
        fileInfo.fileHash,

    document:
        extraction.document,

    error:
        extraction.error

};


}

export function assertCompanyCin(document, authorization) {
    if (authorization.type !== "COMPANY") return;
    const identity = extractIdentityFromDocument(document);
    if (!identity.cin || identity.cin !== String(authorization.companyCin).replace(/[\s:;,#|/\-]+/g, "").toUpperCase()) {
        throw cinMismatch();
    }
}

export function assertIndependentCin(document) {
    const identity = extractIdentityFromDocument(document);
    if (!identity.cin) {
        const error = new Error("The uploaded document must contain a valid CIN.");
        error.status = 400;
        error.code = "DOCUMENT_CIN_REQUIRED";
        throw error;
    }
}

async function reserveQuotaOrThrow(userId) {
    const reservation = await reserveUploadQuota(userId);

    if (reservation) {
        return;
    }

    const quota = await getUserUploadQuota(userId);
    const error = new Error("Your upload limit has been reached.");
    error.code = "UPLOAD_QUOTA_EXCEEDED";
    error.status = quota ? 403 : 401;
    error.details = quota ?? { plan: "FREE", uploads_used: 0, upload_quota: 1 };
    throw error;
}

export async function processDocumentUpload({ file, userId, companyId = null, authorization = null, prepared = null }) {
    let quotaReserved = false;

    try {
        const uploadAuthorization = authorization ?? await authorizeDocumentUpload({ userId, companyId });
        const result = await processDocumentUploadPipeline({
            file,
            userId,
            companyId,
            authorization: uploadAuthorization,
            prepared,
            onQuotaReserved: () => {
                quotaReserved = true;
            },
            onQuotaReleased: () => {
                quotaReserved = false;
            }
        });
        if (quotaReserved && ["FAILED", "REUSE", "WAIT"].includes(result?.action)) {
            await releaseUploadQuota(userId);
        }
        return result;
    } catch (error) {
        if (quotaReserved) {
            await releaseUploadQuota(userId);
        }
        throw error;
    }
}

export async function prepareCompanyUploadBatch({ files, userId, authorization }) {
    if (authorization.type !== "COMPANY") return files.map(file => ({ file }));

    const prepared = [];
    try {
        for (const file of files) {
            const fileInfo = await processUploadedFile(file);
            const cache = await checkUploadedDocument(fileInfo.filePath, {
                ...authorization,
                userId
            });
            assertCachedDocumentAuthorized(cache.document, authorization);
            let parsed = null;
            if (cache.action === "REUSE" || cache.action === "RETRY") {
                assertCompanyCin(cache.document, authorization);
            } else if (cache.action === "PARSE") {
                parsed = await parsePdfWithLlamaParse(fileInfo.filePath);
                assertCompanyCin({ extraction_payload: { markdown: parsed?.markdown } }, authorization);
            }
            prepared.push({ fileInfo, cache, parsed });
        }
        return prepared;
    } catch (error) {
        for (const item of prepared) removeUploadedFile(item.fileInfo?.filePath);
        throw error;
    }
}

