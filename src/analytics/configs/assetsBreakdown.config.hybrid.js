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
            concept: "nonCurrentAssets",
            aliases: [
                "total non-current assets",
                "total non current assets",
                "total noncurrent assets"
            ]
        },

        totalCurrentAssets: {
            role: "sectionTotal",
            concept: "currentAssets",
            aliases: [
                "total current assets"
            ]
        },

        totalAssets: {
            role: "statementTotal",
            concept: "assets",
            aliases: [
                "total assets"
            ]
        }
    }
};