export const profitLossConfig = {
    analyticsType: "profitLoss",

    tableSelection: {
        requiredSignals: [
            [
                "income statement",
                "profit and loss",
                "statement of profit",
                "statement of comprehensive income"
            ]
        ],
        preferredSignals: [
            ["revenue", "income", "sales"],
            ["expense", "expenses", "cost"],
            ["profit", "loss", "ebit", "net income"]
        ]
    },

    metrics: {
        totalRevenue: {
            aliases: ["total revenue", "revenue", "sales", "income"]
        },
        totalExpenses: {
            aliases: ["total expenses", "expenses", "operating expenses"]
        },
        profitBeforeTax: {
            aliases: ["profit before tax", "loss before tax", "ebit"]
        },
        profitAfterTax: {
            aliases: ["profit after tax", "loss after tax", "net income", "net profit"]
        }
    }
};