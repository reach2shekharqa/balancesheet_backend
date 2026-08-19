import { readMarkdownFile } from "./src/parser/markdownReader.js";

const filePath =
    "parsed_llmindexmd/b16e3b5bfc51754dfeeff6f42754e8445793e1f3efcac9b9a0d8a3d85020d115.md";

async function main() {
    try {
        const document = await readMarkdownFile(filePath);

        console.log("========================================");
        console.log("MARKDOWN READER RESULT");
        console.log("========================================");

        console.log("File:", document.filePath);
        console.log("Character count:", document.characterCount);
        console.log("Line count:", document.lineCount);

        const lines = document.content.split(/\r?\n/);

        console.log("\n========== FIRST 20 LINES ==========");

        lines.slice(0, 20).forEach((line, index) => {
            console.log(`${index + 1}: ${line}`);
        });

        console.log("\n========== LAST 20 LINES ==========");

        const start = Math.max(0, lines.length - 20);

        lines.slice(start).forEach((line, index) => {
            console.log(`${start + index + 1}: ${line}`);
        });

        console.log("\n========================================");
        console.log("MARKDOWN READ SUCCESSFULLY");
        console.log("========================================");

    } catch (error) {
        console.error("\nMARKDOWN READ FAILED");
        console.error(error.message);
        process.exitCode = 1;
    }
}

main();