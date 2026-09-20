import test from "node:test";
import assert from "node:assert/strict";

import { annotateSectionRows } from "../src/services/financialAnalyticsService.js";

test("annotateSectionRows preserves arbitrary statement hierarchy", () => {
    const rows = annotateSectionRows({
        sectionId: "section-7",
        rows: [
            { rowIndex: 8, label: "(a) Financial liabilities" },
            { rowIndex: 9, label: "(i) Borrowings" },
            { rowIndex: 10, label: "(ii) Lease liabilities" },
            { rowIndex: 11, label: "(b) Provisions" }
        ]
    });

    assert.deepEqual(rows.map(row => row.hierarchyLevel), [1, 2, 2, 1]);
    assert.deepEqual(rows.map(row => row.parentRowIndex), [null, 8, 8, null]);
    assert.deepEqual(rows[2].hierarchyPath, ["section-7", 8, 10]);
    assert.deepEqual(rows.map(row => row.statementOrder), [0, 1, 2, 3]);
});