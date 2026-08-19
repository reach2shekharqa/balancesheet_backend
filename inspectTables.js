import { readMarkdownFile } from "./src/parser/markdownReader.js";
import { parseMarkdownTables } from "./src/parser/markdownTableParser.js";

const filePath =
    "parsed_llmindexmd/b16e3b5bfc51754dfeeff6f42754e8445793e1f3efcac9b9a0d8a3d85020d115.md";

async function main() {
    try {
        console.log("Starting table inspection...");

        const document = await readMarkdownFile(filePath);

        console.log("Markdown loaded.");
        console.log("Characters:", document.characterCount);
        console.log("Lines:", document.lineCount);

        const tables = parseMarkdownTables(document.content);

        console.log("========================================");
        console.log("MARKDOWN TABLE PARSER");
        console.log("========================================");
        console.log("Total tables:", tables.length);

        for (const table of tables) {
            console.log("\n----------------------------------------");
            console.log(`TABLE ${table.tableIndex}`);
            console.log("----------------------------------------");

            console.log("Start line:", table.startLine + 1);
            console.log("End line:", table.endLine + 1);
            console.log("Columns:", table.columnCount);
            console.log("Rows:", table.rowCount);

            console.log("Headers:");
            console.dir(table.headers, { depth: null });

            console.log("First 3 rows:");
            console.dir(table.rows.slice(0, 3), { depth: null });
        }

    } catch (error) {
        console.error("TABLE PARSING FAILED");
        console.error(error);
        process.exitCode = 1;
    }
}

main();