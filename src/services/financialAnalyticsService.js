import fs from "fs";

import { extractHtmlTables } from "../parser/htmlTableParser.js";
import { parseMarkdownTables } from "../parser/markdownTableParser.js";
import { selectTables } from "../analytics/core/tableSelector.js";
import {
    findConfiguredSections
} from "../analytics/core/metricRowMatcher.js";

const DEBUG_ANALYTICS_LOGGING =
    process.env.DEBUG_ANALYTICS !== "0";

function debugAnalyticsLog(...args) {
    if (!DEBUG_ANALYTICS_LOGGING) {
        return;
    }

    console.log("[ANALYTICS DEBUG]", ...args);
}


/* =========================================================
   ANALYTICS CONFIG LOADERS
   ========================================================= */

const analyticsConfigLoaders = {

    assetsBreakdown: () =>
        import(
            "../analytics/configs/assetsBreakdown.config.hybrid.js"
        ).then(
            module => module.assetsBreakdownConfig
        ),

    liabilitiesBreakdown: () =>
        import(
            "../analytics/configs/liabilitiesBreakdown.config.hybrid.js"
        ).then(
            module => module.liabilitiesBreakdownConfig
        ),

    profitLoss: () =>
        import(
            "../analytics/configs/profitLoss.config.js"
        ).then(
            module => module.profitLossConfig
        ),

    cashFlow: () =>
        import(
            "../analytics/configs/cashFlow.config.js"
        ).then(
            module => module.cashFlowConfig
        )

};


/* =========================================================
   DETECT CONTENT TYPE
   ========================================================= */

/**
 * Detect whether content contains Markdown tables or HTML tables.
 *
 * Returns:
 *   "markdown"
 *   "html"
 */
function detectContentType(content) {

    /*
     * HTML is more specific, so check it first.
     */
    if (
        /<table\b[^>]*>[\s\S]*?<\/table>/i
            .test(content)
    ) {
        return "html";
    }

    const lines =
        content.split(/\r?\n/);

    for (
        let i = 0;
        i < lines.length - 1;
        i++
    ) {

        if (!lines[i].includes("|")) {
            continue;
        }

        const nextLine =
            lines[i + 1];

        if (
            /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/
                .test(nextLine)
        ) {
            return "markdown";
        }
    }


    /*
     * Preserve previous fallback.
     */
    return "html";
}


/* =========================================================
   EXTRACT TABLES
   ========================================================= */

function extractTablesFromContent(content) {

    const contentType =
        detectContentType(content);

    if (contentType === "markdown") {
        return parseMarkdownTables(content);
    }

    return extractHtmlTables(content);
}


/* =========================================================
   PARSE FINANCIAL NUMBER
   ========================================================= */

function parseFinancialNumber(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const text =
        String(value).trim();

    if (
        !text ||
        text === "-" ||
        text === "—"
    ) {
        return null;
    }


    const cleaned =
        text
            .replace(/\*\*/g, "")
            .replace(/__/g, "")
            .replace(/\*/g, "")
            .replace(/_/g, "")
            .replace(/[$€£¥₹]/g, "")
            .replace(/^rs\.?\s*/i, "")
            .replace(/\s+/g, " ")
            .trim();

    if (!cleaned) {
        return null;
    }


    const isNegative =
        /^\(.*\)$/.test(cleaned) ||
        /^-\s*\d/.test(cleaned);


    const unsigned = cleaned
        .replace(/[()]/g, "")
        .replace(/\s+/g, "")
        .trim();
    const lastComma = unsigned.lastIndexOf(",");
    const lastDot = unsigned.lastIndexOf(".");
    const normalized = lastComma > lastDot
        ? unsigned.replace(/\./g, "").replace(",", ".")
        : unsigned.replace(/,/g, "");


    if (
        !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/
            .test(normalized)
    ) {
        return null;
    }


    const number =
        Number(normalized);

    if (!Number.isFinite(number)) {
        return null;
    }


    return isNegative
        ? -number
        : number;
}


/* =========================================================
   EXTRACT YEAR
   ========================================================= */

function extractYear(value) {

    const text =
        String(value ?? "");

    if (/\bcurrent\s+year\b/i.test(text)) {
        return "Current Year";
    }

    if (/\bprevious\s+year\b|\bprior\s+year\b/i.test(text)) {
        return "Previous Year";
    }

    const fiscalMatch = text.match(
        /\b(20\d{2})\s*[-/]\s*((?:20)?\d{2})\b/
    );

    if (fiscalMatch) {
        return `${fiscalMatch[1]}-${fiscalMatch[2].slice(-2)}`;
    }

    const match = text.match(/\b(20\d{2})\b/);

    return match
        ? match[1]
        : null;
}


/* =========================================================
   GET TABLE YEARS
   ========================================================= */

function getTableYears(table) {

    if (!table) {
        return [];
    }


    const headerColumnCount =
        Array.isArray(table.headers)
            ? table.headers.length
            : 0;


    const rowColumnCount =
        Array.isArray(table.rows) &&
            table.rows.length > 0
            ? Math.max(
                ...table.rows.map(
                    row => row.length
                )
            )
            : 0;


    const columnCount =
        Math.max(
            headerColumnCount,
            rowColumnCount
        );


    if (columnCount === 0) {
        return [];
    }


    const years =
        new Array(columnCount)
            .fill(null);


    /*
     * ---------------------------------------------------------
     * STEP 1
     * Look for years in headers.
     * ---------------------------------------------------------
     */

    if (
        Array.isArray(table.headers)
    ) {

        table.headers.forEach(
            (cell, columnIndex) => {

                const year =
                    extractYear(
                        cell?.text
                    );

                if (year) {
                    years[columnIndex] =
                        year;
                }

            }
        );

    }


    /*
     * ---------------------------------------------------------
     * STEP 2
     * If headers did not contain years,
     * inspect rows.
     * ---------------------------------------------------------
     */

    const headerYearCount =
        years.filter(Boolean).length;


    if (headerYearCount > 0) {
        return years;
    }


    if (!Array.isArray(table.rows)) {
        return years;
    }


    let bestYearRow = null;
    let bestYearCount = 0;


    for (const row of table.rows) {

        const rowYears =
            row.map(
                cell =>
                    extractYear(
                        cell?.text
                    )
            );


        const yearCount =
            rowYears.filter(Boolean)
                .length;


        if (
            yearCount >
            bestYearCount
        ) {

            bestYearCount =
                yearCount;

            bestYearRow =
                row;

        }

    }


    if (!bestYearRow) {
        return years;
    }


    bestYearRow.forEach(
        (cell, columnIndex) => {

            const year =
                extractYear(
                    cell?.text
                );

            if (year) {
                years[columnIndex] =
                    year;
            }

        }
    );


    return years;
}


/* =========================================================
   EXTRACT METRIC VALUES
   ========================================================= */

function extractMetricValues(
    match,
    years
) {

    if (!match?.row) {
        return {};
    }


    const values = {};


    match.row.forEach(
        (cell, columnIndex) => {

            const year =
                years[columnIndex];

            if (!year) {
                return;
            }


            const value =
                parseFinancialNumber(
                    cell?.text
                );


            if (value !== null) {
                values[year] = value;
            }

        }
    );


    return values;
}

function extractMetricSourceValues(match, years) {
    if (!match?.row) {
        return {};
    }

    const values = {};

    match.row.forEach((cell, columnIndex) => {
        const year = years[columnIndex];

        if (!year) {
            return;
        }

        const sourceValue = String(cell?.text ?? "").trim();

        if (sourceValue !== "") {
            values[year] = sourceValue;
        }
    });

    return values;
}


/* =========================================================
   MAIN ANALYTICS EXTRACTION
   ========================================================= */

export async function extractFinancialAnalytics({
    markdown,
    analyticsType,
    documentId
}) {

    /*
     * ---------------------------------------------------------
     * VALIDATION
     * ---------------------------------------------------------
     */

    if (
        !markdown ||
        typeof markdown !== "string"
    ) {
        throw new TypeError(
            "Markdown content is required."
        );
    }


    if (!analyticsType) {
        throw new Error(
            "analyticsType is required."
        );
    }


    /*
     * ---------------------------------------------------------
     * LOAD CONFIG
     * ---------------------------------------------------------
     */

    const configLoader =
        analyticsConfigLoaders[
        analyticsType
        ];


    if (!configLoader) {
        throw new Error(
            `Unsupported analytics type: ${analyticsType}`
        );
    }


    const config =
        await configLoader();


    /* =========================================================
       STEP 1
       EXTRACT TABLES
       ========================================================= */

    const tables =
        extractTablesFromContent(
            markdown
        );


    if (tables.length === 0) {
        throw new Error(
            "No tables found in content."
        );
    }


    /* =========================================================
       STEP 2
       SELECT BEST TABLE
       ========================================================= */

    const scoredTables =
        selectTables(
            tables,
            config
        );


    const topMatch =
        scoredTables[0];


    if (
        !topMatch ||
        topMatch.score <= 0
    ) {
        throw new Error(
            `No table found for analytics type: ${analyticsType}`
        );
    }

    const selectedTable =
        tables.find(
            table =>
                table.tableIndex ===
                topMatch.tableIndex
        );


    if (!selectedTable) {
        throw new Error(
            "Selected table could not be resolved."
        );
    }


    /* =========================================================
     * DEBUG TABLE INFORMATION
     * ---------------------------------------------------------
     */

    debugAnalyticsLog(
        "documentId:",
        documentId ?? "unknown"
    );

    debugAnalyticsLog(
        "analyticsType:",
        analyticsType
    );

    debugAnalyticsLog(
        "[SELECTED TABLE]"
    );

    debugAnalyticsLog(
        "tableIndex:",
        selectedTable.tableIndex
    );

    debugAnalyticsLog(
        "score:",
        Number(
            topMatch.score.toFixed(3)
        )
    );

    debugAnalyticsLog(
        "rows:",
        selectedTable.rowCount
    );

    debugAnalyticsLog(
        "columns:",
        selectedTable.columnCount
    );


    /* =========================================================
       STEP 3
       DETERMINE YEARS
       ========================================================= */

    const years =
        getTableYears(
            selectedTable
        );

    const detectedPeriods = years
        .filter(Boolean)
        .map(String)
        .sort((first, second) => {
            const firstStart = Number(first.match(/20\d{2}/)?.[0] ?? 0);
            const secondStart = Number(second.match(/20\d{2}/)?.[0] ?? 0);
            return secondStart - firstStart;
        });

    const periods = {
        currentPeriod: detectedPeriods[0] ?? null,
        previousPeriod: detectedPeriods[1] ?? null
    };


    debugAnalyticsLog(
        "years detected:",
        years.filter(Boolean)
    );

    const discoveredSections =
        discoverSectionRows(
            selectedTable,
            config,
            years
        );

    debugAnalyticsLog(
        "[DISCOVERED SECTIONS]",
        JSON.stringify(
            discoveredSections,
            null,
            2
        )
    );

    for (const section of discoveredSections) {
        debugAnalyticsLog(
            "[SECTION BOUNDARY]",
            JSON.stringify({
                analyticsType,
                tableIndex: selectedTable.tableIndex,
                sectionId: section.sectionId,
                section: section.section,
                startIndex: section.startIndex,
                endIndex: section.endIndex,
                explicitTotal: section.sourceTotal?.label ?? null,
                totalValues: section.sourceTotal?.values ?? null
            })
        );
    }


    /* =========================================================
       DEBUG SELECTED TABLE ROWS
       ========================================================= */

    debugAnalyticsLog(
        "[ROWS]"
    );


    selectedTable.rows.forEach(
        (row, rowIndex) => {

            const rowLabel =
                String(
                    row?.[0]?.text ?? ""
                ).trim();


            const values =
                Array.isArray(row)
                    ? row.map(
                        cell =>
                            String(
                                cell?.text ?? ""
                            )
                        )
                    : [];


            debugAnalyticsLog(
                `${rowIndex}: label="${rowLabel}" values=${JSON.stringify(values)}`
            );

        }
    );


    /* =========================================================
       TABLE-SELECTION-ONLY CONFIG
       ========================================================= */

    if (!config.metrics) {
    const dataset =
        buildAnalyticsDataset(
            discoveredSections,
            {},
            {}
        );

    debugAnalyticsLog(
        "[FINAL ANALYTICS DATASET]",
        JSON.stringify(dataset, null, 2)
    );

    return {
        analyticsType,

        table: {
            tableIndex:
                selectedTable.tableIndex,

            score:
                Number(
                    topMatch.score.toFixed(3)
                ),

            rows:
                selectedTable.rowCount,

            columns:
                selectedTable.columnCount
        },

        years,
        periods,

        sections: discoveredSections,

        metrics: dataset,

        dataset,

        summary: {
            sections:
                discoveredSections.length,

            discovered:
                dataset.length,

            missing: 0,

            missingMetrics: [],

            unresolvedMetrics: []
        }
    };
}


    /* =========================================================
       STEP 4
       MATCH CONFIGURED METRICS
       =========================================================
       
       IMPORTANT:
       
       There is NO hybrid/LLM matcher here.
       
       Metric matching is handled directly by:
       
           src/analytics/core/metricMatcher.js
       
       The complete analytics config is passed so the matcher
       can use:
       
           config.tableSelection.requiredSignals
       
       for semantic section boundaries.
       ========================================================= */

    console.log(
        "[ANALYTICS] Starting metric extraction for:",
        analyticsType
    );


    console.log(
        "[ANALYTICS] Selected table index:",
        selectedTable.tableIndex
    );


    const { findMetricRows } =
        await import("../analytics/core/metricRowMatcher.js");

    const metricMatches =
        findMetricRows(
            selectedTable,
            config.metrics,
            config
        ) ?? {};

    /* =========================================================
       DEBUG MATCH RESULTS
       ========================================================= */

    debugAnalyticsLog(
        "[MATCH RESULTS]"
    );


    for (
        const metricName of Object.keys(config.metrics)
    ) {
        const match = metricMatches[metricName];

        const rowIndex =
            selectedTable.rows.findIndex(
                row =>
                    row === match?.row
            );


        const rowLabel =
            String(
                match?.row?.[0]?.text ?? ""
            ).trim();


        const values =
            Array.isArray(match?.row)
                ? match.row.map(
                    cell =>
                        String(
                            cell?.text ?? ""
                        )
                )
                : [];


        debugAnalyticsLog(
            `${metricName} -> row ${rowIndex} -> label="${rowLabel}" values=${JSON.stringify(values)}`
        );

    }


    /* =========================================================
       STEP 5
       CONVERT MATCHED ROWS TO VALUES
       ========================================================= */

    const metrics = {};
    const unresolvedMetrics = [];


    for (
        const metricName of Object.keys(config.metrics)
    ) {
        const match = metricMatches[metricName];

        const values =
            extractMetricValues(
                match,
                years
            );


        if (
            Object.keys(values).length > 0
        ) {

            const rowIndex =
                selectedTable.rows.indexOf(
                    match.row
                );

            const section =
                discoveredSections.find(
                    candidate =>
                        rowIndex > candidate.startIndex &&
                        rowIndex < candidate.endIndex
                );

            const resolution = match.row?.__analyticsResolution ?? {};
            const resolutionReason =
                resolution.reason ??
                resolution.method ??
                (String(match.row?.[0]?.text ?? "").trim()
                    ? "labelled_source"
                    : "unresolved_structural_evidence");
            const sourceValues = extractMetricSourceValues(match, years);

            metrics[metricName] = {

                label:
                    String(
                        match.row?.[0]?.text ?? ""
                    ).trim(),

                values,

                rowIndex,

                section:
                    section?.section ?? null,

                sourceSectionId:
                    section?.sectionId ?? null,

                sourceSection:
                    section?.section ?? null,

                sourceRowIndex: rowIndex,

                sourceRowLabel: String(
                    match.row?.[0]?.text ?? ""
                ).trim(),

                sourceTotal:
                    section?.sourceTotal ?? null,

                inclusionReason: section
                    ? "matched alias within validated source section"
                    : "unresolved source section",

                role:
                    config.metrics[metricName]?.role ??
                    "detail",

                source: {
                    rowIndex,
                    label: String(match.row?.[0]?.text ?? "").trim(),
                    section: section?.section ?? null,
                    sectionId: section?.sectionId ?? null,
                    sourceTotal: section?.sourceTotal ?? null,
                    years: Object.keys(values),
                    values: sourceValues,
                    role: config.metrics[metricName]?.role ?? "detail",
                    resolutionReason,
                    confidence:
                        resolution.confidence ??
                        (String(match.row?.[0]?.text ?? "").trim()
                            ? 0.82
                            : 0.6)
                },

                resolution: {
                    status: "source",
                    rowType: String(
                        match.row?.[0]?.text ?? ""
                    ).trim()
                        ? "labelled"
                        : "structuralSubtotal",
                    method:
                        resolution.method ??
                        (String(match.row?.[0]?.text ?? "").trim()
                            ? "labelled_source"
                            : "structural_subtotal"),
                    reason: resolutionReason,
                    confidence:
                        resolution.confidence ??
                        (String(match.row?.[0]?.text ?? "").trim()
                            ? 0.82
                            : 0.6),
                    reconciliation:
                        resolution.reconciliation ??
                        match.reconciliation ??
                        null
                },
                reconciliation:
                    match.row?.__analyticsResolution?.reconciliation ??
                    match.reconciliation ??
                    null

            };

            debugAnalyticsLog(
                "[METRIC RESOLUTION DEBUG]",
                JSON.stringify({
                    metric: metricName,
                    section: section?.section ?? null,
                    candidateRows: [rowIndex],
                    candidateScore: match.candidateScore ?? null,
                    reason: match.resolution?.reason ??
                        metrics[metricName].resolution.rowType,
                    status: "source",
                    reconciliation: match.reconciliation ?? null
                })
            );

        } else {

            unresolvedMetrics.push(
                metricName
            );

            metrics[metricName] = {
                label: null,
                values: {},
                rowIndex: null,
                section: null,
                sourceSectionId: null,
                sourceSection: null,
                sourceRowIndex: null,
                sourceRowLabel: null,
                sourceTotal: null,
                inclusionReason: "source section could not be established",
                role: config.metrics[metricName]?.role ?? "detail",
                resolution: {
                    status: "unresolved",
                    method: "unresolved",
                    confidence: 0,
                    reconciliation: null
                }
            };

            debugAnalyticsLog(
                "[METRIC RESOLUTION DEBUG]",
                JSON.stringify({
                    metric: metricName,
                    section: null,
                    candidateRows: [],
                    candidateScore: null,
                    reason: "no reliable source row",
                    status: "unresolved"
                })
            );

        }

    }


    /* =========================================================
       STEP 6
       MISSING METRICS
       ========================================================= */

    const configuredMetrics =
        Object.keys(
            config.metrics
        );


    const matchedMetrics =
        Object.keys(
            metrics
        ).filter(metricName =>
            metrics[metricName]?.resolution?.status !== "unresolved"
        );


    const missingMetrics =
        configuredMetrics.filter(
            metric =>
                !matchedMetrics.includes(
                    metric
                )
        );

    const dataset =
        buildAnalyticsDataset(
            discoveredSections,
            metrics,
            config.metrics
        );

    debugAnalyticsLog(
        "[FINAL ANALYTICS DATASET]",
        JSON.stringify(dataset, null, 2)
    );

    /* =========================================================
       FINAL RESULT
       ========================================================= */

    return {

        analyticsType,

        table: {

            tableIndex:
                selectedTable.tableIndex,

            score:
                Number(
                    topMatch.score.toFixed(3)
                ),

            rows:
                selectedTable.rowCount,

            columns:
                selectedTable.columnCount

        },

        years,

        periods,

        metrics,

        sections: discoveredSections,

        dataset,

        summary: {

            configured:
                configuredMetrics.length,

            matched:
                matchedMetrics.length,

            missing:
                missingMetrics.length,

            missingMetrics,

            unresolvedMetrics

        }

    };
}


/* =========================================================
   FILE-BASED HELPER
   ========================================================= */
function discoverSectionRows(table, analyticsConfig, years) {
    const sections = findConfiguredSections(
        table,
        analyticsConfig
    );

    const discoveredSections = [];

    for (const section of sections) {
        const rows = [];

        for (
            let index = section.startIndex + 1;
            index < section.endIndex;
            index++
        ) {
            const row = table.rows[index];

            if (!row || !row.length) {
                continue;
            }

            const label = String(
                row[0]?.text ?? ""
            ).trim();

            const values = extractMetricValues(
                { row },
                years
            );

            if (!label && Object.keys(values).length === 0) {
                continue;
            }

            rows.push({
                rowIndex: index,
                label,
                values
            });
        }

        discoveredSections.push({
            sectionId:
                section.sectionId ??
                `section-${section.startIndex}`,
            section:
                String(
                    table.rows[section.startIndex]?.[0]?.text ??
                    section.aliases?.[0] ??
                    ""
                ).trim(),
            startIndex: section.startIndex,
            endIndex: section.endIndex,
            sourceTotal: null,
            rows
        });

        const discoveredSection = discoveredSections.at(-1);
        const totalRow = rows.find(row =>
            /^(?:total|subtotal)\b/i.test(row.label)
        );

        if (totalRow) {
            discoveredSection.sourceTotal = {
                rowIndex: totalRow.rowIndex,
                label: totalRow.label,
                values: totalRow.values
            };
        }
    }

    return discoveredSections;
}


function buildAnalyticsDataset(
    sections,
    metrics,
    metricsConfig
) {
    const metricsByRowIndex = new Map();

    for (const [metricName, metric] of Object.entries(metrics)) {
        if (!Number.isInteger(metric.rowIndex)) {
            continue;
        }

        const existing =
            metricsByRowIndex.get(metric.rowIndex) ?? {
                metricNames: [],
                role: "detail"
            };

        existing.metricNames.push(metricName);
        existing.role =
            metricsConfig?.[metricName]?.role ??
            metric.role ??
            existing.role;

        metricsByRowIndex.set(
            metric.rowIndex,
            existing
        );
    }

    return sections.flatMap(section =>
        section.rows.map(row => {
            const metric =
                metricsByRowIndex.get(row.rowIndex);

            const percentages = section.sourceTotal
                ? Object.fromEntries(
                    Object.entries(row.values).flatMap(([year, value]) => {
                        const total = section.sourceTotal.values?.[year];

                        return Number.isFinite(value) &&
                            Number.isFinite(total) &&
                            total !== 0
                            ? [[year, (value / total) * 100]]
                            : [];
                    })
                )
                : {};

            return {
                sourceSectionId: section.sectionId ?? null,
                section: section.section,
                sourceSection: section.section,
                rowIndex: row.rowIndex,
                sourceRowIndex: row.rowIndex,
                label: row.label,
                sourceRowLabel: row.label,
                values: row.values,
                sourceTotal: section.sourceTotal ?? null,
                percentages,
                inclusionReason: metric
                    ? "matched configured metric within validated source section"
                    : "source row within validated section",
                role: metric?.role ?? "detail",
                metricNames: metric?.metricNames ?? []
            };
        })
    );
}
export async function extractFinancialAnalyticsFromFile({
    markdownPath,
    analyticsType
}) {

    const markdown =
        fs.readFileSync(
            markdownPath,
            "utf8"
        );


    return extractFinancialAnalytics({

        markdown,

        analyticsType

    });
}