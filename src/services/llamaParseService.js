
import fs from "fs";
import path from "path";

import {
    LlamaParseReader
} from "@llamaindex/cloud";


/* =========================================================
   LLAMAPARSE CONFIGURATION
   ========================================================= */

const MAX_TIMEOUT_SECONDS = 600;


/* =========================================================
   PARSE PDF
   ========================================================= */

export async function parsePdfWithLlamaParse(filePath) {

    if (!filePath) {

        throw new Error(
            "PDF file path is required."
        );

    }


    const absolutePath =
        path.resolve(filePath);


    if (!fs.existsSync(absolutePath)) {

        throw new Error(
            `PDF file does not exist: ${absolutePath}`
        );

    }


    console.log(
        "========================================"
    );

    console.log(
        "REAL LLAMAPARSE"
    );

    console.log(
        "Starting LlamaParse..."
    );

    console.log(
        "File:",
        absolutePath
    );


    /*
     * IMPORTANT:
     *
     * This is the ONLY place in our application
     * that should call LlamaParse.
     *
     * The upload/cache layer decides whether this
     * function is allowed to run.
     */

    const reader =
        new LlamaParseReader({

            resultType:
                "markdown",

            apiKey:
                process.env.LLAMA_CLOUD_API_KEY,

            verbose:
                true,

            maxTimeout:
                MAX_TIMEOUT_SECONDS,

            checkInterval:
                2,

            maxCheckInterval:
                10,

            maxErrorCount:
                3,

            ignoreErrors:
                false,

            splitByPage:
                true,

            /*
             * Keep the first real test conservative.
             */

            gpt4oMode:
                false,

            useVendorMultimodalModel:
                false,

            premiumMode:
                false

        });


    /*
     * LlamaIndex FileReader accepts a file path.
     *
     * loadData() performs the upload, waits for the
     * parsing job and returns the parsed documents.
     */

    const documents =
        await reader.loadData(
            absolutePath
        );


    if (
        !documents ||
        documents.length === 0
    ) {

        throw new Error(
            "LlamaParse returned no documents."
        );

    }


    /*
     * Convert returned LlamaIndex documents
     * into one Markdown string.
     */

    const markdown =
        documents
            .map(document => {

                if (
                    typeof document?.text ===
                    "string"
                ) {

                    return document.text;

                }

                if (
                    typeof document?.getText ===
                    "function"
                ) {

                    return document.getText();

                }

                return "";

            })
            .filter(Boolean)
            .join("\n\n---\n\n");


    if (!markdown.trim()) {

        throw new Error(
            "LlamaParse returned documents but no Markdown text."
        );

    }


    console.log(
        "LlamaParse completed successfully."
    );

    console.log(
        "Documents returned:",
        documents.length
    );

    console.log(
        "Markdown characters:",
        markdown.length
    );


    return {

        pageCount:
            documents.length,

        markdown

    };

}

