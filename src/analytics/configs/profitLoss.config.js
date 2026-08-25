export const profitLossConfig = {
    analyticsType: "profitLoss",

    tableSelection: {
        requiredSignals: [
            [
                "income",
                "revenue",
                "revenue from operations",
                "total income",
                "total incomes"
            ],
            [
                "expenses",
                "total expenses"
            ]
        ]
    },

    metrics: {
        revenueFromOperations: {
            role: "income",
            searchOutsideSections: true,
            aliases: [
                "revenue from operations",
                "revenue from operation",
                "revenue",
                "net sales",
                "sales",
                "turnover"
            ]
        },

        otherIncome: {
            role: "income",
            aliases: [
                "other income"
            ]
        },

        totalIncome: {
            role: "statementTotal",
            aliases: [
                "total income",
                "total incomes"
            ]
        },

        costOfMaterialsConsumed: {
            role: "expense",
            aliases: [
                "cost of materials consumed",
                "cost of material consumed",
                "materials consumed",
                "material consumed"
            ]
        },

        purchaseOfStockInTrade: {
            role: "expense",
            aliases: [
                "purchase of stock in trade",
                "purchases of stock in trade",
                "purchase of stock-in-trade",
                "purchases of stock-in-trade"
            ]
        },

        changesInInventories: {
            role: "expense",
            aliases: [
                "changes in inventories of finished goods and work-in-progress",
                "changes in inventories of finished goods and work in progress",
                "changes in inventories of finished goods",
                "changes in inventories",
                "change in inventories"
            ]
        },

        employeeBenefitsExpense: {
            role: "expense",
            aliases: [
                "employee benefits expenses",
                "employee benefit expenses",
                "employee benefits expense",
                "employee benefit expense"
            ]
        },

        financeCosts: {
            role: "expense",
            aliases: [
                "finance costs",
                "finance cost",
                "financial costs",
                "financial cost",
                "financial expenses"
            ]
        },

        depreciationAndAmortisation: {
            role: "expense",
            aliases: [
                "depreciation and amortisation expense",
                "depreciation and amortisation expenses",
                "depreciation and amortization expense",
                "depreciation and amortization",
                "depreciation expense",
                "depreciation"
            ]
        },

        otherExpenses: {
            role: "expense",
            aliases: [
                "other expenses",
                "other expense"
            ]
        },

        totalExpenses: {
            role: "sectionTotal",
            aliases: [
                "total expenses",
                "total expenses (iv)",
                "total expense"
            ]
        },

        profitBeforeTax: {
            role: "profit",
            searchOutsideSections: true,
            aliases: [
                "profit before tax",
                "profit before tax (pbt)",
                "profit/(loss) before tax",
                "profit / (loss) before tax",
                "profit/(loss) beforetax",
                "profit beforetax (pbt)",
                "profit loss before tax",
                "profit loss beforetax",
                "profit beforetax"
            ]
        },

        currentTax: {
            role: "tax",
            aliases: [
                "current tax",
                "current tax expense"
            ]
        },

        deferredTax: {
            role: "tax",
            aliases: [
                "deferred tax",
                "deferred tax charges",
                "deferred tax charges/(benefits)",
                "deferred tax benefits",
                "deferred tax expense"
            ]
        },

        profitAfterTax: {
            role: "profit",
            searchOutsideSections: true,
            aliases: [
                "profit after tax",
                "profit after tax (pat)",
                "profit/(loss) after tax",
                "profit / (loss) after tax",
                "profit / loss after tax",
                "profit after tax (pat)",
                "profit for the year",
                "profit for year",
                "net income",
                "net profit",
                "net profit after tax"
            ]
        },

        basicEPS: {
            role: "perShareMetric",
            aliases: [
                "basic eps",
                "basic eps for the year",
                "basic earnings per share"
            ]
        },

        dilutedEPS: {
            role: "perShareMetric",
            aliases: [
                "diluted eps",
                "diluted eps for the year",
                "diluted earnings per share"
            ]
        }
    }
};