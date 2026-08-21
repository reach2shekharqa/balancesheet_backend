import express from "express";
import multer from "multer";

import {
    processDocumentUpload
} from "../services/documentUploadService.js";
import { getUserDocuments } from "../services/userDocumentService.js";
import { requireAuth } from "../middleware/authMiddleware.js";


const router = express.Router();


const upload = multer({
    dest: "uploads/"
});

const uploadWithDebug = (req, res, next) => {

    const uploadStartedAt = Date.now();
    let uploadCompleted = false;
    let requestClosedLogged = false;

    const elapsedMilliseconds = () =>
        Date.now() - uploadStartedAt;

    const logRequestClosed = () => {

        if (uploadCompleted || requestClosedLogged) {

            return;

        }

        requestClosedLogged = true;

        console.error(
            "[UPLOAD DEBUG] request closed before upload completed",
            {
                elapsedMilliseconds: elapsedMilliseconds()
            }
        );

    };

    const longUploadTimer = setTimeout(() => {

        if (!uploadCompleted) {

            console.warn(
                "[UPLOAD DEBUG] upload stage unusually long",
                {
                    elapsedMilliseconds: elapsedMilliseconds()
                }
            );

        }

    }, 30000);

    req.once("aborted", logRequestClosed);
    req.once("close", logRequestClosed);

    console.log(
        "[UPLOAD DEBUG] request received"
    );

    upload.single("file")(req, res, (error) => {

        uploadCompleted = true;
        clearTimeout(longUploadTimer);

        if (error) {

            console.error(
                "[UPLOAD DEBUG] multer error",
                {
                    elapsedMilliseconds: elapsedMilliseconds(),
                    error: error?.message ?? String(error)
                }
            );

            return next(error);

        }

        console.log(
            "[UPLOAD DEBUG] multer completed",
            {
                elapsedMilliseconds: elapsedMilliseconds(),
                originalFilename: req.file?.originalname,
                fileSize: req.file?.size,
                temporaryFilePath: req.file?.path
            }
        );

        return next();

    });
};

router.get(
    "/",
    requireAuth,
    async (req, res) => {

        const startedAt = Date.now();

        console.log("[DOCUMENTS DEBUG] GET /api/documents handler entered");

        try {

            console.log("[DOCUMENTS DEBUG] authenticated user", {
                userId: req.user?.userId
            });

            console.log("[DOCUMENTS DEBUG] calling getUserDocuments");

            const documents = await getUserDocuments({
                userId: req.user.userId
            });

            console.log("[DOCUMENTS DEBUG] getUserDocuments completed", {
                count: documents.length,
                elapsedMs: Date.now() - startedAt
            });

            console.log("[DOCUMENTS DEBUG] sending response");

            return res.json({
                success: true,
                documents
            });

        } catch (error) {

            console.error("[DOCUMENTS DEBUG] Document list failed", {
                message: error?.message,
                stack: error?.stack,
                elapsedMs: Date.now() - startedAt
            });

            return res.status(500).json({
                success: false,
                error: error?.message ?? String(error)
            });
        }
    }
);


router.post(
    "/upload",
    requireAuth,
    uploadWithDebug,
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error: "PDF file is required."
                });

            }


            const userId = req.user.userId;


            const result =
                await processDocumentUpload({

                    file: req.file,

                    userId

                });

            console.log(
                "[UPLOAD DEBUG] sending upload response"
            );


            return res.json({

                success: true,

                ...result

            });

        } catch (error) {

            console.error(
                "[UPLOAD DEBUG] route error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error?.message ??
                    String(error)

            });

        }

    }
);


export default router;