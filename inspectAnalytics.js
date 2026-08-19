import fs from "fs";

import { extractHtmlTables } from "./src/parser/htmlTableParser.js";
import { selectTables } from "./src/analytics/core/tableSelector.js";
import { findMetricRows } from "./src/analytics/core/metricRowMatcher.js";

import { assetsBreakdownConfig } from "./src/analytics/configs/assetsBreakdown.config.js";
import { profitLossConfig } from "./src/analytics/configs/profitLoss.config.js";
import { cashFlowConfig } from "./src/analytics/configs/cashflow.config.js";


/* =========================================================
   CONFIGURATION
   ========================================================= */

// Change ONLY this line.
//
// Available:
// profitLossConfig
// cashFlowConfig
// assetsBreakdownConfig

const config = assetsBreakdownConfig;


/* =========================================================
   INPUT MARKDOWN
   ========================================================= */

const mdPath =
    "parsed_llmindexmd/b16e3b5bfc51754dfeeff6f42754e8445793e1f3efcac9b9a0d8a3d85020d115.md";


/* =========================================================
   OUTPUT FILE
   ========================================================= */

const analyticsName =
    config.analyticsType ||
    config.name ||
    "analytics";

const outputPath =
    `analytics-inspection-${analyticsName}.txt`;


/* =========================================================
   CAPTURE ALL LOGS
   ========================================================= */

const output = [];

function log(...args) {

    const message = args
        .map(arg => {

            if (typeof arg === "string") {
                return arg;
            }

            return JSON.stringify(arg, null, 2);

        })
        .join(" ");

    output.push(message);

}


/* =========================================================
   START
   ========================================================= */

log("========================================");
log("GENERIC ANALYTICS TABLE INSPECTION");
log("========================================");

log(`Analytics Type: ${analyticsName}`);
log(`Reading Markdown: ${mdPath}`);


/* =========================================================
   READ MARKDOWN
   ========================================================= */

const markdown = fs.readFileSync(mdPath, "utf8");

log(`Characters: ${markdown.length}`);
log(`Lines: ${markdown.split(/\r?\n/).length}`);


/* =========================================================
   EXTRACT TABLES
   ========================================================= */

const tables = extractHtmlTables(markdown);

log(`HTML tables found: ${tables.length}`);


/* =========================================================
   CONFIGURATION
   ========================================================= */

log("");
log("========================================");
log("CONFIGURATION");
log("========================================");

log(
    "analyticsType:",
    config.analyticsType || config.name
);

log(
    "required rules:",
    config.tableSelection?.required ??
    config.tableSelection?.requiredSignals ??
    []
);

log(
    "preferred rules:",
    config.tableSelection?.preferred ??
    config.tableSelection?.preferredSignals ??
    []
);


/* =========================================================
   TABLE SELECTION
   ========================================================= */

log("");
log("========================================");
log("SELECTING TABLES");
log("========================================");

const results = selectTables(
    tables,
    config
);

const topScoredTables = results
    .slice(0, 15)
    .map(result => ({

        tableIndex: result.tableIndex,

        score: Number(
            result.score.toFixed(3)
        ),

        required:
            `${result.requiredMatches}/${result.requiredCount}`,

        preferred:
            `${result.preferredMatches}/${result.preferredCount}`

    }));

log(
    "TOP SCORED TABLES:",
    topScoredTables
);


/* =========================================================
   SELECTED TABLE
   ========================================================= */

const topMatch = results[0];

log("");
log("========================================");
log("SELECTED TABLE");
log("========================================");

if (!topMatch) {

    log("No matching table found.");

} else {

    log({
        tableIndex: topMatch.tableIndex,

        score: Number(
            topMatch.score.toFixed(3)
        ),

        required:
            `${topMatch.requiredMatches}/${topMatch.requiredCount}`,

        preferred:
            `${topMatch.preferredMatches}/${topMatch.preferredCount}`

    });

}


/* =========================================================
   GET SELECTED TABLE
   ========================================================= */

const selectedTable = topMatch
    ? tables.find(
        table =>
            table.tableIndex === topMatch.tableIndex
    )
    : null;


/* =========================================================
   METRIC MATCHING
   ========================================================= */

log("");
log("========================================");
log("MATCHED METRICS");
log("========================================");

let metricMatches = {};

if (!selectedTable) {

    log(
        "No selected table available for metric matching."
    );

} else {

    metricMatches = findMetricRows(
        selectedTable,
        config.metrics
    );

    log(metricMatches);

}


/* =========================================================
   METRIC SUMMARY
   ========================================================= */

log("");
log("========================================");
log("METRIC SUMMARY");
log("========================================");

if (!selectedTable) {

    log("No metrics matched.");

} else {

    const matchedMetrics =
        Object.keys(metricMatches);

    const configuredMetrics =
        Object.keys(config.metrics);

    const missingMetrics =
        configuredMetrics.filter(
            metric =>
                !matchedMetrics.includes(metric)
        );

    log(
        `Configured metrics: ${configuredMetrics.length}`
    );

    log(
        `Matched metrics: ${matchedMetrics.length}`
    );

    log(
        `Missing metrics: ${missingMetrics.length}`
    );

    log(
        "Matched:",
        matchedMetrics
    );

    log(
        "Missing:",
        missingMetrics
    );

}


/* =========================================================
   SELECTED TABLE CONTENT
   ========================================================= */

log("");
log("========================================");
log("SELECTED TABLE CONTENT");
log("========================================");

if (!selectedTable) {

    log("No matching table found.");

} else {

    log(
        `Table Index: ${selectedTable.tableIndex}`
    );

    log(
        `Rows: ${selectedTable.rowCount}`
    );

    log(
        `Columns: ${selectedTable.columnCount}`
    );


    selectedTable.rows.forEach(
        (row, rowIndex) => {

            log(``);
            log(`ROW ${rowIndex}:`);

            row.forEach(
                (cell, cellIndex) => {

                    log(
                        `  CELL ${cellIndex}` +
                        ` | ${cell.type}` +
                        ` | colspan=${cell.colspan}` +
                        ` | "${cell.text}"`
                    );

                }
            );

        }
    );

}


/* =========================================================
   WRITE COMPLETE REPORT
   ========================================================= */

fs.writeFileSync(
    outputPath,
    output.join("\n"),
    "utf8"
);


/* =========================================================
   SHORT TERMINAL OUTPUT
   ========================================================= */

console.log("");
console.log("========================================");
console.log("INSPECTION COMPLETE");
console.log("========================================");

console.log(`Analytics: ${analyticsName}`);

if (topMatch) {

    console.log(
        `Selected table: ${topMatch.tableIndex}`
    );

    console.log(
        `Score: ${topMatch.score.toFixed(3)}`
    );

}

if (selectedTable) {

    console.log(
        `Rows: ${selectedTable.rowCount}`
    );

    console.log(
        `Columns: ${selectedTable.columnCount}`
    );

}

console.log(
    `Matched metrics: ${Object.keys(metricMatches).length}`
);

console.log("");
console.log(`Full report saved to: ${outputPath}`);
console.log("========================================");