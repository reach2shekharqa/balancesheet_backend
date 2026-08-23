import { getSemanticTableText } from "./financialTableLabels.js";

/**
 * Generic table selector.
 *
 * This module knows NOTHING about assets, liabilities,
 * P&L, cash flow, etc.
 *
 * It receives a table and a configuration and calculates
 * how strongly that table matches the configuration.
 */

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function flattenSignals(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .flatMap(rule => Array.isArray(rule) ? rule : [rule])
        .filter(signal => signal !== undefined && signal !== null && signal !== "")
        .map(normalizeText);
}

function getSignalGroups(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map(rule => Array.isArray(rule) ? rule : [rule])
        .map(group => group
            .filter(signal => signal !== undefined && signal !== null && signal !== "")
            .map(normalizeText)
        )
        .filter(group => group.length > 0);
}

function getMetricCoverage(table, config) {
    const metrics = config?.metrics;

    if (!metrics || typeof metrics !== "object") {
        return 0;
    }

    const text = normalizeText(getSemanticTableText(table));
    const metricConfigs = Object.values(metrics);

    if (metricConfigs.length === 0) {
        return 0;
    }

    const matched = metricConfigs.filter(metric =>
        Array.isArray(metric?.aliases) &&
        metric.aliases.some(alias => text.includes(normalizeText(alias)))
    ).length;

    return matched / metricConfigs.length;
}

function getTableText(table) {
    const headerText = Array.isArray(table.headers)
        ? table.headers.map(cell => cell.text || "")
        : [];

    return headerText
        .concat(table.rows
            .flat()
            .map(cell => cell.text || "")
        )
        .join(" ");
}

/**
 * Calculate table matching score.
 */
export function scoreTable(table, config) {

    const text = normalizeText(getSemanticTableText(table));

    const requiredSignals = flattenSignals(
        config?.tableSelection?.requiredSignals ??
        config?.tableSelection?.required ??
        []
    );

    const preferredSignals = flattenSignals(
        config?.tableSelection?.preferredSignals ??
        config?.tableSelection?.preferred ??
        []
    );

    const requiredSignalGroups = getSignalGroups(
        config?.tableSelection?.requiredSignals ??
        config?.tableSelection?.required ??
        []
    );

    const preferredSignalGroups = getSignalGroups(
        config?.tableSelection?.preferredSignals ??
        config?.tableSelection?.preferred ??
        []
    );

    const matchesGroup = group =>
        group.some(signal => text.includes(signal));

    const requiredMatches =
        requiredSignalGroups.filter(matchesGroup).length;

    const preferredMatches =
        preferredSignalGroups.filter(matchesGroup).length;

    const requiredCount = requiredSignals.length;
    const preferredCount = preferredSignals.length;

    const requiredScore =
        requiredSignalGroups.length === 0
            ? 1
            : requiredMatches / requiredSignalGroups.length;

    const preferredScore =
        preferredSignalGroups.length === 0
            ? 0
            : preferredMatches / preferredSignalGroups.length;

    const signalScore =
        (requiredScore * 0.7) +
        (preferredScore * 0.3);

    const metricCoverage = getMetricCoverage(table, config);
    const hasConfiguredMetrics =
        config?.metrics &&
        Object.keys(config.metrics).length > 0;
    const score = hasConfiguredMetrics
        ? (signalScore * 0.4) + (metricCoverage * 0.6)
        : signalScore;

    return {
        tableIndex: table.tableIndex,
        score,
        requiredMatches,
        requiredCount,
        preferredMatches,
        preferredCount,
        metricCoverage
    };
}


/**
 * Select tables matching the supplied configuration.
 */
export function selectTables(tables, config) {

    const scoredTables = tables.map(table =>
        scoreTable(table, config)
    );

    return scoredTables
        .sort((a, b) => b.score - a.score);
}