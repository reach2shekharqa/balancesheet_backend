
import { pool } from "../db/db.js";

import {
    parsePdfWithLlamaParse
} from "./llamaParseService.js";


/* =========================================================
   MARK DOCUMENT AS COMPLETED
   ========================================================= */

export async function markDocumentCompleted({
    documentId,
    extractionPayload
}) {

    if (!documentId) {

        throw new Error(
            "Document ID is required."
        );

    }

    if (
        extractionPayload === undefined ||
        extractionPayload === null
    ) {

        throw new Error(
            "Extraction payload is required."
        );

    }

    const result =
        await pool.query(
            `
            UPDATE documents
            SET
                extraction_status = 'completed',
                extraction_payload = $1
            WHERE id = $2

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
            [
                extractionPayload,
                documentId
            ]
        );

    if (result.rows.length === 0) {

        throw new Error(
            `Document ${documentId} was not found.`
        );

    }

    return result.rows[0];
}


/* =========================================================
   MARK DOCUMENT AS FAILED
   ========================================================= */

export async function markDocumentFailed({
    documentId,
    errorMessage
}) {

    if (!documentId) {

        throw new Error(
            "Document ID is required."
        );

    }

    const result =
        await pool.query(
            `
            UPDATE documents
            SET
                extraction_status = 'failed',
                extraction_payload = $1
            WHERE id = $2

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
            [
                {
                    error: String(
                        errorMessage ??
                        "Unknown extraction error"
                    )
                },
                documentId
            ]
        );

    if (result.rows.length === 0) {

        throw new Error(
            `Document ${documentId} was not found.`
        );

    }

    return result.rows[0];
}


/* =========================================================
   EXTRACT DOCUMENT
   =========================================================
   
   IMPORTANT:
   This function is called ONLY after the upload/cache
   orchestration has determined that parsing is required.
   
   It must NOT perform cache checks itself.
   ========================================================= */

export async function extractDocument({
    documentId,
    filePath
}) {

    if (!documentId) {

        throw new Error(
            "Document ID is required."
        );

    }

    if (!filePath) {

        throw new Error(
            "File path is required."
        );

    }


    console.log(
        "========================================"
    );

    console.log(
        "DOCUMENT EXTRACTION START"
    );

    console.log(
        "Document ID:",
        documentId
    );

    console.log(
        "File:",
        filePath
    );

    console.log(
        "========================================"
    );


    try {

        /*
         * This is the ONLY call that starts
         * the real LlamaParse extraction.
         */

        const parsed =
            await parsePdfWithLlamaParse(
                filePath
            );


        /*
         * Store the parser result in JSONB.
         */

        const extractionPayload = {

            parser:
                "llamaparse",

            markdown:
                parsed.markdown,

            pageCount:
                parsed.pageCount

        };


        /*
         * Mark the document completed only
         * after LlamaParse succeeds.
         */

        const document =
            await markDocumentCompleted({

                documentId,

                extractionPayload

            });


        console.log(
            "Document extraction completed."
        );


        return document;

    } catch (error) {

        /*
         * IMPORTANT:
         *
         * If LlamaParse fails, the document becomes
         * FAILED rather than incorrectly remaining
         * PENDING.
         */

        await markDocumentFailed({

            documentId,

            errorMessage:
                error?.message ??
                String(error)

        });


        console.error(
            "========================================"
        );

        console.error(
            "DOCUMENT EXTRACTION FAILED"
        );

        console.error(
            "Error object:",
            error
        );

        console.error(
            "Error name:",
            error?.name
        );

        console.error(
            "Error message:",
            error?.message
        );

        console.error(
            "Error stack:",
            error?.stack
        );

        console.error(
            "Error cause:",
            error?.cause
        );

        console.error(
            "Error keys:",
            error
                ? Object.getOwnPropertyNames(error)
                : []
        );

        console.error(
            "========================================"
        );


        throw error;

    }
}


/* =========================================================
   GET DOCUMENT
   ========================================================= */

export async function getDocumentById(
    documentId
) {

    const result =
        await pool.query(
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
            WHERE id = $1
            `,
            [
                documentId
            ]
        );

    return result.rows[0] ?? null;
}

