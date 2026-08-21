export const liabilitiesBreakdownConfig = {
    analyticsType: "liabilitiesBreakdown",

    tableSelection: {
        requiredSignals: [
            [
                "non-current liabilities",
                "non current liabilities",
                "noncurrent liabilities"
            ],
            [
                "current liabilities"
            ]
        ]
    },

    metrics: {
        totalNonCurrentLiabilities: {
            role: "sectionTotal",
            aliases: [
                "total non-current liabilities",
                "total non current liabilities",
                "total noncurrent liabilities"
            ]
        },

        totalCurrentLiabilities: {
            role: "sectionTotal",
            aliases: [
                "total current liabilities"
            ]
        },

        totalLiabilities: {
            role: "statementTotal",
            aliases: [
                "total liabilities"
            ]
        },

        totalEquity: {
            role: "statementTotal",
            aliases: [
                "total equity"
            ]
        },

        totalBorrowings: {
            role: "aggregate",
            aliases: [
                "total borrowings",
                "total debt",
                "interest bearing debt",
                "interest-bearing debt"
            ]
        },

        longTermBorrowings: {
            role: "detail",
            aliases: [
                "long term borrowings",
                "long-term borrowings"
            ]
        },

        shortTermBorrowings: {
            role: "detail",
            aliases: [
                "short term borrowings",
                "short-term borrowings"
            ]
        }
    }
};