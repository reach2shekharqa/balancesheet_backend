import express from "express";
import multer from "multer";

import {
    processDocumentUpload,
    prepareCompanyUploadBatch
} from "../services/documentUploadService.js";
import { removeUploadedFile } from "../services/fileUploadService.js";
import { getUserDocuments } from "../services/userDocumentService.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getUserUploadQuota } from "../services/planService.js";
import { extractIdentityFromDocument } from "../services/companyIdentityService.js";
import { getAccessibleDocumentsByHashes, hasCompanyAccess } from "../services/companyAccessService.js";
import { authorizeDocumentUpload } from "../services/uploadAuthorizationService.js";


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

async function requireCompanyUploadOwner(req, res, next) {
    const companyId = req.body?.companyId || null;
    try {
        req.uploadAuthorization = await authorizeDocumentUpload({
            userId: req.user.userId,
            companyId
        });
        return next();
    } catch (error) {
        removeUploadedFile(req.file?.path);
        for (const file of req.files ?? []) removeUploadedFile(file.path);
        console.error("[UPLOAD AUTH] company permission check failed", { message: error?.message });
        return res.status(error?.status ?? 500).json({
            success: false,
            error: error?.status ? error.message : "Unable to verify company upload permission."
        });
    }
}

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

            const companyId = req.query.companyId ?? null;
            if (companyId !== null && !(await hasCompanyAccess({ userId: req.user.userId, companyId }))) {
                return res.status(403).json({ success: false, error: "You are not authorized to access this company." });
            }

            console.log("[DOCUMENTS DEBUG] calling getUserDocuments", { companyId });

            const documents = await getUserDocuments({
                userId: req.user.userId,
                companyId
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
    "/identity",
    requireAuth,
    async (req, res) => {
        const fileHashes = Array.isArray(req.body?.fileHashes) ? req.body.fileHashes : [];
        if (fileHashes.length === 0 || fileHashes.some(hash => typeof hash !== "string" || !/^[a-f0-9]{64}$/i.test(hash))) {
            return res.status(400).json({ success: false, error: "Valid file hashes are required." });
        }

        try {
            const documents = await getAccessibleDocumentsByHashes({
                userId: req.user.userId,
                fileHashes
            });
            return res.json({
                success: true,
                documents: documents
                    .filter(document => document.extraction_status === "completed" && document.extraction_payload != null)
                    .map(document => ({
                    fileHash: document.file_hash,
                    filename: document.original_filename,
                    identity: extractIdentityFromDocument(document)
                    }))
            });
        } catch (error) {
            console.error("[IDENTITY] cache lookup failed", { message: error?.message, stack: error?.stack });
            return res.status(500).json({ success: false, error: "We couldn't verify the company identity in these reports." });
        }
    }
);


router.post(
    "/upload",
    requireAuth,
    uploadWithDebug,
    requireCompanyUploadOwner,
    async (req, res) => {

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    error: "PDF file is required."
                });

            }


            const userId = req.user.userId;
            const companyId = req.body?.companyId || null;


            const result =
                await processDocumentUpload({

                    file: req.file,

                    userId,
                    companyId,
                    authorization: req.uploadAuthorization

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

            if (error?.status === 400 || error?.status === 403 || error?.status === 409) {
                return res.status(error.status).json({
                    success: false,
                    error: error.message
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
    requireCompanyUploadOwner,
    async (req, res) => {
        if (!req.files?.length) {
            return res.status(400).json({
                success: false,
                error: "At least one PDF file is required."
            });
        }

        console.log("[UPLOAD_BATCH] received", { count: req.files.length });
        const companyId = req.body?.companyId || null;

        let prepared;
        try {
            prepared = await prepareCompanyUploadBatch({
                files: req.files,
                userId: req.user.userId,
                authorization: req.uploadAuthorization
            });
        } catch (error) {
            for (const file of req.files) removeUploadedFile(file.path);
            return res.status(error?.status ?? 500).json({
                success: false,
                error: error?.status ? error.message : "Unable to verify the uploaded documents."
            });
        }

        const documents = [];

        for (const [index, file] of req.files.entries()) {
            try {
                const result = await processDocumentUpload({
                    file,
                    userId: req.user.userId,
                    companyId,
                    authorization: req.uploadAuthorization,
                    prepared: prepared[index]
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
                    error: error?.message ?? String(error),
                    ...(error?.code ? { code: error.code } : {}),
                    ...(error?.details ? {
                        plan: error.details.plan,
                        uploadsUsed: error.details.uploads_used,
                        uploadQuota: error.details.upload_quota
                    } : {})
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