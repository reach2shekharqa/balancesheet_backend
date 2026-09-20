import test from "node:test";
import assert from "node:assert/strict";

import { calculateKeyMetrics } from "../src/analytics/services/keyMetricsService.js";

const metric = values => ({ values });

test("key metrics use the corresponding statement values for both periods", () => {
    const result = calculateKeyMetrics({
        years: ["2025", "2024"],
        metrics: {
            revenueFromOperations: metric({ "FY-2025": 200, "FY-2024": 100 }),
            profitAfterTax: metric({ "FY-2025": 20, "FY-2024": 10 }),
            profitBeforeTax: metric({ "FY-2025": 30, "FY-2024": 15 }),
            financeCosts: metric({ "FY-2025": 5, "FY-2024": 3 }),
            depreciationAndAmortisation: metric({ "FY-2025": 5, "FY-2024": 2 }),
            totalCurrentAssets: metric({ "FY-2025": 300, "FY-2024": 250 }),
            totalCurrentLiabilities: metric({ "FY-2025": 150, "FY-2024": 125 }),
            totalBorrowings: metric({ "FY-2025": 100, "FY-2024": 80 }),
            totalEquity: metric({ "FY-2025": 200, "FY-2024": 160 }),
            totalAssets: metric({ "FY-2025": 500, "FY-2024": 400 })
        }
    });

    assert.equal(result.revenueGrowth.currentValue, 100);
    assert.equal(result.netProfitMargin.currentValue, 10);
    assert.equal(result.ebitdaMargin.currentValue, 20);
    assert.equal(result.currentRatio.currentValue, 2);
    assert.equal(result.debtToEquity.currentValue, 0.5);
    assert.equal(result.roe.currentValue, 11.11);
    assert.equal(result.roa.currentValue, 4.44);
    assert.equal(result.currentRatio.calculation.inputs[0].currentValue, 300);
    assert.equal(result.currentRatio.calculation.inputs[1].currentValue, 150);
});