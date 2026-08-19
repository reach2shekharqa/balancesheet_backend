export const assetsBreakdownConfig = {
    analyticsType: "assetsBreakdown",

    tableSelection: {
        requiredSignals: [
            [
                "non-current assets",
                "non current assets",
                "noncurrent assets"
            ],
            [
                "current assets",
                "current asset"
            ]
        ]
    },

    metrics: {
        totalNonCurrentAssets: {
            role: "sectionTotal",
            aliases: [
                "total non-current assets",
                "total non current assets",
                "total noncurrent assets"
            ]
        },

        totalCurrentAssets: {
            role: "sectionTotal",
            aliases: [
                "total current assets"
            ]
        },

        totalAssets: {
            role: "statementTotal",
            aliases: [
                "total assets"
            ]
        }
    }
};