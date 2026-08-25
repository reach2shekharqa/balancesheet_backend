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
            concept: "nonCurrentLiabilities",
            aliases: [
                "total non-current liabilities",
                "total non current liabilities",
                "total noncurrent liabilities"
            ]
        },

        totalCurrentLiabilities: {
            role: "sectionTotal",
            concept: "currentLiabilities",
            aliases: [
                "total current liabilities"
            ]
        },

        totalLiabilities: {
            role: "statementTotal",
            concept: "liabilities",
            aliases: [
                "total liabilities"
            ]
        },

        totalEquity: {
            role: "statementTotal",
            concept: "equity",
            structural: {
                sectionAliases: [
                    "equity",
                    "shareholders funds",
                    "shareholders equity",
                    "owners equity"
                ]
            },
            aliases: [
                "total equity"
            ]
        },

        reservesAndSurplus: {
            role: "detail",
            concept: "equity",
            aliases: [
                "reserves and surplus",
                "reserves & surplus",
                "retained earnings"
            ]
        },

        totalBorrowings: {
            role: "aggregate",
            concept: "interestBearingDebt",
            structural: {
                sectionAliases: [
                    "liabilities",
                    "non-current liabilities",
                    "non current liabilities",
                    "current liabilities"
                ]
            },
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