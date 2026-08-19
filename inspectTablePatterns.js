import { readMarkdownFile } from "./src/parser/markdownReader.js";

const filePath =
    "parsed_llmindexmd/b16e3b5bfc51754dfeeff6f42754e8445793e1f3efcac9b9a0d8a3d85020d115.md";

async function main() {
    const document = await readMarkdownFile(filePath);
    const lines = document.content.split(/\r?\n/);

    console.log("========================================");
    console.log("MARKDOWN STRUCTURE INSPECTION");
    console.log("========================================");

    console.log("Total lines:", lines.length);

    console.log("\n========== HEADINGS ==========");

    const headings = lines
        .map((line, index) => ({
            lineNumber: index + 1,
            text: line.trim()
        }))
        .filter(item => /^#{1,6}\s+/.test(item.text));

    console.log("Heading count:", headings.length);

    headings.slice(0, 100).forEach(item => {
        console.log(`${item.lineNumber}: ${item.text}`);
    });

    console.log("\n========== PIPE CHARACTER LINES ==========");

    const pipeLines = lines
        .map((line, index) => ({
            lineNumber: index + 1,
            text: line
        }))
        .filter(item => item.text.includes("|"));

    console.log("Pipe-line count:", pipeLines.length);

    pipeLines.slice(0, 50).forEach(item => {
        console.log(`${item.lineNumber}: ${item.text}`);
    });

    console.log("\n========== HTML TABLE TAGS ==========");

    const htmlTableLines = lines
        .map((line, index) => ({
            lineNumber: index + 1,
            text: line
        }))
        .filter(item =>
            /<table|<\/table>|<tr|<\/tr>|<td|<\/td>|<th|<\/th>/i.test(
                item.text
            )
        );

    console.log("HTML-table-line count:", htmlTableLines.length);

    htmlTableLines.slice(0, 100).forEach(item => {
        console.log(`${item.lineNumber}: ${item.text}`);
    });

    console.log("\n========== ASSET KEYWORDS ==========");

    const assetKeywords = [
        "assets",
        "property",
        "plant",
        "equipment",
        "cash",
        "inventory",
        "receivable",
        "debtor",
        "current assets",
        "non-current assets"
    ];

    for (const keyword of assetKeywords) {
        const matches = lines
            .map((line, index) => ({
                lineNumber: index + 1,
                text: line
            }))
            .filter(item =>
                item.text.toLowerCase().includes(keyword)
            );

        console.log(`\n"${keyword}" -> ${matches.length} matches`);

        matches.slice(0, 10).forEach(item => {
            console.log(`${item.lineNumber}: ${item.text}`);
        });
    }

    console.log("\n========================================");
    console.log("INSPECTION COMPLETE");
    console.log("========================================");
}

main().catch(error => {
    console.error("INSPECTION FAILED");
    console.error(error);
    process.exitCode = 1;
});