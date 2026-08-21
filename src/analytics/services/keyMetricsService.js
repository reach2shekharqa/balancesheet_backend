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
        "longTermBorrowings",
        "shortTermBorrowings",
        "totalEquity"
    ],
    roe: ["profitAfterTax", "totalEquity"],
    roa: ["profitAfterTax", "totalAssets"]
};

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
        const totalBorrowings = getNumericValue(totalBorrowingValues, year);
        const longTerm = getNumericValue(longTermValues, year);
        const shortTerm = getNumericValue(shortTermValues, year);
        const equity = getNumericValue(equityValues, year);

        if (equity === null || equity === 0 || (totalBorrowings === null && longTerm === null && shortTerm === null)) {
            return null;
        }

        const debt = totalBorrowings ?? (longTerm ?? 0) + (shortTerm ?? 0);
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
            { derivedFrom: ["totalBorrowings", "longTermBorrowings", "shortTermBorrowings", "totalEquity"] }
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
        extra: { derivedFrom: ["totalBorrowings", "longTermBorrowings", "shortTermBorrowings", "totalEquity"] }
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
    const { years, periods, metrics } = financialAnalytics ?? {};

    auditKeyMetricDependencies(metrics);

    return {
        revenueGrowth: calculateRevenueGrowth({ years, periods, metrics }),
        netProfitMargin: calculateNetProfitMargin({ years, periods, metrics }),
        ebitdaMargin: calculateEbitdaMargin({ years, periods, metrics }),
        currentRatio: calculateCurrentRatio({ years, periods, metrics }),
        debtToEquity: calculateDebtToEquity({ years, periods, metrics }),
        roe: calculateRoe({ years, periods, metrics }),
        roa: calculateRoa({ years, periods, metrics })
    };
}
