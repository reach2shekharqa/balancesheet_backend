
import fs from "fs";
import path from "path";
import { calculateFileHash } from "./documentCacheService.js";

export async function processUploadedFile(file) {

    if (!file) {
        throw new Error("No file uploaded.");
    }

    if (!file.path) {
        throw new Error("Uploaded file path is missing.");
    }

    const filePath = path.resolve(file.path);

    if (!fs.existsSync(filePath)) {
        throw new Error(`Uploaded file does not exist: ${filePath}`);
    }

    const fileHash = calculateFileHash(filePath);

    const fileSizeBytes = fs.statSync(filePath).size;

    const fileSizeMb =
        Number((fileSizeBytes / (1024 * 1024)).toFixed(2));

    return {
        filePath,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes,
        fileSizeMb,
        fileHash
    };
}

export function removeUploadedFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return;
    }

    fs.unlinkSync(filePath);
}
