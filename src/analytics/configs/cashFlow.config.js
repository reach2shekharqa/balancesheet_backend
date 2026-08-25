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
            [
                "cash flow",
                "net cash",
                "net change in cash",
                "cash and cash equivalents"
            ]
        ]
    },

    metrics: {
        // =========================
        // OPERATING ACTIVITIES
        // =========================

        netProfitBeforeTax: {
            role: "operatingMetric",
            aliases: [
                "net profit before tax",
                "profit before tax",
                "profit/(loss) before tax",
                "profit / (loss) before tax",
                "pbt"
            ]
        },

        depreciationAndAmortization: {
            role: "operatingAdjustment",
            aliases: [
                "depreciation and amortization expense",
                "depreciation and amortization",
                "depreciation and amortisation expense",
                "depreciation and amortisation"
            ]
        },

        financeCosts: {
            role: "operatingAdjustment",
            aliases: [
                "finance costs",
                "finance cost",
                "financial costs",
                "financial cost",
                "financial expenses"
            ]
        },

        interestOnFixedDeposits: {
            role: "operatingAdjustment",
            aliases: [
                "interest on fixed deposits",
                "interest on fixed deposit"
            ]
        },

        operatingProfitBeforeWorkingCapitalChanges: {
            role: "sectionTotal",
            aliases: [
                "operating profit before working capital changes",
                "operating profit before working capital change"
            ]
        },

        currentInvestmentsChange: {
            role: "workingCapitalAdjustment",
            aliases: [
                "increase decrease in current investments",
                "increase / decrease in current investments",
                "(increase) / decrease in current investments",
                "increase decrease in current investment"
            ]
        },

        tradeReceivablesChange: {
            role: "workingCapitalAdjustment",
            aliases: [
                "increase decrease in trade receivables",
                "increase / decrease in trade receivables",
                "(increase) / decrease in trade receivables",
                "change in trade receivables"
            ]
        },

        inventoriesChange: {
            role: "workingCapitalAdjustment",
            aliases: [
                "increase decrease in inventories",
                "increase / decrease in inventories",
                "(increase) / decrease in inventories",
                "change in inventories"
            ]
        },

        otherCurrentAndNonCurrentAssetsChange: {
            role: "workingCapitalAdjustment",
            aliases: [
                "increase decrease in other current non current assets",
                "increase / decrease in other current & non current assets",
                "increase / decrease in other current and non current assets",
                "(increase) / decrease in other current & non current assets",
                "change in other current and non current assets"
            ]
        },

        tradePayablesChange: {
            role: "workingCapitalAdjustment",
            aliases: [
                "increase decrease in trade payables",
                "increase / decrease in trade payables",
                "change in trade payables"
            ]
        },

        otherCurrentLiabilitiesAndProvisionsChange: {
            role: "workingCapitalAdjustment",
            aliases: [
                "increase decrease in other current liabilities provisions",
                "increase / decrease in other current liabilities & provisions",
                "increase / decrease in other current liabilities and provisions",
                "change in other current liabilities and provisions"
            ]
        },

        cashGeneratedFromOperations: {
            role: "sectionTotal",
            aliases: [
                "cash generated from operations",
                "cash generated from used in operations",
                "cash generated from/(used in) operations",
                "cash generated used in operations"
            ]
        },

        incomeTaxPaid: {
            role: "operatingCashItem",
            aliases: [
                "income tax paid",
                "tax paid",
                "income taxes paid"
            ]
        },

        operatingCashFlow: {
            role: "statementTotal",
            aliases: [
                "net cash from operating activities",
                "net cash flow from operating activities",
                "net cash flow from/(used in) operating activities",
                "net cash flow from used in operating activities",
                "net cash flow used in operating activities",
                "operating cash flow"
            ]
        },


        // =========================
        // INVESTING ACTIVITIES
        // =========================

        purchaseOfPropertyPlantEquipment: {
            role: "investingCashItem",
            aliases: [
                "purchase of property plant and equipment",
                "purchase of property, plant and equipment",
                "purchases of property plant and equipment",
                "purchase of ppe",
                "capital expenditure"
            ]
        },

        investingInterestOnFixedDeposits: {
            role: "investingCashItem",
            aliases: [
                "interest on fixed deposits",
                "interest received on fixed deposits",
                "interest received"
            ]
        },

        investingCashFlow: {
            role: "statementTotal",
            aliases: [
                "net cash flow from investing activities",
                "net cash flow used in investing activities",
                "net cash flow from/(used in) investing activities",
                "net cash flow used in investing activities",
                "net cash used in investing activities",
                "net cash from investing activities",
                "investing cash flow"
            ]
        },


        // =========================
        // FINANCING ACTIVITIES
        // =========================

       proceedsFromIssueOfShareCapital: {
            role: "financingCashItem",
            aliases: [
                "proceeds from issue of share capital",
                "proceeds from issue of equity share capital",
                "issue of share capital"
            ]
        },

        proceedsFromUnsecuredLoans: {
            role: "financingCashItem",
            aliases: [
                "proceeds from unsecured loans",
                "proceeds from unsecured loan"
            ]
        },

        adjustmentOfUnsecuredLoansToEquityShares: {
            role: "financingCashItem",
            aliases: [
                "adjustment of unsecured loans to equity shares",
                "adjustment of unsecured loan to equity shares",
                "unsecured loans adjusted to equity shares"
            ]
        },

        proceedsFromBorrowings: {
            role: "financingCashItem",
            aliases: [
                "proceeds from borrowings",
                "proceeds from borrowing",
                "borrowings"
            ]
        },

        repaymentOfBorrowings: {
            role: "financingCashItem",
            aliases: [
                "repayment of borrowings",
                "repayment of borrowing",
                "repayment of loans"
            ]
        },

        financingFinanceCosts: {
            role: "financingCashItem",
            aliases: [
                "finance costs",
                "finance cost"
            ]
        },

        financingCashFlow: {
            role: "statementTotal",
            aliases: [
                "net cash flow generated from financing activities",
                "net cash flow generated from/(used in) financing activities",
                "net cash flow from financing activities",
                "net cash flow used in financing activities",
                "net cash generated from financing activities",
                "net cash used in financing activities",
                "net cash from financing activities",
                "financing cash flow"
            ]
        },


        // =========================
        // CASH MOVEMENT
        // =========================

        netCashFlow: {
            role: "statementTotal",
            aliases: [
                "net increase decrease in cash and cash equivalents",
                "net increase/(decrease) in cash & cash equivalents",
                "net increase/(decrease) in cash and cash equivalents",
                "net increase decrease in cash cash equivalents",
                "net increase in cash and cash equivalents",
                "net decrease in cash and cash equivalents",
                "net increase in cash",
                "net decrease in cash",
                "net change in cash",
                "net cash flow"
            ]
        },

        openingCashAndCashEquivalents: {
            role: "cashBalance",
            aliases: [
                "cash and cash equivalents at the beginning of the year",
                "cash and cash equivalents at beginning of the year",
                "cash and cash equivalents at beginning",
                "opening cash and cash equivalents",
                "opening cash balance"
            ]
        },

        closingCashAndCashEquivalents: {
            role: "statementTotal",
            aliases: [
                "cash and cash equivalents at the end of the year",
                "cash and cash equivalents at end of the year",
                "cash and cash equivalents at end",
                "closing cash and cash equivalents",
                "closing cash balance"
            ]
        },


        // =========================
        // CASH COMPONENTS
        // =========================

        balancesWithBanksCurrentAccounts: {
            role: "cashComponent",
            aliases: [
                "on current accounts",
                "current accounts",
                "balances with banks on current accounts"
            ]
        },

        chequesOnHand: {
            role: "cashComponent",
            aliases: [
                "cheques on hand",
                "checks on hand"
            ]
        },

        cashOnHand: {
            role: "cashComponent",
            aliases: [
                "cash on hand including imprest",
                "cash on hand",
                "cash in hand",
                "cash on hand including impreset"
            ]
        },

        totalCashAndCashEquivalents: {
            role: "statementTotal",
            aliases: [
                "total cash and cash equivalent at the end of the year",
                "total cash and cash equivalents at the end of the year",
                "total cash and cash equivalents",
                "cash and cash equivalents"
            ]
        }
    }
};