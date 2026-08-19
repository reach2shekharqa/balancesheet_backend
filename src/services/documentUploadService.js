import {
    calculateFileHash,
    getDocumentCacheStatus
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




export async function checkUploadedDocument(filePath) {

    const fileHash = calculateFileHash(filePath);

    const cache = await getDocumentCacheStatus(fileHash);

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
            extraction_status
        )
        VALUES ($1, $2, $3, $4, 'pending')

        ON CONFLICT (file_hash)
        DO NOTHING

        RETURNING
            id,
            file_hash,
            original_filename,
            user_id,
            file_size_mb,
            extraction_status,
            created_at
        `,
        [
            fileHash,
            originalFilename,
            userId,
            fileSizeMb
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
            extraction_status,
            extraction_payload,
            created_at
        FROM documents
        WHERE file_hash = $1
        `,
        [fileHash]
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


    await linkDocumentToUser({
        userId,
        documentId: existingDocument.id
    });


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


export async function processDocumentUpload({
    file,
    userId
}) {

    /*
     * STEP 1
     * Validate file and calculate SHA-256
     */

    const fileInfo =
        await processUploadedFile(file);


    /*
     * STEP 2
     * Check global document cache
     */

    const cache =
        await checkUploadedDocument(
            fileInfo.filePath
        );


    /*
     * =====================================================
     * CACHE HIT - READY
     * =====================================================
     */

    if (cache.action === "REUSE") {

        removeUploadedFile(fileInfo.filePath);

        await linkDocumentToUser({
            userId,
            documentId: cache.document.id
        });

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

        removeUploadedFile(fileInfo.filePath);

        await linkDocumentToUser({
            userId,
            documentId: cache.document.id
        });

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

    const created =
        await createPendingDocument({
            fileHash: fileInfo.fileHash,
            userId,
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


    /*
     * Always link the current user.
     */

    await linkDocumentToUser({
        userId,
        documentId: document.id
    });


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

        filePath:
            fileInfo.filePath

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

