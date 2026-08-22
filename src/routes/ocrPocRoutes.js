import express from "express";
import multer from "multer";
import fs from "fs";

import { runOcrPoc } from "../services/ocrPocService.js";

const router = express.Router();
const upload = multer({
    dest: "tmp/ocr-poc/",
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
        callback(isPdf ? null : new Error("Only PDF uploads are accepted."), isPdf);
    }
});

router.post("/", (req, res, next) => {
    req.ocrPocStartedAt = process.hrtime.bigint();
    console.log("[OCR POC] request received", { elapsedMs: 0 });
    res.on("finish", () => {
        console.log("[OCR POC] response sent", {
            elapsedMs: Number(process.hrtime.bigint() - req.ocrPocStartedAt) / 1e6,
            status: res.statusCode
        });
    });
    next();
}, upload.single("file"), async (req, res) => {
    const uploadedPath = req.file?.path;
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: "PDF file is required." });
        }

        console.log("[OCR POC] file received", {
            elapsedMs: Number(process.hrtime.bigint() - req.ocrPocStartedAt) / 1e6,
            path: req.file.path,
            sizeBytes: req.file.size
        });

        const result = await runOcrPoc({
            pdfPath: req.file.path,
            companyName: req.body.companyName,
            cin: req.body.cin
        });

        console.log("[OCR POC] completed", result);
        return res.json({ success: true, ...result });
    } catch (error) {
        console.error("[OCR POC] failed", error);
        return res.status(500).json({ success: false, error: error.message });
    } finally {
        if (uploadedPath) {
            await fs.promises.rm(uploadedPath, { force: true });
        }
        console.log("[OCR POC] cleanup", {
            elapsedMs: Number(process.hrtime.bigint() - req.ocrPocStartedAt) / 1e6,
            path: uploadedPath || null
        });
    }
});

export default router;