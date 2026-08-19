export const cashFlowConfig = {
    analyticsType: "cashFlow",

    tableSelection: {
        requiredSignals: [
            [
                "operating activities",
                "cash flow from operating activities"
            ],
            [
                "investing activities",
                "cash flow from investing activities"
            ],
            [
                "financing activities",
                "cash flow from financing activities"
            ]
        ],
        preferredSignals: [
            ["cash flow", "net cash", "net change in cash"]
        ]
    },

    metrics: {
        operatingCashFlow: {
            aliases: [
                "net cash from operating activities",
                "net cash flow from operating activities",
                "net cash flow from used in operating activities",
                "operating cash flow"
            ]
        },
        investingCashFlow: {
            aliases: [
                "net cash used in investing activities",
                "net cash from investing activities",
                "net cash flow used in investing activities",
                "investing cash flow"
            ]
        },
        financingCashFlow: {
            aliases: [
                "net cash used in financing activities",
                "net cash from financing activities",
                "net cash flow generated from used in financing activities",
                "financing cash flow"
            ]
        },
        netCashFlow: {
            aliases: [
                "net change in cash",
                "net increase in cash",
                "net decrease in cash",
                "net increase decrease in cash and cash equivalents",
                "net increase decrease in cash cash equivalents",
                "net cash flow"
            ]
        }
    }
};