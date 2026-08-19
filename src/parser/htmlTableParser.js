import fs from "fs";

/**
 * Extract all HTML <table>...</table> blocks from Markdown/HTML content.
 *
 * Generic parser:
 * - Does not know anything about assets
 * - Does not assume table positions
 * - Does not assume specific financial metrics
 */
export function extractHtmlTables(markdown) {
    if (typeof markdown !== "string") {
        throw new TypeError("markdown must be a string");
    }

    const tables = [];

    const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;

    let match;
    let tableIndex = 0;

    while ((match = tableRegex.exec(markdown)) !== null) {
        const tableHtml = match[0];

        const rows = extractRows(tableHtml);

        if (rows.length === 0) {
            continue;
        }

        tables.push({
             tableIndex: tableIndex++,
            rows,
            rowCount: rows.length,
            columnCount: Math.max(
                0,
                ...rows.map(row =>
                    row.reduce((count, cell) => count + cell.colspan, 0)
                )
            ),
            rawHtml: tableHtml
        });
    }

    return tables;
}

/**
 * Extract <tr> elements.
 */
function extractRows(tableHtml) {
    const rows = [];

    const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        const rowHtml = rowMatch[1];

        const cells = extractCells(rowHtml);

        if (cells.length > 0) {
            rows.push(cells);
        }
    }

    return rows;
}

/**
 * Extract <th> and <td> cells.
 */
function extractCells(rowHtml) {
    const cells = [];

    const cellRegex =
        /<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const type = cellMatch[1].toLowerCase();
        const attributes = cellMatch[2];
        const rawContent = cellMatch[3];

        const colspan = getColspan(attributes);

        cells.push({
            type,
            text: cleanText(rawContent),
            colspan,
            rawHtml: rawContent
        });
    }

    return cells;
}

/**
 * Read colspan safely.
 */
function getColspan(attributes) {
    const match = attributes.match(
        /colspan\s*=\s*["']?(\d+)["']?/i
    );

    if (!match) {
        return 1;
    }

    const value = Number(match[1]);

    return Number.isInteger(value) && value > 0
        ? value
        : 1;
}

/**
 * Convert HTML cell content into readable text.
 */
function cleanText(value) {
    return value
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/gi, "&")
        .replace(/&nbsp;/gi, " ")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Convenience helper for reading a Markdown file directly.
 */
export function extractHtmlTablesFromFile(filePath) {
    const markdown = fs.readFileSync(filePath, "utf8");

    return extractHtmlTables(markdown);
}