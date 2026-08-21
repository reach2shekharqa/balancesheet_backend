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

function unavailableMetric(metric, label, currentYear, previousYear, reason, extra = {}) {
    return {
        metric,
        label,
        currentYear,
        previousYear,
        status: "unavailable",
        reason,
        ...extra
    };
}

function calculatedMetric({
    metric,
    label,
    currentYear,
    previousYear,
    currentValue,
    previousValue,
    unit,
    extra = {}
}) {
    return {
        metric,
        label,
        currentYear,
        currentValue,
        previousYear,
        previousValue,
        value: currentValue,
        ...(unit ? { unit } : {}),
        ...(getTrend(currentValue, previousValue) ? { trend: getTrend(currentValue, previousValue) } : {}),
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
    unavailableReason
}) {
    const currentYear = years[0] ?? null;
    const previousYear = years[1] ?? null;
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
    const currentValue = calculate(currentYear);
    const previousValue = calculate(previousYear);

    if (currentValue === null) {
        return unavailableMetric(
            metric,
            label,
            currentYear,
            previousYear,
            unavailableReason
        );
    }

    return calculatedMetric({
        metric,
        label,
        currentYear,
        previousYear,
        currentValue,
        previousValue,
        unit
    });
}

export function calculateRevenueGrowth({ years, metrics }) {
    const revenueValues = metrics?.revenueFromOperations?.values ?? {};
    const detectedYears = getAnalysisYears(years);
    const currentYear = detectedYears[0] ?? null;
    const previousYear = detectedYears[1] ?? null;
    const currentValue = getNumericValue(revenueValues, currentYear);
    const previousValue = getNumericValue(revenueValues, previousYear);

    if (previousValue === null || previousValue === 0) {
        return {
            metric: "revenueGrowth",
            label: "Revenue Growth",
            currentYear,
            currentValue,
            previousYear,
            previousValue,
            status: "unavailable",
            reason: "Previous year revenue is unavailable or zero"
        };
    }

    if (currentValue === null) {
        return {
            metric: "revenueGrowth",
            label: "Revenue Growth",
            currentYear,
            currentValue,
            previousYear,
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
            currentYear,
            currentValue,
            previousYear,
            previousValue,
            status: "unavailable",
            reason: "Revenue growth could not be calculated"
        };
    }

    const roundedValue = Number(value.toFixed(2));

    console.log(
        "[KEY METRICS] revenueGrowth",
        `currentYear=${currentYear}`,
        `previousYear=${previousYear}`,
        `currentRevenue=${currentValue}`,
        `previousRevenue=${previousValue}`,
        `growth=${roundedValue}`,
        "status=calculated"
    );

    return {
        metric: "revenueGrowth",
        label: "Revenue Growth",
        currentYear,
        currentValue,
        previousYear,
        previousValue,
        value: roundedValue,
        trend: roundedValue > 0 ? "up" : roundedValue < 0 ? "down" : "flat",
        status: "calculated"
    };
}

export function calculateNetProfitMargin({ years, metrics }) {
    return calculateYearlyMetric({
        metric: "netProfitMargin",
        label: "Net Profit Margin",
        years: getAnalysisYears(years),
        metrics,
        numeratorMetric: "profitAfterTax",
        denominatorMetric: "revenueFromOperations",
        formula: (profit, revenue) => (profit / revenue) * 100,
        unavailableReason: "PAT or revenue from operations is unavailable or zero"
    });
}

export function calculateEbitdaMargin({ years, metrics }) {
    const detectedYears = getAnalysisYears(years);
    const currentYear = detectedYears[0] ?? null;
    const previousYear = detectedYears[1] ?? null;
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
    const currentValue = calculate(currentYear);
    const previousValue = calculate(previousYear);

    if (currentValue === null) {
        return unavailableMetric(
            "ebitdaMargin",
            "EBITDA Margin",
            currentYear,
            previousYear,
            "PBT, finance costs, depreciation, or revenue is unavailable or zero",
            { derivedFrom: ["profitBeforeTax", "financeCosts", "depreciationAndAmortisation", "revenueFromOperations"] }
        );
    }

    return calculatedMetric({
        metric: "ebitdaMargin",
        label: "EBITDA Margin",
        currentYear,
        previousYear,
        currentValue,
        previousValue,
        unit: "%",
        extra: {
            derivedFrom: ["profitBeforeTax", "financeCosts", "depreciationAndAmortisation"]
        }
    });
}

export function calculateCurrentRatio({ years, metrics }) {
    return calculateYearlyMetric({
        metric: "currentRatio",
        label: "Current Ratio",
        years: getAnalysisYears(years),
        metrics,
        numeratorMetric: "totalCurrentAssets",
        denominatorMetric: "totalCurrentLiabilities",
        unit: "x",
        formula: (assets, liabilities) => assets / liabilities,
        unavailableReason: "Current assets or current liabilities is unavailable or zero"
    });
}

export function calculateDebtToEquity({ years, metrics }) {
    const detectedYears = getAnalysisYears(years);
    const currentYear = detectedYears[0] ?? null;
    const previousYear = detectedYears[1] ?? null;
    const longTermValues = getMetricValues(metrics, "longTermBorrowings");
    const shortTermValues = getMetricValues(metrics, "shortTermBorrowings");
    const equityValues = getMetricValues(metrics, "totalEquity");
    const calculate = year => {
        const longTerm = getNumericValue(longTermValues, year);
        const shortTerm = getNumericValue(shortTermValues, year);
        const equity = getNumericValue(equityValues, year);

        if (longTerm === null || shortTerm === null || equity === null || equity === 0) {
            return null;
        }

        const result = (longTerm + shortTerm) / equity;
        return Number.isFinite(result) ? Number(result.toFixed(2)) : null;
    };
    const currentValue = calculate(currentYear);
    const previousValue = calculate(previousYear);

    if (currentValue === null) {
        return unavailableMetric(
            "debtToEquity",
            "Debt-to-Equity Ratio",
            currentYear,
            previousYear,
            "Interest-bearing borrowings or equity is unavailable or zero",
            { derivedFrom: ["longTermBorrowings", "shortTermBorrowings", "totalEquity"] }
        );
    }

    return calculatedMetric({
        metric: "debtToEquity",
        label: "Debt-to-Equity Ratio",
        currentYear,
        previousYear,
        currentValue,
        previousValue,
        unit: "x",
        extra: { derivedFrom: ["longTermBorrowings", "shortTermBorrowings", "totalEquity"] }
    });
}

function calculateAverageReturn({ metric, label, years, metrics, denominatorMetric, unavailableReason }) {
    const detectedYears = getAnalysisYears(years);
    const currentYear = detectedYears[0] ?? null;
    const previousYear = detectedYears[1] ?? null;
    const patValues = getMetricValues(metrics, "profitAfterTax");
    const denominatorValues = getMetricValues(metrics, denominatorMetric);
    const pat = getNumericValue(patValues, currentYear);
    const currentDenominator = getNumericValue(denominatorValues, currentYear);
    const previousDenominator = getNumericValue(denominatorValues, previousYear);

    if (pat === null || currentDenominator === null || previousDenominator === null) {
        return unavailableMetric(metric, label, currentYear, previousYear, unavailableReason);
    }

    const averageDenominator = (currentDenominator + previousDenominator) / 2;

    if (averageDenominator === 0) {
        return unavailableMetric(metric, label, currentYear, previousYear, "Average denominator is zero");
    }

    const value = Number(((pat / averageDenominator) * 100).toFixed(2));
    return calculatedMetric({
        metric,
        label,
        currentYear,
        previousYear,
        currentValue: value,
        previousValue: null,
        unit: "%"
    });
}

export function calculateRoe({ years, metrics }) {
    return calculateAverageReturn({
        metric: "roe",
        label: "ROE",
        years,
        metrics,
        denominatorMetric: "totalEquity",
        unavailableReason: "Current and previous year equity is required"
    });
}

export function calculateRoa({ years, metrics }) {
    return calculateAverageReturn({
        metric: "roa",
        label: "ROA",
        years,
        metrics,
        denominatorMetric: "totalAssets",
        unavailableReason: "Current and previous year total assets is required"
    });
}

export function calculateKeyMetrics(financialAnalytics) {
    const { years, metrics } = financialAnalytics ?? {};

    return {
        revenueGrowth: calculateRevenueGrowth({ years, metrics }),
        netProfitMargin: calculateNetProfitMargin({ years, metrics }),
        ebitdaMargin: calculateEbitdaMargin({ years, metrics }),
        currentRatio: calculateCurrentRatio({ years, metrics }),
        debtToEquity: calculateDebtToEquity({ years, metrics }),
        roe: calculateRoe({ years, metrics }),
        roa: calculateRoa({ years, metrics })
    };
}
