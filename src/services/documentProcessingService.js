
import {
    parsePdfWithLlamaParse
} from "./llamaParseService.js";

import {
    markDocumentCompleted,
    markDocumentFailed
} from "./documentExtractionService.js";


/* =========================================================
   PROCESS PENDING DOCUMENT
   ========================================================= */

export async function processPendingDocument({
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
            "PDF file path is required."
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


    try {

        /*
         * =====================================================
         * STEP 1
         * Call LlamaParse
         *
         * IMPORTANT:
         *
         * This function should ONLY be called for a document
         * that has already passed the SHA-256 cache check and
         * has a PENDING database record.
         * =====================================================
         */

        console.log("[LLAMAPARSE] extracting", { documentId });

        const parsed =
            await parsePdfWithLlamaParse(
                filePath
            );


        if (!parsed) {

            throw new Error(
                "LlamaParse returned no result."
            );

        }


        /*
         * =====================================================
         * STEP 2
         * Prepare extraction payload
         * =====================================================
         */

        const extractionPayload = {

            parser:
                "llamaparse",

            pageCount:
                parsed.pageCount ?? null,

            markdown:
                parsed.markdown

        };


        /*
         * =====================================================
         * STEP 3
         * Save extraction
         * =====================================================
         */

        const completed =
            await markDocumentCompleted({

                documentId,

                extractionPayload

            });


        console.log(
            "Document extraction completed."
        );


        return {

            success: true,

            status:
                "completed",

            document:
                completed

        };

    } catch (error) {

        console.error(
            "Document extraction failed:"
        );

        console.error(
            error
        );


        /*
         * =====================================================
         * STEP 4
         * Mark document FAILED
         * =====================================================
         */

        const failed =
            await markDocumentFailed({

                documentId,

                errorMessage:
                    error.message

            });


        return {

            success: false,

            status:
                "failed",

            document:
                failed,

            error:
                error.message

        };

    }

}

