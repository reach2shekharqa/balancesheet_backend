import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const MAX_PAGES = 1;
const IMAGE_DPI = 150;

function normalizeText(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

async function runCommand(command, args) {
    try {
        return await execFileAsync(command, args, {
            maxBuffer: 50 * 1024 * 1024
        });
    } catch (error) {
        const detail = error.stderr?.trim() || error.message;
        throw new Error(`${command} failed: ${detail}`);
    }
}

async function directorySizeBytes(directoryPath) {
    const entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    let total = 0;

    for (const entry of entries) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            total += await directorySizeBytes(entryPath);
        } else {
            total += (await fs.promises.stat(entryPath)).size;
        }
    }

    return total;
}

function megabytes(bytes) {
    return Number((bytes / (1024 * 1024)).toFixed(2));
}

async function removeDirectory(directoryPath) {
    await fs.promises.rm(directoryPath, { recursive: true, force: true });
}

async function processRun({ sourcePdfPath, companyName, cin, runNumber }) {
    const runDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ocr-poc-run-"));
    const runPdfPath = path.join(runDirectory, "input.pdf");
    const imagePrefix = path.join(runDirectory, "page");
    const startedAt = process.hrtime.bigint();
    const logStage = (stage, details = {}) => {
        console.log(`[OCR POC] ${stage}`, {
            run: runNumber,
            elapsedMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
            ...details
        });
    };
    let peakRss = process.memoryUsage().rss;
    let sampleTimer;

    const sampleMemory = () => {
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
    };

    try {
        sampleTimer = setInterval(sampleMemory, 25);
        await fs.promises.copyFile(sourcePdfPath, runPdfPath);
        logStage("temp PDF created", { path: runPdfPath });

        const imageStartedAt = process.hrtime.bigint();
        logStage("page conversion started", { dpi: IMAGE_DPI });
        await runCommand("pdftoppm", [
            "-f", "1",
            "-l", String(MAX_PAGES),
            "-r", String(IMAGE_DPI),
            "-png",
            runPdfPath,
            imagePrefix
        ]);
        const imageMilliseconds = Number(process.hrtime.bigint() - imageStartedAt) / 1e6;
        logStage("page conversion finished", { stageElapsedMs: imageMilliseconds });

        const imageFiles = (await fs.promises.readdir(runDirectory))
            .filter(fileName => /^page-\d+\.png$/.test(fileName))
            .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

        if (imageFiles.length === 0) {
            throw new Error("PDF renderer produced no page images.");
        }

        const ocrStartedAt = process.hrtime.bigint();
        const pageTexts = [];
        for (const [pageIndex, imageFile] of imageFiles.entries()) {
            const pageStartedAt = process.hrtime.bigint();
            logStage("Tesseract page started", { page: pageIndex + 1, file: imageFile });
            const { stdout } = await runCommand("tesseract", [
                path.join(runDirectory, imageFile),
                "stdout",
                "--psm", "6"
            ]);
            pageTexts.push(stdout);
            logStage("Tesseract page finished", {
                page: pageIndex + 1,
                file: imageFile,
                stageElapsedMs: Number(process.hrtime.bigint() - pageStartedAt) / 1e6
            });
        }
        const ocrMilliseconds = Number(process.hrtime.bigint() - ocrStartedAt) / 1e6;
        const ocrText = pageTexts.join("\n");
        logStage("OCR completed", { pages: imageFiles.length, characters: ocrText.length });
        const totalMilliseconds = Number(process.hrtime.bigint() - startedAt) / 1e6;

        sampleMemory();
        const temporaryDiskBytes = await directorySizeBytes(runDirectory);
        return {
            run: runNumber,
            pagesProcessed: imageFiles.length,
            pdfToImageSeconds: Number((imageMilliseconds / 1000).toFixed(3)),
            ocrSeconds: Number((ocrMilliseconds / 1000).toFixed(3)),
            totalSeconds: Number((totalMilliseconds / 1000).toFixed(3)),
            peakRamMb: megabytes(peakRss),
            temporaryDiskMb: megabytes(temporaryDiskBytes),
            characters: ocrText.length,
            companyName: normalizeText(companyName) && normalizeText(ocrText).includes(normalizeText(companyName)) ? "FOUND" : "NOT FOUND",
            cin: normalizeText(cin) && normalizeText(ocrText).includes(normalizeText(cin)) ? "FOUND" : "NOT FOUND"
        };
    } finally {
        if (sampleTimer) {
            clearInterval(sampleTimer);
        }
        await removeDirectory(runDirectory);
        logStage("cleanup", { path: runDirectory });
    }
}

export async function verifyOcrDependencies() {
    await runCommand("pdftoppm", ["-v"]);
    await runCommand("tesseract", ["--version"]);
    return true;
}

export async function runOcrPoc({ pdfPath, companyName, cin }) {
    const runs = [];
    for (let runNumber = 1; runNumber <= 1; runNumber += 1) {
        runs.push(await processRun({ sourcePdfPath: pdfPath, companyName, cin, runNumber }));
    }

    const average = key => Number((runs.reduce((sum, run) => sum + run[key], 0) / runs.length).toFixed(3));
    return {
        title: "OCR POC RESULT",
        pagesProcessed: runs[0].pagesProcessed,
        maximumPages: MAX_PAGES,
        runs,
        averages: {
            pdfToImageSeconds: average("pdfToImageSeconds"),
            ocrSeconds: average("ocrSeconds"),
            totalSeconds: average("totalSeconds"),
            peakRamMb: average("peakRamMb"),
            temporaryDiskMb: average("temporaryDiskMb"),
            characters: average("characters")
        }
    };
}