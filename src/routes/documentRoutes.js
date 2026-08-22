import express from "express";
import multer from "multer";

import {
    processDocumentUpload
} from "../services/documentUploadService.js";
import { removeUploadedFile } from "../services/fileUploadService.js";
import { getUserDocuments } from "../services/userDocumentService.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getUserUploadQuota } from "../services/planService.js";


const router = express.Router();


const upload = multer({
    dest: "uploads/",
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
        callback(isPdf ? null : new Error("Only PDF uploads are accepted."), isPdf);
    }
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
    "/quota",
    requireAuth,
    async (req, res) => {
        const quota = await getUserUploadQuota(req.user.userId);
        if (!quota) {
            return res.status(401).json({ success: false, error: "Authentication required." });
        }
        return res.json({
            success: true,
            plan: quota.plan,
            planName: quota.plan_name,
            uploadsUsed: quota.uploads_used,
            uploadQuota: quota.upload_quota,
            upgradeRequired: quota.plan !== "PLAN_250"
        });
    }
);

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

            if (error?.code === "UPLOAD_QUOTA_EXCEEDED") {
                return res.status(403).json({
                    success: false,
                    code: error.code,
                    message: error.message,
                    plan: error.details.plan,
                    uploadsUsed: error.details.uploads_used,
                    uploadQuota: error.details.upload_quota,
                    upgradeRequired: error.details.plan !== "PLAN_250"
                });
            }

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

        } finally {

            removeUploadedFile(req.file?.path);

        }

    }
);

router.post(
    "/upload-batch",
    requireAuth,
    upload.array("files[]"),
    async (req, res) => {
        if (!req.files?.length) {
            return res.status(400).json({
                success: false,
                error: "At least one PDF file is required."
            });
        }

        console.log("[UPLOAD_BATCH] received", { count: req.files.length });

        const documents = [];

        for (const file of req.files) {
            try {
                const result = await processDocumentUpload({
                    file,
                    userId: req.user.userId
                });

                documents.push({
                    documentId: result.document?.id ?? null,
                    filename: file.originalname,
                    status: result.action === "WAIT" ? "processing" : result.action === "FAILED" ? "failed" : "completed",
                    fromCache: result.action === "REUSE",
                    ...(result.error ? { error: result.error } : {})
                });
                console.log("[UPLOAD_BATCH] document", {
                    filename: file.originalname,
                    status: result.action,
                    fromCache: result.action === "REUSE"
                });
            } catch (error) {
                documents.push({
                    documentId: null,
                    filename: file.originalname,
                    status: "failed",
                    fromCache: false,
                    error: error?.message ?? String(error)
                });
            } finally {
                removeUploadedFile(file.path);
            }
        }

        return res.json({
            success: true,
            documents
        });
    }
);


export default router;