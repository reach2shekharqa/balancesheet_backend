function getAnalysisYears(years) {
    const availableYears = Array.isArray(years)
        ? years
            .filter(year => year !== null && year !== undefined)
            .map(year => String(year).trim())
            .filter(Boolean)
        : [];

    return [...new Set(availableYears)].sort((firstYear, secondYear) => {
        const firstStart = Number(firstYear.match(/20\d{2}/)?.[0] ?? 0);
        const secondStart = Number(secondYear.match(/20\d{2}/)?.[0] ?? 0);
        return secondStart - firstStart;
    });
}

function getNumericValue(values, year) {
    if (!year || values?.[year] === null || values?.[year] === undefined || values?.[year] === "") {
        return null;
    }

    const value = Number(values[year]);
    return Number.isFinite(value) ? value : null;
}

function getMetricValues(metrics, metricName) {
    return metrics?.[metricName]?.values ?? {};
}

function getPeriods(years, periods) {
    if (periods?.currentPeriod || periods?.previousPeriod) {
        return {
            currentPeriod: periods.currentPeriod ?? null,
            previousPeriod: periods.previousPeriod ?? null
        };
    }

    const detectedPeriods = getAnalysisYears(years);
    return {
        currentPeriod: detectedPeriods[0] ?? null,
        previousPeriod: detectedPeriods[1] ?? null
    };
}

const canonicalSources = {
    profitLoss: [
        "revenueFromOperations",
        "profitAfterTax",
        "profitBeforeTax",
        "financeCosts",
        "depreciationAndAmortisation"
    ],
    balanceSheet: [
        "totalCurrentAssets",
        "totalCurrentLiabilities",
        "totalAssets",
        "totalEquity",
        "totalBorrowings"
    ]
};

function createCanonicalFinancialSnapshot(financialAnalytics = {}) {
    const profitLoss = financialAnalytics.profitLoss ?? financialAnalytics;
    const balanceSheet = financialAnalytics.balanceSheet ?? financialAnalytics;
    const unifiedMetrics = financialAnalytics.metrics ?? null;
    const legacyMetrics = !financialAnalytics.profitLoss && !financialAnalytics.balanceSheet
        ? unifiedMetrics ?? {}
        : null;
    const periods = profitLoss.periods ?? balanceSheet.periods ?? {};
    const years = profitLoss.years ?? balanceSheet.years ?? [];
    const sourceMetric = (statement, key) =>
        unifiedMetrics?.[key] ??
        statement?.metrics?.[key] ??
        {};
    const legacyMetric = key => legacyMetrics?.[key] ?? {};

    return {
        years,
        periods,
        profitLoss: Object.fromEntries(canonicalSources.profitLoss.map(key => [
            key,
            legacyMetrics ? legacyMetric(key) : sourceMetric(profitLoss, key)
        ])),
        balanceSheet: Object.fromEntries([
            ...canonicalSources.balanceSheet,
            ...(legacyMetrics ? ["longTermBorrowings", "shortTermBorrowings"] : [])
        ].map(key => [key, legacyMetrics ? legacyMetric(key) : sourceMetric(balanceSheet, key)]))
    };
}

function snapshotMetrics(snapshot) {
    return Object.fromEntries([
        ...Object.entries(snapshot.profitLoss),
        ...Object.entries(snapshot.balanceSheet)
    ].map(([key, metric]) => [key, {
        values: metric?.values ?? {},
        label: metric?.label ?? null,
        source: metric?.source ?? null,
        resolution: metric?.resolution ?? null
    }]));
}

const keyMetricDependencies = {
    revenueGrowth: ["revenueFromOperations"],
    netProfitMargin: ["profitAfterTax", "revenueFromOperations"],
    ebitdaMargin: [
        "profitBeforeTax",
        "financeCosts",
        "depreciationAndAmortisation",
        "revenueFromOperations"
    ],
    currentRatio: ["totalCurrentAssets", "totalCurrentLiabilities"],
    debtToEquity: [
        "totalBorrowings",
        "totalEquity"
    ],
    roe: ["profitAfterTax", "totalEquity"],
    roa: ["profitAfterTax", "totalAssets"]
};

const keyMetricCalculationDefinitions = {
    revenueGrowth: {
        formula: "(Current revenue - Previous revenue) / Previous revenue x 100",
        calculationType: "revenueGrowth",
        inputs: [{ key: "revenueFromOperations", label: "Revenue from operations" }]
    },
    netProfitMargin: {
        formula: "Profit after tax / Revenue from operations x 100",
        calculationType: "netProfitMargin",
        inputs: [
            { key: "profitAfterTax", label: "Profit after tax" },
            { key: "revenueFromOperations", label: "Revenue from operations" }
        ]
    },
    ebitdaMargin: {
        formula: "(PBT + Finance costs + Depreciation and amortisation) / Revenue from operations x 100",
        calculationType: "ebitdaMargin",
        inputs: [
            { key: "profitBeforeTax", label: "Profit before tax" },
            { key: "financeCosts", label: "Finance costs" },
            { key: "depreciationAndAmortisation", label: "Depreciation and amortisation" },
            { key: "revenueFromOperations", label: "Revenue from operations" }
        ]
    },
    currentRatio: {
        formula: "Total current assets / Total current liabilities",
        calculationType: "currentRatio",
        inputs: [
            { key: "totalCurrentAssets", label: "Total current assets" },
            { key: "totalCurrentLiabilities", label: "Total current liabilities" }
        ]
    },
    debtToEquity: {
        formula: "Borrowings / Total equity",
        calculationType: "debtToEquity",
        inputs: [
            { key: "totalBorrowings", label: "Total borrowings" },
            { key: "totalEquity", label: "Total equity" }
        ]
    },
    roe: {
        formula: "Profit after tax / Average total equity x 100",
        calculationType: "roe",
        inputs: [
            { key: "profitAfterTax", label: "Profit after tax" },
            { key: "totalEquity", label: "Total equity" }
        ]
    },
    roa: {
        formula: "Profit after tax / Average total assets x 100",
        calculationType: "roa",
        inputs: [
            { key: "profitAfterTax", label: "Profit after tax" },
            { key: "totalAssets", label: "Total assets" }
        ]
    }
};

function addCalculationDetails(keyMetrics, years, periods, metrics) {
    const { currentPeriod, previousPeriod } = getPeriods(years, periods);

    return Object.fromEntries(Object.entries(keyMetrics).map(([metricName, metric]) => {
        const definition = keyMetricCalculationDefinitions[metricName];
        if (!definition) return [metricName, metric];

        const inputs = definition.inputs.map(input => {
            const metricInput = metrics?.[input.key] ?? {};
            const values = metricInput.values ?? {};
            return {
                key: input.key,
                label: input.label,
                currentValue: getNumericValue(values, currentPeriod),
                previousValue: getNumericValue(values, previousPeriod),
                ...(metricInput.source ? { source: metricInput.source } : {}),
                ...(metricInput.resolution ? { resolution: metricInput.resolution } : {}),
                ...((metricInput.resolution?.components ?? metricInput.source?.components)
                    ? {
                        components: metricInput.resolution?.components ??
                            metricInput.source?.components
                    }
                    : {})
            };
        });
        const inputValue = (key, period) => {
            const input = inputs.find(candidate => candidate.key === key);
            return input?.[period === currentPeriod ? "currentValue" : "previousValue"] ?? null;
        };
        const derivedValues = {};

        if (definition.calculationType === "ebitdaMargin") {
            for (const [period, suffix] of [[currentPeriod, "current"], [previousPeriod, "previous"]]) {
                const pbt = inputValue("profitBeforeTax", period);
                const financeCosts = inputValue("financeCosts", period);
                const depreciation = inputValue("depreciationAndAmortisation", period);
                derivedValues[`${suffix}Ebitda`] = [pbt, financeCosts, depreciation].every(value => value !== null)
                    ? pbt + financeCosts + depreciation
                    : null;
            }
        }

        if (definition.calculationType === "debtToEquity") {
            for (const [period, suffix] of [[currentPeriod, "current"], [previousPeriod, "previous"]]) {
                const totalBorrowings = inputValue("totalBorrowings", period);
                const longTerm = getNumericValue(getMetricValues(metrics, "longTermBorrowings"), period);
                const shortTerm = getNumericValue(getMetricValues(metrics, "shortTermBorrowings"), period);
                derivedValues[`${suffix}Borrowings`] = totalBorrowings ?? (
                    longTerm !== null || shortTerm !== null
                        ? (longTerm ?? 0) + (shortTerm ?? 0)
                        : null
                );
            }
        }

        if (definition.calculationType === "roe" || definition.calculationType === "roa") {
            const denominatorKey = definition.calculationType === "roe" ? "totalEquity" : "totalAssets";
            const currentDenominator = inputValue(denominatorKey, currentPeriod);
            const previousDenominator = inputValue(denominatorKey, previousPeriod);
            derivedValues.averageDenominator = currentDenominator !== null && previousDenominator !== null
                ? (currentDenominator + previousDenominator) / 2
                : null;
        }

        const statement = ["roa", "roe"].includes(metricName)
            ? "profitLoss+balanceSheet"
            : ["currentRatio", "debtToEquity"].includes(metricName)
                ? "balanceSheet"
                : "profitLoss";

        return [metricName, {
            ...metric,
            source: {
                statement,
                current: Object.fromEntries(inputs.map(input => [input.key, input.currentValue])),
                previous: Object.fromEntries(inputs.map(input => [input.key, input.previousValue]))
            },
            calculation: {
                formula: definition.formula,
                type: definition.calculationType,
                currentPeriod,
                previousPeriod,
                results: {
                    currentValue: metric.currentValue ?? null,
                    previousValue: metric.previousValue ?? null
                },
                inputs,
                derivedValues,
                source: {
                    statement,
                    current: Object.fromEntries(inputs.map(input => [input.key, input.currentValue])),
                    previous: Object.fromEntries(inputs.map(input => [input.key, input.previousValue]))
                }
            }
        }];
    }));
}

function auditKeyMetricDependencies(metrics) {
    for (const [metric, dependencies] of Object.entries(keyMetricDependencies)) {
        for (const dependency of dependencies) {
            const available = Object.keys(getMetricValues(metrics, dependency)).length > 0;
            console.log("[KEY METRICS DEPENDENCY]", metric, dependency, available ? "PRESENT" : "MISSING");
        }
    }
}

function getTrend(currentValue, previousValue) {
    if (currentValue === null || previousValue === null) {
        return undefined;
    }

    return currentValue > previousValue
        ? "up"
        : currentValue < previousValue
            ? "down"
            : "flat";
}

function unavailableMetric(metric, label, currentPeriod, previousPeriod, reason, extra = {}) {
    return {
        metric,
        label,
        currentPeriod,
        previousPeriod,
        currentYear: currentPeriod,
        previousYear: previousPeriod,
        currentValue: null,
        previousValue: null,
        change: null,
        status: "unavailable",
        reason,
        ...extra
    };
}

function calculatedMetric({
    metric,
    label,
    currentPeriod,
    previousPeriod,
    currentValue,
    previousValue,
    unit,
    extra = {},
    changeType = "absolute"
}) {
    const change = currentValue !== null && previousValue !== null
        ? Number((currentValue - previousValue).toFixed(2))
        : null;
    return {
        metric,
        label,
        currentPeriod,
        previousPeriod,
        currentYear: currentPeriod,
        currentValue,
        previousYear: previousPeriod,
        previousValue,
        change,
        changeType,
        value: currentValue,
        ...(unit ? { unit } : {}),
        ...(getTrend(currentValue, previousValue) ? { trend: getTrend(currentValue, previousValue), direction: getTrend(currentValue, previousValue) } : {}),
        status: "calculated",
        ...extra
    };
}

function calculateYearlyMetric({
    metric,
    label,
    years,
    metrics,
    numeratorMetric,
    denominatorMetric,
    unit = "%",
    formula,
    unavailableReason,
    periods
}) {
    const { currentPeriod, previousPeriod } = getPeriods(years, periods);
    const numeratorValues = getMetricValues(metrics, numeratorMetric);
    const denominatorValues = getMetricValues(metrics, denominatorMetric);
    const calculate = year => {
        const numerator = getNumericValue(numeratorValues, year);
        const denominator = getNumericValue(denominatorValues, year);

        if (numerator === null || denominator === null || denominator === 0) {
            return null;
        }

        const result = formula(numerator, denominator);
        return Number.isFinite(result) ? Number(result.toFixed(2)) : null;
    };
    const currentValue = calculate(currentPeriod);
    const previousValue = calculate(previousPeriod);

    if (currentValue === null) {
        return unavailableMetric(
            metric,
            label,
            currentPeriod,
            previousPeriod,
            unavailableReason
        );
    }

    return calculatedMetric({
        metric,
        label,
        currentPeriod,
        previousPeriod,
        currentValue,
        previousValue,
        unit,
        changeType: unit === "%" ? "percentage_points" : "absolute"
    });
}

export function calculateRevenueGrowth({ years, periods, metrics }) {
    const revenueValues = metrics?.revenueFromOperations?.values ?? {};
    const { currentPeriod, previousPeriod } = getPeriods(years, periods);
    const currentValue = getNumericValue(revenueValues, currentPeriod);
    const previousValue = getNumericValue(revenueValues, previousPeriod);

    if (previousValue === null || previousValue === 0) {
        return {
            metric: "revenueGrowth",
            label: "Revenue Growth",
            currentPeriod,
            currentYear: currentPeriod,
            currentValue,
            previousPeriod,
            previousYear: previousPeriod,
            previousValue,
            status: "unavailable",
            reason: "Previous year revenue is unavailable or zero"
        };
    }

    if (currentValue === null) {
        return {
            metric: "revenueGrowth",
            label: "Revenue Growth",
            currentPeriod,
            currentYear: currentPeriod,
            currentValue,
            previousPeriod,
            previousYear: previousPeriod,
            previousValue,
            status: "unavailable",
            reason: "Current year revenue is unavailable"
        };
    }

    const value = ((currentValue - previousValue) / previousValue) * 100;

    if (!Number.isFinite(value)) {
        return {
            metric: "revenueGrowth",
            label: "Revenue Growth",
            currentPeriod,
            currentYear: currentPeriod,
            currentValue,
            previousPeriod,
            previousYear: previousPeriod,
            previousValue,
            status: "unavailable",
            reason: "Revenue growth could not be calculated"
        };
    }

    const roundedValue = Number(value.toFixed(2));

    console.log(
        "[KEY METRICS] revenueGrowth",
        "revenueFromOperations",
        "PRESENT"
    );

    return {
        metric: "revenueGrowth",
        label: "Revenue Growth",
        currentPeriod,
        currentYear: currentPeriod,
        currentValue,
        previousPeriod,
        previousYear: previousPeriod,
        previousValue,
        change: roundedValue,
        changeType: "growth_percent",
        value: roundedValue,
        trend: roundedValue > 0 ? "up" : roundedValue < 0 ? "down" : "flat",
        direction: roundedValue > 0 ? "up" : roundedValue < 0 ? "down" : "flat",
        status: "calculated"
    };
}

export function calculateNetProfitMargin({ years, periods, metrics }) {
    return calculateYearlyMetric({
        metric: "netProfitMargin",
        label: "Net Profit Margin",
        years,
        periods,
        metrics,
        numeratorMetric: "profitAfterTax",
        denominatorMetric: "revenueFromOperations",
        formula: (profit, revenue) => (profit / revenue) * 100,
        unavailableReason: "PAT or revenue from operations is unavailable or zero"
    });
}

export function calculateEbitdaMargin({ years, periods, metrics }) {
    const { currentPeriod, previousPeriod } = getPeriods(years, periods);
    const revenueValues = getMetricValues(metrics, "revenueFromOperations");
    const pbtValues = getMetricValues(metrics, "profitBeforeTax");
    const financeCostValues = getMetricValues(metrics, "financeCosts");
    const depreciationValues = getMetricValues(metrics, "depreciationAndAmortisation");
    const calculate = year => {
        const revenue = getNumericValue(revenueValues, year);
        const pbt = getNumericValue(pbtValues, year);
        const financeCosts = getNumericValue(financeCostValues, year);
        const depreciation = getNumericValue(depreciationValues, year);

        if (revenue === null || revenue === 0 || pbt === null || financeCosts === null || depreciation === null) {
            return null;
        }

        const result = ((pbt + financeCosts + depreciation) / revenue) * 100;
        return Number.isFinite(result) ? Number(result.toFixed(2)) : null;
    };
    const currentValue = calculate(currentPeriod);
    const previousValue = calculate(previousPeriod);

    if (currentValue === null) {
        return unavailableMetric(
            "ebitdaMargin",
            "EBITDA Margin",
            currentPeriod,
            previousPeriod,
            "PBT, finance costs, depreciation, or revenue is unavailable or zero",
            { derivedFrom: ["profitBeforeTax", "financeCosts", "depreciationAndAmortisation", "revenueFromOperations"] }
        );
    }

    return calculatedMetric({
        metric: "ebitdaMargin",
        label: "EBITDA Margin",
        currentPeriod,
        previousPeriod,
        currentValue,
        previousValue,
        unit: "%",
        changeType: "percentage_points",
        extra: {
            derivedFrom: ["profitBeforeTax", "financeCosts", "depreciationAndAmortisation"]
        }
    });
}

export function calculateCurrentRatio({ years, periods, metrics }) {
    return calculateYearlyMetric({
        metric: "currentRatio",
        label: "Current Ratio",
        years,
        periods,
        metrics,
        numeratorMetric: "totalCurrentAssets",
        denominatorMetric: "totalCurrentLiabilities",
        unit: "x",
        formula: (assets, liabilities) => assets / liabilities,
        unavailableReason: "Current assets or current liabilities is unavailable or zero"
    });
}

export function calculateDebtToEquity({ years, periods, metrics }) {
    const { currentPeriod, previousPeriod } = getPeriods(years, periods);
    const totalBorrowingValues = getMetricValues(metrics, "totalBorrowings");
    const longTermValues = getMetricValues(metrics, "longTermBorrowings");
    const shortTermValues = getMetricValues(metrics, "shortTermBorrowings");
    const equityValues = getMetricValues(metrics, "totalEquity");
    const calculate = year => {
        const reportedDebt = getNumericValue(totalBorrowingValues, year);
        const longTerm = getNumericValue(longTermValues, year);
        const shortTerm = getNumericValue(shortTermValues, year);
        const equity = getNumericValue(equityValues, year);
        const debt = reportedDebt ?? (
            longTerm !== null || shortTerm !== null
                ? (longTerm ?? 0) + (shortTerm ?? 0)
                : null
        );

        if (equity === null || equity === 0 || debt === null) {
            return null;
        }

        const result = debt / equity;
        return Number.isFinite(result) ? Number(result.toFixed(2)) : null;
    };
    const currentValue = calculate(currentPeriod);
    const previousValue = calculate(previousPeriod);

    if (currentValue === null) {
        return unavailableMetric(
            "debtToEquity",
            "Debt-to-Equity Ratio",
            currentPeriod,
            previousPeriod,
            "Interest-bearing borrowings or equity is unavailable or zero",
            { derivedFrom: ["totalBorrowings", "totalEquity"] }
        );
    }

    return calculatedMetric({
        metric: "debtToEquity",
        label: "Debt-to-Equity Ratio",
        currentPeriod,
        previousPeriod,
        currentValue,
        previousValue,
        unit: "x",
        extra: { derivedFrom: ["totalBorrowings", "totalEquity"] }
    });
}

function calculateAverageReturn({ metric, label, years, periods, metrics, denominatorMetric, unavailableReason }) {
    const { currentPeriod, previousPeriod } = getPeriods(years, periods);
    const patValues = getMetricValues(metrics, "profitAfterTax");
    const denominatorValues = getMetricValues(metrics, denominatorMetric);
    const pat = getNumericValue(patValues, currentPeriod);
    const currentDenominator = getNumericValue(denominatorValues, currentPeriod);
    const previousDenominator = getNumericValue(denominatorValues, previousPeriod);

    if (pat === null || currentDenominator === null || previousDenominator === null) {
        return unavailableMetric(metric, label, currentPeriod, previousPeriod, unavailableReason);
    }

    const averageDenominator = (currentDenominator + previousDenominator) / 2;

    if (averageDenominator === 0) {
        return unavailableMetric(metric, label, currentPeriod, previousPeriod, "Average denominator is zero");
    }

    const value = Number(((pat / averageDenominator) * 100).toFixed(2));
    return calculatedMetric({
        metric,
        label,
        currentPeriod,
        previousPeriod,
        currentValue: value,
        previousValue: null,
        unit: "%",
        changeType: "percentage_points"
    });
}

export function calculateRoe({ years, periods, metrics }) {
    return calculateAverageReturn({
        metric: "roe",
        label: "ROE",
        years,
        periods,
        metrics,
        denominatorMetric: "totalEquity",
        unavailableReason: "Current and previous year equity is required"
    });
}

export function calculateRoa({ years, periods, metrics }) {
    return calculateAverageReturn({
        metric: "roa",
        label: "ROA",
        years,
        periods,
        metrics,
        denominatorMetric: "totalAssets",
        unavailableReason: "Current and previous year total assets is required"
    });
}

export function calculateKeyMetrics(financialAnalytics) {
    const snapshot = createCanonicalFinancialSnapshot(financialAnalytics);
    const { years, periods } = snapshot;
    const resolvedPeriods = getPeriods(years, periods);
    const metrics = snapshotMetrics(snapshot);

    auditKeyMetricDependencies(metrics);

    const keyMetrics = {
        revenueGrowth: calculateRevenueGrowth({ years, periods, metrics }),
        netProfitMargin: calculateNetProfitMargin({ years, periods, metrics }),
        ebitdaMargin: calculateEbitdaMargin({ years, periods, metrics }),
        currentRatio: calculateCurrentRatio({ years, periods, metrics }),
        debtToEquity: calculateDebtToEquity({ years, periods, metrics }),
        roe: calculateRoe({ years, periods, metrics }),
        roa: calculateRoa({ years, periods, metrics })
    };

    const result = addCalculationDetails(keyMetrics, years, periods, metrics);

    console.log("KEY METRICS SOURCE VALIDATION", JSON.stringify({
        periods: {
            current: resolvedPeriods.currentPeriod,
            previous: resolvedPeriods.previousPeriod
        },
        profitLoss: Object.fromEntries(canonicalSources.profitLoss.map(key => [
            key,
            [getNumericValue(snapshot.profitLoss[key], resolvedPeriods.currentPeriod), getNumericValue(snapshot.profitLoss[key], resolvedPeriods.previousPeriod)]
        ])),
        balanceSheet: Object.fromEntries(canonicalSources.balanceSheet.map(key => [
            key,
            [getNumericValue(snapshot.balanceSheet[key], resolvedPeriods.currentPeriod), getNumericValue(snapshot.balanceSheet[key], resolvedPeriods.previousPeriod)]
        ])),
        calculated: Object.fromEntries(Object.entries(result).map(([key, metric]) => [key, metric.status === "calculated" ? metric.value : metric.status]))
    }));

    return result;
}
