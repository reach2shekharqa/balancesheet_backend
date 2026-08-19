/**
 * Detects Markdown tables.
 *
 * Responsibility:
 * - Identify Markdown table blocks
 * - Extract headers and rows
 *
 * Does NOT:
 * - classify financial statements
 * - detect assets
 * - map metrics
 * - resolve years
 * - access database
 */

function isTableSeparator(line) {
    return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line) {
    let value = line.trim();

    if (value.startsWith("|")) {
        value = value.slice(1);
    }

    if (value.endsWith("|")) {
        value = value.slice(0, -1);
    }

    return value.split("|").map(cell => cell.trim());
}

/**
 * Normalize Markdown row (array of strings) into generic cell objects.
 * Matches the structure expected by tableSelector and metricRowMatcher:
 * cells should have { text: "..." } property.
 */
function normalizeCells(row) {
    return row.map(cellText => ({
        text: String(cellText ?? "").trim()
    }));
}

export function parseMarkdownTables(content) {
    if (typeof content !== "string") {
        throw new TypeError("Markdown content must be a string.");
    }

    const lines = content.split(/\r?\n/);
    const tables = [];

    let i = 0;

    while (i < lines.length - 1) {
        const headerLine = lines[i];
        const separatorLine = lines[i + 1];

        if (headerLine.includes("|") && isTableSeparator(separatorLine)) {
            const headers = splitTableRow(headerLine);
            const rows = [];

            let startLine = i;
            i += 2;

            while (i < lines.length && lines[i].includes("|")) {
                const row = splitTableRow(lines[i]);

                if (row.length > 0) {
                    rows.push(row);
                }

                i++;
            }

            tables.push({
                tableIndex: tables.length,
                startLine,
                endLine: i - 1,
                headers: normalizeCells(headers),
                rows: rows.map(normalizeCells),
                columnCount: headers.length,
                rowCount: rows.length
            });

            continue;
        }

        i++;
    }

    return tables;
}