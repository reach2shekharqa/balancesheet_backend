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
        }
    }
};