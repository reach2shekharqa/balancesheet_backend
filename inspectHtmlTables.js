import { readMarkdownFile } from "./src/parser/markdownReader.js";
import { parseHtmlTables } from "./src/parser/htmlTableParser.js";

const filePath =
    "parsed_llmindexmd/b16e3b5bfc51754dfeeff6f42754e8445793e1f3efcac9b9a0d8a3d85020d115.md";

async function main() {
    try {
        const document = await readMarkdownFile(filePath);

        const tables = parseHtmlTables(document.content);

        console.log("========================================");
        console.log("HTML TABLE PARSER");
        console.log("========================================");

        console.log("Total HTML tables:", tables.length);

        for (const table of tables.slice(0, 10)) {

            console.log("\n----------------------------------------");
            console.log(`TABLE ${table.tableIndex}`);
            console.log("----------------------------------------");

            console.log("Rows:", table.rowCount);
            console.log("Columns:", table.columnCount);

            console.log("Headers:");
            console.dir(table.headers, { depth: null });

            console.log("First 5 rows:");
            console.dir(
                table.rows.slice(0, 5),
                { depth: null }
            );
        }

        console.log("\n========================================");
        console.log("HTML TABLE PARSING COMPLETE");
        console.log("========================================");

    } catch (error) {
        console.error("HTML TABLE PARSING FAILED");
        console.error(error);
        process.exitCode = 1;
    }
}

main();