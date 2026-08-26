import { getSemanticRowLabel } from "./financialTableLabels.js";

function normalizeFinancialLabel(value) {
    return String(value ?? "")
        .replace(/^\s*(?:\(?\d+\)?|\(?[ivxlcdm]+\)?|\(?[a-z]\)?)\s*[.)]?\s+/i, "")
        .replace(/\*\*/g, "")
        .replace(/__/g, "")
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2010-\u2015\u2212]/g, "-")
        .replace(/[\u00A0\u2000-\u200B]/g, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function normalizeText(value) {
    return normalizeFinancialLabel(value)
        .replace(/&/g, " and ")
        .replace(/[\\/|]+/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}


function singularizeWord(word) {
    if (word.length <= 3) {
        return word;
    }

    if (word.endsWith("ies") && !word.endsWith("eies")) {
        return word.slice(0, -3) + "y";
    }

    if (word.endsWith("sses")) {
        return word.slice(0, -2);
    }

    if (word.endsWith("s") && !word.endsWith("ss")) {
        return word.slice(0, -1);
    }

    return word;
}


function canonicalizeMatchText(value) {
    return normalizeText(value)
        .split(" ")
        .filter(Boolean)
        .filter(token =>
            !/^\d+$/.test(token) &&
            token.length > 1
        )
        .map(token => token
            .replace(/equivaients/g, "equivalents")
            .replace(/equivallents/g, "equivalents")
            .replace(/borrowimgs/g, "borrowings")
            .replace(/^tem$/g, "term")
            .replace(/deffered/g, "deferred")
            .replace(/equivalant/g, "equivalent")
        )
        .map(singularizeWord)
        .join(" ");
}


function getRowLabel(row) {
    return normalizeText(getSemanticRowLabel(row));
}


function getRowValues(row) {
    if (!row || !row.length) {
        return [];
    }

    return row
        .slice(1)
        .map(cell => normalizeText(cell?.text));
}


/* =========================================================
   ALIAS MATCHING
   ========================================================= */

function isSpecificEnoughForContainedMatch(
    shorterText,
    longerText
) {
    if (!shorterText || !longerText) {
        return false;
    }

    const shorterTokens =
        shorterText.split(" ").filter(Boolean);

    const longerTokens =
        longerText.split(" ").filter(Boolean);

    if (shorterTokens.length <= 1) {
        return false;
    }

    if (longerTokens.length <= shorterTokens.length) {
        return false;
    }

    return (
        longerTokens.length -
        shorterTokens.length <= 2
    );
}


function getTokenMatchQuality(
    rowLabel,
    alias
) {
    const normalizedRow =
        canonicalizeMatchText(rowLabel);

    const normalizedAlias =
        canonicalizeMatchText(alias);

    if (
        !normalizedRow ||
        !normalizedAlias
    ) {
        return null;
    }

    const rowWords =
        normalizedRow
            .split(" ")
            .filter(Boolean);

    const aliasWords =
        normalizedAlias
            .split(" ")
            .filter(Boolean);

    if (
        rowWords.length === 0 ||
        aliasWords.length === 0
    ) {
        return null;
    }

    const rowWordSet =
        new Set(rowWords);

    const aliasWordSet =
        new Set(aliasWords);

    const missingFromRow =
        [...aliasWordSet]
            .filter(word =>
                !rowWordSet.has(word)
            );

    const missingFromAlias =
        [...rowWordSet]
            .filter(word =>
                !aliasWordSet.has(word)
            );

    const totalWordDifference =
        missingFromRow.length +
        missingFromAlias.length;

    const ocrEquivalent = (left, right) => {
        if (left === right) {
            return true;
        }

        if (Math.abs(left.length - right.length) > 2) {
            return false;
        }

        const distances = new Array(right.length + 1)
            .fill(null)
            .map((_, index) => index);

        for (let rowIndex = 1; rowIndex <= left.length; rowIndex++) {
            let diagonal = distances[0];
            distances[0] = rowIndex;

            for (let aliasIndex = 1; aliasIndex <= right.length; aliasIndex++) {
                const previous = distances[aliasIndex];
                distances[aliasIndex] = left[rowIndex - 1] === right[aliasIndex - 1]
                    ? diagonal
                    : 1 + Math.min(
                        diagonal,
                        distances[aliasIndex],
                        distances[aliasIndex - 1]
                    );
                diagonal = previous;
            }
        }

        return distances[right.length] <= 1;
    };

    const unmatchedRowWords = missingFromAlias.filter(rowWord =>
        !missingFromRow.some(aliasWord => ocrEquivalent(rowWord, aliasWord))
    );
    const unmatchedAliasWords = missingFromRow.filter(aliasWord =>
        !missingFromAlias.some(rowWord => ocrEquivalent(aliasWord, rowWord))
    );
    const ocrWordDifference =
        unmatchedRowWords.length + unmatchedAliasWords.length;

    /*
     * Do not allow fuzzy matching when more than
     * one semantic word differs.
     */
    if (totalWordDifference > 2 || ocrWordDifference > 1) {
        return null;
    }

    /*
     * Only harmless connector words may be the
     * single difference.
     */
    if (totalWordDifference === 1 && ocrWordDifference === 1) {
        const onlyDifference =
            missingFromRow[0] ??
            missingFromAlias[0];

        const connectorWords =
            new Set([
                "and",
                "or",
                "the",
                "of",
                "for",
                "at",
                "to",
                "in",
                "on",
                "with",
                "by",
                "as",
                "per",
                "a",
                "an",
                "it",
                "net",
                "gross"
            ]);

        if (
            onlyDifference &&
            !connectorWords.has(onlyDifference) &&
            !ocrEquivalent(
                missingFromRow[0] ?? "",
                missingFromAlias[0] ?? ""
            )
        ) {
            return null;
        }
    }

    const sharedWords =
        [...rowWordSet]
            .filter(word =>
                aliasWordSet.has(word)
            );

    const minWordCount =
        Math.min(
            rowWordSet.size,
            aliasWordSet.size
        );

    if (minWordCount === 0) {
        return null;
    }

    return (
        sharedWords.length /
        minWordCount
    );
}


function getBestAliasMatch(
    rowLabel,
    aliases
) {
    let bestMatch = null;

    for (const alias of aliases) {
        const normalizedAlias =
            canonicalizeMatchText(alias);

        const normalizedRow =
            canonicalizeMatchText(rowLabel);

        if (
            !normalizedAlias ||
            !normalizedRow
        ) {
            continue;
        }

        let matchRank = null;

        /*
         * Rank 1:
         * Exact semantic match.
         */
        if (
            normalizedRow ===
            normalizedAlias
        ) {
            matchRank = 1;
        }

        /*
         * Rank 2:
         * Alias contained in row.
         */
        else if (
            normalizedRow.includes(
                normalizedAlias
            )
        ) {
            const rowTokens =
                normalizedRow
                    .split(" ")
                    .filter(Boolean);

            const aliasTokens =
                normalizedAlias
                    .split(" ")
                    .filter(Boolean);

            const position =
                normalizedRow.indexOf(
                    normalizedAlias
                );

            const leadingExtra =
                normalizedRow
                    .slice(0, position)
                    .trim();

            const trailingExtra =
                normalizedRow
                    .slice(
                        position +
                        normalizedAlias.length
                    )
                    .trim();

            const trailingStartsWithConnector =
                trailingExtra.startsWith("and ") ||
                trailingExtra.startsWith("or ");

            /*
             * Never let generic "total" match
             * arbitrary rows such as:
             *
             * Total Revenue
             * Total Assets
             */
            if (
                aliasTokens.length === 1 &&
                (
                    aliasTokens[0] === "total" ||
                    aliasTokens[0] === "subtotal"
                ) &&
                rowTokens.length > 1
            ) {
                continue;
            }

            if (
                rowTokens.length -
                    aliasTokens.length <= 2 ||

                (
                    trailingStartsWithConnector &&
                    trailingExtra
                        .split(" ")
                        .filter(Boolean)
                        .length <= 3
                ) ||

                (
                    leadingExtra &&
                    leadingExtra
                        .split(" ")
                        .filter(Boolean)
                        .length <= 2
                )
            ) {
                matchRank = 2;
            }
        }

        /*
         * Rank 3:
         * Row is contained inside alias.
         *
         * This is deliberately restricted so a short
         * row does not accidentally match a long alias.
         */
        else if (
            normalizedAlias.includes(
                normalizedRow
            ) &&
            isSpecificEnoughForContainedMatch(
                normalizedRow,
                normalizedAlias
            )
        ) {
            matchRank = 3;
        }

        /*
         * Rank 4:
         * Conservative token similarity.
         */
        else {
            const tokenMatchQuality =
                getTokenMatchQuality(
                    normalizedRow,
                    normalizedAlias
                );

            const rowWords =
                normalizedRow
                    .split(" ")
                    .filter(Boolean);

            const aliasWords =
                normalizedAlias
                    .split(" ")
                    .filter(Boolean);

            if (
                tokenMatchQuality !== null &&
                tokenMatchQuality >= 0.75 &&
                rowWords.length > 1 &&
                aliasWords.length > 1 &&
                Math.min(
                    rowWords.length,
                    aliasWords.length
                ) >= 2
            ) {
                matchRank = 4;
            }
        }

        if (matchRank === null) {
            continue;
        }

        const candidate = {
            alias: normalizedAlias,
            matchRank,
            specificity:
                normalizedAlias.length
        };

        if (
            !bestMatch ||
            matchRank <
                bestMatch.matchRank ||
            (
                matchRank ===
                    bestMatch.matchRank &&
                candidate.specificity >
                    bestMatch.specificity
            )
        ) {
            bestMatch = candidate;
        }
    }

    return bestMatch;
}


function aliasMatchesRow(
    rowLabel,
    aliases
) {
    if (
        !Array.isArray(aliases) ||
        aliases.length === 0
    ) {
        return false;
    }

    return !!getBestAliasMatch(
        rowLabel,
        aliases
    );
}


function matchesAnyAlias(
    label,
    aliases
) {
    if (!label) {
        return false;
    }

    return aliasMatchesRow(
        label,
        aliases
    );
}


/* =========================================================
   NUMERIC DETECTION
   ========================================================= */

function hasNumericValue(row) {
    if (!row || !row.length) {
        return false;
    }

    const numericCells =
        row
            .slice(1)
            .map(cell =>
                String(cell?.text ?? "")
                    .trim()
                    .replace(/\*\*/g, "")
                    .replace(/__/g, "")
                    .replace(/\*/g, "")
                    .replace(/_/g, "")
                    .trim()
            )
            .filter(value =>
                value !== ""
            )
            .filter(value =>
                /^[-+]?(?:\(?\d[\d,]*)(?:\.\d+)?\)?$/
                    .test(
                        value.replace(
                            /\s+/g,
                            ""
                        )
                    )
            );

    if (numericCells.length === 0) {
        return false;
    }

    const meaningfulNumericCells =
        numericCells.filter(value => {
            const cleaned =
                value
                    .replace(/[()]/g, "")
                    .replace(/,/g, "");

            return (
                cleaned.includes(".") ||
                cleaned.length > 4
            );
        });

    return (
        meaningfulNumericCells.length > 0 ||
        numericCells.length > 1
    );
}


function getNumericCellValue(cell) {
    const rawValue = String(cell?.text ?? "")
        .trim()
        .replace(/\*\*/g, "")
        .replace(/__/g, "")
        .replace(/\*/g, "")
        .replace(/_/g, "")
        .replace(/[$€£¥₹]/g, "")
        .replace(/^rs\.?\s*/i, "")
        .replace(/\s+/g, "");

    const lastComma = rawValue.lastIndexOf(",");
    const lastDot = rawValue.lastIndexOf(".");
    const value = lastComma > lastDot
        ? rawValue.replace(/\./g, "").replace(",", ".")
        : rawValue.replace(/,/g, "");

    if (!value || value === "-") {
        return null;
    }

    const normalized = value.replace(/[()]/g, "");

    if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
        return null;
    }

    const number = Number(normalized);
    return Number.isFinite(number)
        ? (/^\(.*\)$/.test(value) ? -number : number)
        : null;
}


function getDetectedYearColumns(table) {
    const rows = [
        ...(Array.isArray(table?.headers) ? [table.headers] : []),
        ...(Array.isArray(table?.rows) ? table.rows : [])
    ];

    let bestColumns = [];

    for (const row of rows) {
        const columns = row
            .map((cell, columnIndex) =>
                /\b20\d{2}\b/.test(String(cell?.text ?? ""))
                    ? columnIndex
                    : null
            )
            .filter(columnIndex => columnIndex !== null);

        if (columns.length > bestColumns.length) {
            bestColumns = columns;
        }
    }

    return bestColumns;
}

function getPeriodValues(table, row, yearColumns) {
    const directValues = yearColumns.map(columnIndex =>
        getNumericCellValue(row?.[columnIndex])
    );

    if (directValues.every(value => value !== null)) {
        return directValues;
    }

    const shiftedValues = row
        ?.slice(1)
        .map(getNumericCellValue)
        .filter(value => value !== null) ?? [];

    if (shiftedValues.length === yearColumns.length) {
        return shiftedValues;
    }

    return directValues;
}


const NUMERIC_RECONCILIATION_TOLERANCE = 0.01;


function reconcilesWithinNumericTolerance(
    left,
    right
) {
    return (
        Math.abs(left - right) <=
        NUMERIC_RECONCILIATION_TOLERANCE +
        1e-9 +
        Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right))
    );
}


function hasValidYearValues(table, row) {
    const yearColumns = getDetectedYearColumns(table);

    if (yearColumns.length === 0) {
        return hasNumericValue(row);
    }

    return getPeriodValues(table, row, yearColumns)
        .every(value => value !== null);
}


function isStructuralPatLabel(label) {
    const normalized = canonicalizeMatchText(label);

    if (!normalized || !/\b(?:profit|loss|income|earnings)\b/.test(normalized)) {
        return false;
    }

    return !/\b(?:before tax|pbt|operating profit|gross profit|from operations|exceptional|extraordinary|per share|eps)\b/.test(normalized);
}


function isStructuralPbtLabel(label) {
    const normalized = canonicalizeMatchText(label);

    return /\b(?:profit|loss)\b.*\bbefore tax\b/.test(normalized);
}


function isStructuralTaxAggregateLabel(label) {
    const normalized = canonicalizeMatchText(label);

    if (
        !normalized ||
        /\b(?:current|deferred) tax\b/.test(normalized)
    ) {
        return false;
    }

    return /\b(?:total\s+(?:income\s+)?tax(?:\s+expenses?)?|(?:income\s+)?tax\s+expenses?|taxation)\b/.test(normalized);
}


function findStructuralPatRow(table, metricsConfig, analyticsConfig = {}) {
    if (!Array.isArray(table?.rows)) {
        return null;
    }

    const structuralLabel = row =>
        getRowLabel(row) || normalizeText(row?.[0]?.text);

    const pbtConfig = metricsConfig?.profitBeforeTax;
    const pbtAliases = getConfiguredAliases(pbtConfig);
    const taxConfigs = Object.entries(metricsConfig ?? {})
        .filter(([metricName, config]) =>
            metricName !== "profitAfterTax" && getMetricRole(config) === "tax"
        )
        .map(([, config]) => getConfiguredAliases(config))
        .flat();
    const searchRanges = [{
        startIndex: 0,
        endIndex: table.rows.length
    }];
    const candidates = [];

    for (const range of searchRanges) {
        const pbtRows = [];

        for (let index = range.startIndex; index < range.endIndex; index++) {
            const row = table.rows[index];

            if (
                hasValidYearValues(table, row) &&
                (
                    matchesAnyAlias(structuralLabel(row), pbtAliases) ||
                    isStructuralPbtLabel(structuralLabel(row))
                )
            ) {
                pbtRows.push({ row, rowIndex: index });
            }
        }

        for (let index = range.startIndex; index < range.endIndex; index++) {
            const row = table.rows[index];
            const label = structuralLabel(row);

            if (
                !hasValidYearValues(table, row) ||
                !isStructuralPatLabel(label)
            ) {
                continue;
            }

            const pbt = [...pbtRows]
                .reverse()
                .find(candidate => candidate.rowIndex < index);

            if (!pbt) {
                continue;
            }

            const taxComponents = [];
            const taxAggregates = [];
            for (let taxIndex = pbt.rowIndex + 1; taxIndex < index; taxIndex++) {
                const taxRow = table.rows[taxIndex];
                const taxLabel = structuralLabel(taxRow);

                if (
                    hasValidYearValues(table, taxRow) &&
                    (
                        matchesAnyAlias(taxLabel, taxConfigs) ||
                        isStructuralTaxAggregateLabel(taxLabel)
                    )
                ) {
                    const taxMatch = { row: taxRow, rowIndex: taxIndex };
                    if (isStructuralTaxAggregateLabel(taxLabel)) {
                        taxAggregates.push(taxMatch);
                    } else {
                        taxComponents.push(taxMatch);
                    }
                }
            }

            const hasPerShareBeforeCandidate = table.rows
                .slice(pbt.rowIndex + 1, index)
                .some(candidateRow =>
                    /\b(?:basic|diluted|earnings per share|eps|per share)\b/.test(
                        structuralLabel(candidateRow)
                    )
                );

            if (hasPerShareBeforeCandidate) {
                continue;
            }

            const nextLabels = table.rows
                .slice(index + 1, range.endIndex)
                .map(getRowLabel)
                .filter(Boolean);
            const beforePerShareRow = nextLabels.length === 0 ||
                nextLabels.some(label =>
                    /\b(?:basic|diluted|earnings per share|eps|per share)\b/.test(label)
                );
            const numericColumns = getNumericColumns(table, range);
            const pbtValues = getRowPeriodValues(table, pbt.row, range);
            const candidateValues = getRowPeriodValues(table, row, range);
            const reconcilesWithTaxRows = taxRows => {
                const taxValues = taxRows.map(taxRow =>
                    getRowPeriodValues(table, taxRow.row, range)
                );

                return Boolean(
                    pbtValues &&
                    candidateValues &&
                    taxValues.length > 0 &&
                    taxValues.every(Boolean) &&
                    candidateValues.every((value, valueIndex) =>
                        reconcilesWithinNumericTolerance(
                            value,
                            pbtValues[valueIndex] - taxValues.reduce(
                                (sum, values) => sum + values[valueIndex],
                                0
                            )
                        )
                    )
                );
            };
            const aggregateTax = taxAggregates.find(aggregate =>
                reconcilesWithTaxRows([aggregate])
            );
            const taxRows = aggregateTax
                ? [aggregateTax]
                : taxComponents;
            const reconciled = reconcilesWithTaxRows(taxRows);

            let score = 20;
            score += taxRows.length > 0 ? 20 : 0;
            score += taxRows.length > 1 ? 10 : 0;
            score += beforePerShareRow ? 10 : 0;
            score += reconciled ? 40 : 0;
            score += numericColumns.length > 0 ? 5 : 0;

            candidates.push({
                row,
                rowIndex: index,
                score,
                reconciled,
                taxRows,
                resolution: {
                    method: "structural_resolution",
                    reason: reconciled
                        ? "profitAfterTaxReconciledToPbtAndTax"
                        : "profitAfterTaxStructuralSequence",
                    confidence: reconciled ? 0.96 : 0.78,
                    reconciliation: reconciled
                        ? {
                            type: "pbt_minus_tax",
                            taxSelection: aggregateTax ? "aggregate" : "components",
                            taxRowIndexes: taxRows.map(taxRow => taxRow.rowIndex)
                        }
                        : null
                }
            });
        }
    }

    candidates.sort((left, right) =>
        right.score - left.score ||
        Number(right.reconciled) - Number(left.reconciled) ||
        left.rowIndex - right.rowIndex
    );

    const selected = candidates[0];
    return selected && selected.score >= 70
        ? selected
        : null;
}


/* =========================================================
   CONFIG ACCESS
   ========================================================= */

function getConfiguredAliases(config) {
    if (Array.isArray(config)) {
        return config
            .map(normalizeText)
            .filter(Boolean);
    }

    if (
        !config ||
        typeof config !== "object"
    ) {
        return [];
    }

    return (
        config.aliases ?? []
    )
        .map(normalizeText)
        .filter(Boolean);
}


function getStructuralAliases(config) {
    if (
        !config ||
        typeof config !== "object" ||
        Array.isArray(config)
    ) {
        return {
            sectionAliases: [],
            aggregateAliases: []
        };
    }

    const structural =
        config.structural ?? config;

    return {
        sectionAliases:
            (
                structural.sectionAliases ??
                []
            )
                .map(normalizeText)
                .filter(Boolean),

        aggregateAliases:
            (
                structural.aggregateAliases ??
                []
            )
                .map(normalizeText)
                .filter(Boolean)
    };
}


function getMetricRole(config) {
    if (
        !config ||
        typeof config !== "object" ||
        Array.isArray(config)
    ) {
        return "detail";
    }

    const role =
        String(
            config.role ?? "detail"
        )
            .trim()
            .toLowerCase();

    return role || "detail";
}

function getMetricConcept(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        return null;
    }

    return String(config.concept ?? "").trim() || null;
}

function classifyFinancialConcept(label, sectionLabel = "") {
    const text = canonicalizeMatchText(`${label} ${sectionLabel}`);

    if (/\b(?:lease liability|lease liabilities|right to use)\b/.test(text)) {
        return "leaseLiability";
    }

    if (/\b(?:non current asset(?:s)?|noncurrent asset(?:s)?)\b/.test(text)) {
        return "nonCurrentAssets";
    }

    if (/\b(?:current asset(?:s)?)\b/.test(text)) {
        return "currentAssets";
    }

    if (/\b(?:loan|loans)\b.*\b(?:advance|advances)\b/.test(text)) {
        return "assets";
    }

    if (/\b(?:non current liabilit(?:y|ies)|noncurrent liabilit(?:y|ies))\b/.test(text)) {
        return "nonCurrentLiabilities";
    }

    if (/\b(?:current liabilit(?:y|ies))\b/.test(text)) {
        return "currentLiabilities";
    }

    if (/\b(?:trade payable|trade payables|provision|deferred tax liability|deferred tax liabilities|current tax liability|current tax liabilities|operating liability|operating liabilities|creditor|creditors|payable|payables)\b/.test(text)) {
        return "operatingLiability";
    }

    if (/\b(?:borrowings?|interest bearing debt|term loan|vehicle loan|bank loan|debenture|bond|notes payable)\b/.test(text)) {
        return "interestBearingDebt";
    }

    if (/\b(?:share capital|reserves?|surplus|retained earnings|shareholders? funds?|shareholders? equity|equity)\b/.test(text)) {
        return "equity";
    }

    if (/\b(?:asset|assets|property|plant|equipment|inventory|inventories|receivable|receivables|cash|loan|loans|advance|advances)\b/.test(text)) {
        return "assets";
    }

    if (/\b(?:liability|liabilities)\b/.test(text)) {
        return "liabilities";
    }

    return null;
}

function conceptCompatible(concept, label, sectionLabel = "") {
    if (!concept) {
        return true;
    }

    const labelConcept = classifyFinancialConcept(label);
    const sectionConcept = classifyFinancialConcept(sectionLabel);

    const compatibleDetailConcepts = {
        currentAssets: ["assets"],
        nonCurrentAssets: ["assets"],
        currentLiabilities: [
            "interestBearingDebt",
            "operatingLiability",
            "leaseLiability"
        ],
        nonCurrentLiabilities: [
            "interestBearingDebt",
            "operatingLiability",
            "leaseLiability"
        ]
    };

    const labelSupportsConcept = labelConcept === concept ||
        compatibleDetailConcepts[concept]?.includes(labelConcept);

    if (labelConcept && !labelSupportsConcept) {
        return false;
    }

    const sectionSupportsConcept = sectionConcept === concept ||
        (sectionConcept === "liabilities" && [
            "interestBearingDebt",
            "operatingLiability"
        ].includes(concept)) ||
        (["currentLiabilities", "nonCurrentLiabilities"].includes(sectionConcept) && [
            "interestBearingDebt",
            "operatingLiability",
            "leaseLiability"
        ].includes(concept));

    if (sectionConcept && !sectionSupportsConcept) {
        return false;
    }

    return labelSupportsConcept || sectionSupportsConcept;
}

function isAggregateCandidateLabel(label) {
    const normalized = canonicalizeMatchText(label);
    return normalized === "total" ||
        normalized === "subtotal" ||
        normalized.startsWith("total ") ||
        normalized.startsWith("subtotal ") ||
        normalized.includes("aggregate");
}

function getSectionLabel(table, section) {
    return getRowLabel(table.rows[section?.startIndex]) || "";
}

function getComponentValues(table, row, section) {
    return getRowPeriodValues(table, row, section);
}

function findDebtComponentAggregate(table, config, metricsConfig, analyticsConfig) {
    if (getMetricConcept(config) !== "interestBearingDebt") {
        return null;
    }

    const sections = findConfiguredSections(table, analyticsConfig);
    const structural = getStructuralAliases(config);
    const ranges = sections.length > 0
        ? sections
        : structural.sectionAliases.map(alias => {
            const startIndex = table.rows.findIndex(row =>
                matchesAnyStructuralSection(getRowLabel(row), [alias])
            );
            return startIndex >= 0
                ? { startIndex, endIndex: table.rows.length, aliases: [alias] }
                : null;
        }).filter(Boolean);
    const candidates = [];

    for (const section of ranges) {
        const sectionLabel = getSectionLabel(table, section);
        if (!conceptCompatible("liabilities", sectionLabel) &&
            !/\b(?:liabilit|debt|borrow)/.test(sectionLabel)) {
            continue;
        }

        for (let rowIndex = section.startIndex + 1; rowIndex < section.endIndex; rowIndex++) {
            const row = table.rows[rowIndex];
            const label = getRowLabel(row);

            if (!label || !hasValidYearValues(table, row) ||
                isAggregateCandidateLabel(label) ||
                !conceptCompatible("interestBearingDebt", label, sectionLabel)) {
                continue;
            }

            candidates.push({ row, rowIndex, section, values: getComponentValues(table, row, section) });
        }
    }

    const components = candidates.filter(candidate => {
        const childRows = candidates.filter(child =>
            child.section === candidate.section &&
            child.rowIndex > candidate.rowIndex &&
            child.values
        );
        return !childRows.length || !valuesReconcile(
            candidate.values,
            childRows.reduce((sum, child) =>
                sum.map((value, index) => value + child.values[index]),
                childRows[0]?.values?.map(() => 0) ?? []
            )
        );
    });

    if (components.length === 0) {
        return null;
    }

    const columns = getNumericColumns(table, components[0].section);
    const totals = columns.map((_, valueIndex) =>
        components.reduce((sum, component) => sum + component.values[valueIndex], 0)
    );
    const aggregateRow = [];
    const rowWidth = Math.max(...components.map(component => component.row.length));
    for (let columnIndex = 0; columnIndex < rowWidth; columnIndex++) {
        const valueIndex = columns.indexOf(columnIndex);
        aggregateRow.push({ text: valueIndex >= 0 ? String(totals[valueIndex]) : "" });
    }
    aggregateRow[0] = { text: "" };
    aggregateRow.__analyticsResolution = {
        method: "componentAggregate",
        reason: "eligibleInterestBearingDebtComponents",
        confidence: 0.93,
        components: components.map(component => ({
            rowIndex: component.rowIndex,
            label: String(component.row?.[0]?.text ?? "").trim(),
            values: Object.fromEntries(columns.map((column, index) => [
                getColumnPeriodLabel(table, column),
                component.values[index]
            ])),
            concept: "interestBearingDebt"
        }))
    };

    return { row: aggregateRow, rowIndex: components[0].rowIndex, resolution: aggregateRow.__analyticsResolution };
}


/* =========================================================
   TABLE-SELECTION SECTION SIGNALS
   ========================================================= */

function getRequiredSectionSignals(
    analyticsConfig
) {
    const signals =
        analyticsConfig
            ?.tableSelection
            ?.requiredSignals;

    if (!Array.isArray(signals)) {
        return [];
    }

    return signals
        .map(group =>
            Array.isArray(group)
                ? group
                    .map(normalizeText)
                    .filter(Boolean)
                : []
        )
        .filter(
            group =>
                group.length > 0
        );
}


function getConfiguredSectionAliasesFromTableSelection(
    analyticsConfig
) {
    return getRequiredSectionSignals(
        analyticsConfig
    ).flat();
}


/* =========================================================
   SECTION NORMALIZATION
   ========================================================= */

function normalizeSectionLabel(value) {
    const normalized =
        canonicalizeMatchText(value);

    /*
     * Remove only leading numbering.
     *
     * Examples:
     *
     * 1 Non-Current Assets
     * II Current Assets
     * A Current Assets
     */
    return normalized
        .replace(
            /^(?:[ivxlcdm]+|\d+|[a-z])\s+/i,
            ""
        )
        .trim();
}


/*
 * IMPORTANT:
 *
 * Section matching is stricter than metric matching.
 *
 * "current assets"
 *
 * must NOT match:
 *
 * "non current assets"
 */
function matchesStructuralSection(
    label,
    sectionAliases
) {
    if (
        !label ||
        !Array.isArray(sectionAliases)
    ) {
        return false;
    }

    const normalizedLabel =
        normalizeSectionLabel(label);

    if (!normalizedLabel) {
        return false;
    }

    for (const alias of sectionAliases) {
        const normalizedAlias =
            normalizeSectionLabel(alias);

        if (!normalizedAlias) {
            continue;
        }

        /*
         * Exact section match.
         */
        if (
            normalizedLabel ===
            normalizedAlias
        ) {
            return true;
        }

        const labelWords =
            normalizedLabel
                .split(" ")
                .filter(Boolean);

        const aliasWords =
            normalizedAlias
                .split(" ")
                .filter(Boolean);

        /*
         * Allow:
         *
         * Current Assets Schedule III
         *
         * when the configured alias is Current Assets.
         */
        if (
            labelWords.length >=
                aliasWords.length &&
            labelWords
                .slice(
                    -aliasWords.length
                )
                .join(" ") ===
                normalizedAlias
        ) {
            const prefixWords =
                labelWords.slice(
                    0,
                    labelWords.length -
                        aliasWords.length
                );

            /*
             * Prevent:
             *
             * Non Current Assets
             *
             * from matching:
             *
             * Current Assets
             */
            const disqualifyingPrefixes =
                new Set([
                    "non",
                    "net",
                    "gross"
                ]);

            if (
                prefixWords.length === 0 ||
                !prefixWords.some(
                    word =>
                        disqualifyingPrefixes.has(
                            word
                        )
                )
            ) {
                return true;
            }
        }
    }

    return false;
}


function matchesAnyStructuralSection(
    label,
    sectionAliases
) {
    return matchesStructuralSection(
        label,
        sectionAliases
    );
}


function isStructuralSectionHeading(
    row,
    aliases
) {
    const label =
        getRowLabel(row);

    if (
        !label ||
        safeAggregateLabel(label)
    ) {
        return false;
    }

    if (hasNumericValue(row)) {
        return false;
    }

    const normalizedLabel =
        normalizeSectionLabel(label);

    for (const alias of aliases) {
        const normalizedAlias =
            normalizeSectionLabel(alias);

        if (
            normalizedLabel ===
                normalizedAlias &&
            matchesStructuralSection(
                label,
                [alias]
            )
        ) {
            return true;
        }

        const labelWords =
            normalizedLabel
                .split(" ")
                .filter(Boolean);

        const aliasWords =
            normalizedAlias
                .split(" ")
                .filter(Boolean);

        const suffixWords =
            labelWords.slice(
                aliasWords.length
            );

        if (
            labelWords.length >
                aliasWords.length &&
            labelWords
                .slice(0, aliasWords.length)
                .join(" ") ===
                normalizedAlias &&
            matchesStructuralSection(
                normalizedAlias,
                [alias]
            ) &&
            suffixWords.length === 2 &&
            suffixWords[0] === "schedule" &&
            /^[ivxlcdm]+$/.test(
                suffixWords[1]
            )
        ) {
            return true;
        }
    }

    return false;
}


function isGenericSectionBoundary(
    table,
    rowIndex
) {
    const row = table.rows[rowIndex];
    const label = getRowLabel(row);
    const rawLabel = String(row?.[0]?.text ?? "").trim();

    if (!label || safeAggregateLabel(label)) {
        return false;
    }

    if (hasNumericValue(row)) {
        return false;
    }

    const normalizedLabel = canonicalizeMatchText(label);

    if (
        normalizedLabel.includes("other ") ||
        /^\(?[a-z]+\s*\)/i.test(rawLabel)
    ) {
        return false;
    }

    for (
        let index = rowIndex + 1;
        index < table.rows.length;
        index++
    ) {
        const nextRow = table.rows[index];

        if (!nextRow || !nextRow.length) {
            continue;
        }

        return !hasNumericValue(nextRow);
    }

    return true;
}


function isExplicitSectionTotal(
    label,
    sectionAliases
) {
    const normalizedLabel = canonicalizeMatchText(label);

    if (!normalizedLabel || !Array.isArray(sectionAliases)) {
        return false;
    }

    return sectionAliases.some(alias => {
        const normalizedAlias = normalizeSectionLabel(alias);

        if (!normalizedAlias) {
            return false;
        }

        return normalizedLabel === `total ${normalizedAlias}` ||
            normalizedLabel.startsWith(`total ${normalizedAlias} `) ||
            normalizedLabel === `subtotal ${normalizedAlias}` ||
            normalizedLabel.startsWith(`subtotal ${normalizedAlias} `);
    });
}


/* =========================================================
   FIND CONFIGURED SECTIONS
   ========================================================= */

function findConfiguredSections(
    table,
    analyticsConfig
) {
    const signalGroups =
        getRequiredSectionSignals(
            analyticsConfig
        );

    if (
        !table ||
        !Array.isArray(table.rows) ||
        signalGroups.length === 0
    ) {
        return [];
    }

    const starts = [];

    for (
        let index = 0;
        index < table.rows.length;
        index++
    ) {
        const row =
            table.rows[index];

        if (
            !row ||
            !row.length
        ) {
            continue;
        }

        const label =
            getRowLabel(row);

        if (!label) {
            continue;
        }

        for (
            let groupIndex = 0;
            groupIndex <
                signalGroups.length;
            groupIndex++
        ) {
            if (
                isStructuralSectionHeading(
                    row,
                    signalGroups[groupIndex]
                )
            ) {
                starts.push({
                    groupIndex,
                    aliases:
                        signalGroups[
                            groupIndex
                        ],
                    startIndex:
                        index
                });

                break;
            }
        }
    }

    if (starts.length === 0) {
        return [];
    }

    starts.sort(
        (a, b) =>
            a.startIndex -
            b.startIndex
    );

    const sections = [];

    for (
        let index = 0;
        index < starts.length;
        index++
    ) {
        const current =
            starts[index];

        const next =
            starts[index + 1];

        let endIndex = next
            ? next.startIndex
            : table.rows.length;

        for (
            let rowIndex = current.startIndex + 1;
            rowIndex < endIndex;
            rowIndex++
        ) {
            const row = table.rows[rowIndex];

            if (
                isExplicitSectionTotal(
                    getRowLabel(row),
                    current.aliases
                ) &&
                hasNumericValue(row)
            ) {
                // Keep the source total in the section, but never scan past it.
                endIndex = rowIndex + 1;
                break;
            }

            const rowIsConfiguredMetric = Object.values(
                analyticsConfig?.metrics ?? {}
            ).some(metricConfig =>
                getConfiguredAliases(metricConfig).some(alias =>
                    matchesAnyAlias(getRowLabel(row), [alias])
                ) && hasValidYearValues(table, row)
            );

            if (!rowIsConfiguredMetric && isGenericSectionBoundary(table, rowIndex)) {
                endIndex = rowIndex;
                break;
            }
        }

        sections.push({
            sectionId: `section-${current.startIndex}`,
            groupIndex:
                current.groupIndex,

            aliases:
                current.aliases,

            startIndex:
                current.startIndex,

            endIndex
        });
    }

    return sections;
}


function getRowSection(
    rowIndex,
    sections
) {
    if (
        !Array.isArray(sections) ||
        sections.length === 0
    ) {
        return null;
    }

    return (
        sections.find(
            section =>
                rowIndex >
                    section.startIndex &&
                rowIndex <
                    section.endIndex
        ) ?? null
    );
}


/* =========================================================
   GENERIC METRIC CANDIDATES
   ========================================================= */

function findMetricCandidateRows(
    table,
    aliases,
    analyticsConfig,
    searchWholeTable = false
) {
    const sections =
        findConfiguredSections(
            table,
            analyticsConfig
        );

    const candidates = [];

    /*
     * No section configuration:
     * search entire table.
     */
    if (sections.length === 0 || searchWholeTable) {
        if (!searchWholeTable && getRequiredSectionSignals(analyticsConfig).length > 0) {
            return [];
        }

        for (
            let index = 0;
            index < table.rows.length;
            index++
        ) {
            const row =
                table.rows[index];

            if (
                !row ||
                !row.length
            ) {
                continue;
            }

            const label =
                getRowLabel(row);

            if (
                matchesAnyAlias(
                    label,
                    aliases
                )
            ) {
                candidates.push({
                    row,
                    rowIndex: index,
                    section: null
                });
            }
        }

        return candidates;
    }

    /*
     * Search only inside semantic sections.
     */
    for (const section of sections) {
        for (
            let index =
                section.startIndex + 1;
            index < section.endIndex;
            index++
        ) {
            const row =
                table.rows[index];

            if (
                !row ||
                !row.length
            ) {
                continue;
            }

            const label =
                getRowLabel(row);

            if (
                matchesAnyAlias(
                    label,
                    aliases
                )
            ) {
                candidates.push({
                    row,
                    rowIndex: index,
                    section
                });
            }
        }
    }

    return candidates;
}


/* =========================================================
   AGGREGATE HELPERS
   ========================================================= */

function safeAggregateLabel(
    label,
    aggregateAliases = []
) {
    const normalized =
        canonicalizeMatchText(label);

    if (!normalized) {
        return false;
    }

    if (
        normalized === "total" ||
        normalized === "subtotal"
    ) {
        return true;
    }

    if (
        normalized.startsWith("total ") ||
        normalized.startsWith("subtotal ")
    ) {
        return true;
    }

    return matchesAnyAlias(
        normalized,
        aggregateAliases
    );
}


function isSectionAggregateLabel(
    label,
    aggregateAliases = []
) {
    const normalized =
        canonicalizeMatchText(label);

    if (
        normalized === "total" ||
        normalized === "subtotal"
    ) {
        return true;
    }

    return aggregateAliases.some(
        alias =>
            canonicalizeMatchText(alias) ===
            normalized
    );
}


function getAllSectionAliases(
    metricsConfig
) {
    const aliases = [];

    for (
        const config of Object.values(
            metricsConfig ?? {}
        )
    ) {
        const structural =
            getStructuralAliases(
                config
            );

        aliases.push(
            ...structural.sectionAliases
        );
    }

    return [
        ...new Set(
            aliases.filter(Boolean)
        )
    ];
}


function findExplicitAggregateRow(
    table,
    aliases,
    role = "detail",
    startIndex = 0,
    concept = null
) {
    let bestMatch = null;

    for (
        let index = startIndex;
        index < table.rows.length;
        index++
    ) {
        const row =
            table.rows[index];

        if (
            !row ||
            !row.length
        ) {
            continue;
        }

        const label =
            getRowLabel(row);

        if (
            concept &&
            !conceptCompatible(concept, label)
        ) {
            continue;
        }

        if (
            !matchesAnyAlias(
                label,
                aliases
            )
        ) {
            continue;
        }

        if (!hasNumericValue(row)) {
            continue;
        }

        const candidate = {
            row,
            rowIndex: index,
            resolution: {
                method: role === "statementtotal"
                    ? "statementTotal"
                    : "source",
                reason: role === "statementtotal"
                    ? "explicitLabelledStatementTotal"
                    : "explicitLabelledTotal",
                confidence: 0.99,
                reconciliation: {
                    type: "label_match",
                    status: "explicit_source"
                }
            }
        };

        if (
            role === "statementtotal" ||
            role === "aggregate"
        ) {
            bestMatch = candidate;
            continue;
        }

        bestMatch ??= candidate;
    }

    return bestMatch;
}


function findNextMeaningfulLabel(
    table,
    startIndex
) {
    for (
        let index = startIndex + 1;
        index < table.rows.length;
        index++
    ) {
        const row =
            table.rows[index];

        if (
            !row ||
            !row.length
        ) {
            continue;
        }

        const label =
            getRowLabel(row);

        if (label) {
            return label;
        }
    }

    return "";
}


function isWeakSubtotalLabel(label) {
    const normalized = canonicalizeMatchText(label);

    return (
        normalized.includes("subtotal") ||
        normalized.includes("total") ||
        normalized.includes("amount") ||
        normalized.includes("net current")
    );
}


function findStatementTotalBoundary(
    table,
    metricsConfig,
    startIndex
) {
    const statementConfig = Object.values(
        metricsConfig ?? {}
    ).find(config => getMetricRole(config) === "statementtotal");

    if (!statementConfig) {
        return -1;
    }

    const aliases = getConfiguredAliases(statementConfig);

    const matches = [];

    for (let index = startIndex + 1; index < table.rows.length; index++) {
        const row = table.rows[index];

        if (
            hasValidYearValues(table, row) &&
            matchesAnyAlias(getRowLabel(row), aliases)
        ) {
            matches.push({
                index,
                explicit: aliases.some(alias =>
                    canonicalizeMatchText(alias) !== "total" &&
                    canonicalizeMatchText(getRowLabel(row)) ===
                    canonicalizeMatchText(alias)
                )
            });
        }
    }

    return matches.find(match => match.explicit)?.index ??
        matches.at(-1)?.index ??
        -1;
}


function isSubtotalValueShape(
    table,
    section,
    candidateIndex,
    aggregateAliases,
    concept = null
) {
    const yearColumns = getNumericColumns(table, section);

    if (yearColumns.length === 0) {
        return false;
    }

    const candidate = table.rows[candidateIndex];
    const candidateValues = yearColumns.map(columnIndex =>
        getNumericCellValue(candidate?.[columnIndex])
    );

    if (candidateValues.some(value => value === null)) {
        return false;
    }

    const components = getSubtotalComponents(
        table,
        section,
        candidateIndex,
        aggregateAliases,
        concept
    );
    const totals = yearColumns.map(() => 0);

    for (const component of components) {
        component.values.forEach((value, valueIndex) => {
            totals[valueIndex] += value;
        });
    }

    return (
        components.length > 0 &&
        candidateValues.every(
            (value, valueIndex) =>
                reconcilesWithinNumericTolerance(
                    value,
                    totals[valueIndex]
                )
        )
    );
}

function getSubtotalComponents(
    table,
    section,
    candidateIndex,
    aggregateAliases,
    concept = null
) {
    const yearColumns = getNumericColumns(table, section);
    const sectionLabel = getSectionLabel(table, section);
    const components = [];

    for (let index = section.startIndex + 1; index < candidateIndex; index++) {
        const row = table.rows[index];
        const label = getRowLabel(row);


        if (
            !label ||
            isSectionAggregateLabel(label, aggregateAliases) ||
            isAggregateCandidateLabel(label) ||
            !conceptCompatible(concept, label, sectionLabel)
        ) {
            continue;
        }

        const values = yearColumns.map(columnIndex =>
            getNumericCellValue(row?.[columnIndex])
        );

        if (values.some(value => value === null)) {
            continue;
        }

        components.push({ row, rowIndex: index, values });
    }

    return components;
}


function getNumericColumns(table, section) {
    const detectedColumns = getDetectedYearColumns(table);

    if (detectedColumns.length > 0) {
        return detectedColumns;
    }

    const counts = new Map();
    const startIndex = section?.startIndex ?? 0;
    const endIndex = section?.endIndex ?? table.rows.length;

    for (let rowIndex = startIndex + 1; rowIndex < endIndex; rowIndex++) {
        const row = table.rows[rowIndex];

        row?.forEach((cell, columnIndex) => {
            if (columnIndex > 0 && getNumericCellValue(cell) !== null) {
                counts.set(columnIndex, (counts.get(columnIndex) ?? 0) + 1);
            }
        });
    }

    return [...counts.entries()]
        .filter(([, count]) => count > 0)
        .sort((left, right) => left[0] - right[0])
        .map(([columnIndex]) => columnIndex);
}

function getColumnPeriodLabel(table, columnIndex) {
    const rows = [table?.headers, ...(table?.rows ?? [])];
    for (const row of rows) {
        const cell = row?.[columnIndex];
        const label = String(cell?.text ?? cell ?? "");
        const period = label.match(/\b20\d{2}\b/)?.[0];
        if (period) {
            return period;
        }
    }

    return String(columnIndex);
}


function getRowPeriodValues(table, row, section) {
    const columns = getNumericColumns(table, section);
    const values = getPeriodValues(table, row, columns);

    return values.some(value => value === null)
        ? null
        : values;
}


function valuesReconcile(left, right) {
    return left?.length > 0 &&
        left.length === right?.length &&
        left.every((value, index) =>
            reconcilesWithinNumericTolerance(value, right[index])
        );
}


function findReconciliationEvidence(
    table,
    section,
    candidateIndex,
    statementBoundary,
    metricsConfig,
    concept = null
) {
    if (statementBoundary < 0) {
        return null;
    }

    const statementRow = table.rows[statementBoundary];
    const statementValues = getRowPeriodValues(table, statementRow, section);

    if (!statementValues) {
        return null;
    }

    const candidateValues = getRowPeriodValues(
        table,
        table.rows[candidateIndex],
        section
    );

    if (!candidateValues) {
        return null;
    }

    const statementAliases = Object.values(metricsConfig ?? {})
        .filter(config => getMetricRole(config) === "statementtotal")
        .flatMap(getConfiguredAliases);

    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex++) {
        if (rowIndex === candidateIndex || rowIndex === statementBoundary) {
            continue;
        }

        if (
            rowIndex <= section.startIndex ||
            rowIndex >= section.endIndex ||
            !conceptCompatible(
                concept,
                getRowLabel(table.rows[rowIndex]),
                getSectionLabel(table, section)
            )
        ) {
            continue;
        }

        const row = table.rows[rowIndex];
        const label = getRowLabel(row);

        if (!label || !hasNumericValue(row)) {
            continue;
        }

        if (
            statementAliases.length > 0 &&
            matchesAnyAlias(label, statementAliases)
        ) {
            continue;
        }

        if (!isWeakSubtotalLabel(label) && !/^total\b/i.test(label)) {
            continue;
        }

        const knownValues = getRowPeriodValues(table, row, section);

        if (!knownValues) {
            continue;
        }

        const reconciled = statementValues.every((value, index) =>
            reconcilesWithinNumericTolerance(
                candidateValues[index] + knownValues[index],
                value
            )
        );

        if (reconciled) {
            return {
                rowIndex,
                statementBoundary,
                reason: `candidate + row #${rowIndex} reconciles with statement total`
            };
        }
    }

    return null;
}


function isStatementTotalValueShape(
    table,
    sections,
    candidateIndex,
    aggregateAliases
) {
    const yearColumns = getDetectedYearColumns(table);

    if (
        yearColumns.length === 0 ||
        !Array.isArray(sections) ||
        sections.length === 0
    ) {
        return false;
    }

    const candidateValues = yearColumns.map(columnIndex =>
        getNumericCellValue(
            table.rows[candidateIndex]?.[columnIndex]
        )
    );

    if (candidateValues.some(value => value === null)) {
        return false;
    }

    const firstSection = sections[0];
    const lastSection = sections[sections.length - 1];
    if (candidateIndex <= firstSection.startIndex) {
        return false;
    }

    const totals = yearColumns.map(() => 0);
    let detailCount = 0;

    for (
        let index = firstSection.startIndex + 1;
        index < candidateIndex;
        index++
    ) {
        const row = table.rows[index];
        const label = getRowLabel(row);

        if (
            !label ||
            isSectionAggregateLabel(label, aggregateAliases) ||
            !sections.some(
                section =>
                    index > section.startIndex &&
                    index < section.endIndex
            )
        ) {
            continue;
        }

        const values = yearColumns.map(columnIndex =>
            getNumericCellValue(row?.[columnIndex])
        );

        if (values.some(value => value === null)) {
            continue;
        }

        detailCount++;
        values.forEach((value, valueIndex) => {
            totals[valueIndex] += value;
        });
    }

    return (
        detailCount > 0 &&
        candidateIndex > lastSection.startIndex &&
        candidateValues.every(
            (value, valueIndex) =>
                reconcilesWithinNumericTolerance(
                    value,
                    totals[valueIndex]
                )
        )
    );
}


function findStructuralUnlabeledSubtotal(
    table,
    section,
    metricsConfig,
    aggregateAliases,
    concept = null
) {
    const statementBoundary = findStatementTotalBoundary(
        table,
        metricsConfig,
        section.startIndex
    );
    const candidates = [];

    for (let index = section.startIndex + 1; index < section.endIndex; index++) {
        const row = table.rows[index];
        const label = getRowLabel(row);

        if (
            !hasValidYearValues(table, row) ||
            (label && (
                safeAggregateLabel(label) ||
                !isWeakSubtotalLabel(label)
            ))
        ) {
            continue;
        }

        const hasDetailBefore = table.rows
            .slice(section.startIndex + 1, index)
            .some(candidateRow =>
                getRowLabel(candidateRow) &&
                hasValidYearValues(table, candidateRow)
            );

        if (!hasDetailBefore) {
            continue;
        }

        const valueShape = isSubtotalValueShape(
            table,
            section,
            index,
            aggregateAliases,
            concept
        );
        const candidateValues = getRowPeriodValues(table, row, section);
        const detailValues = table.rows
            .slice(section.startIndex + 1, index)
            .filter(detailRow => {
                const detailLabel = getRowLabel(detailRow);
                return detailLabel &&
                    hasValidYearValues(table, detailRow) &&
                    !isAggregateCandidateLabel(detailLabel) &&
                    conceptCompatible(concept, detailLabel, getSectionLabel(table, section));
            })
            .map(detailRow => getRowPeriodValues(table, detailRow, section));
        const reconcilesToLabeledDetails = candidateValues && detailValues.length > 0 &&
            detailValues.every(values => values) &&
            candidateValues.every((value, valueIndex) =>
                reconcilesWithinNumericTolerance(
                    value,
                    detailValues.reduce((sum, values) => sum + values[valueIndex], 0)
                )
            );
        const subtotalComponents = valueShape || reconcilesToLabeledDetails
            ? getSubtotalComponents(
                table,
                section,
                index,
                aggregateAliases,
                concept
            )
            : [];
        const reconciliation = findReconciliationEvidence(
            table,
            section,
            index,
            statementBoundary,
            metricsConfig,
            concept
        );

        if (!label) {
            let nextMeaningfulIndex = index + 1;

            while (
                nextMeaningfulIndex < section.endIndex &&
                !getRowLabel(table.rows[nextMeaningfulIndex]) &&
                !hasValidYearValues(table, table.rows[nextMeaningfulIndex])
            ) {
                nextMeaningfulIndex++;
            }

            const nextLabel = getRowLabel(
                table.rows[nextMeaningfulIndex]
            );
            const structurallyPositioned =
                nextMeaningfulIndex >= section.endIndex ||
                safeAggregateLabel(
                    nextLabel,
                    aggregateAliases
                ) ||
                isStructuralSectionHeading(
                    table.rows[nextMeaningfulIndex],
                    [
                        ...getAllSectionAliases(metricsConfig),
                        "assets",
                        "current assets",
                        "non current assets",
                        "liabilities",
                        "current liabilities",
                        "non current liabilities",
                        "equity",
                        "shareholders funds",
                        "shareholders equity"
                    ]
                ) ||
                (
                    statementBoundary >= 0 &&
                    nextMeaningfulIndex >= statementBoundary
                );

            if (
                (!structurallyPositioned && !reconcilesToLabeledDetails) ||
                (!valueShape && !reconciliation && !reconcilesToLabeledDetails)
            ) {
                continue;
            }
        }

        const distanceToStatementTotal = statementBoundary >= 0
            ? statementBoundary - index
            : 0;
        const duplicateDetail = table.rows
            .slice(section.startIndex + 1, index)
            .some(detailRow => valuesReconcile(
                candidateValues,
                getRowPeriodValues(table, detailRow, section)
            ));
        let score = 25;

        score += candidateValues ? 25 : 0;
        score += hasDetailBefore ? 15 : 0;
        score += statementBoundary >= 0 && index < statementBoundary ? 15 : 0;
        score += distanceToStatementTotal === 1
            ? 15
            : distanceToStatementTotal <= 3
                ? 8
                : 0;
        score += valueShape ? 10 : 0;
        score += reconciliation ? 40 : 0;
        score += reconcilesToLabeledDetails ? 40 : 0;
        score -= duplicateDetail ? 20 : 0;

        candidates.push({
            row,
            rowIndex: index,
            score,
            valueShape,
            reconciliation,
            distanceToStatementTotal,
            resolution: {
                method: "structuralSubtotal",
                reason: reconciliation
                    ? "reconciledSectionAndStatement"
                    : "reconciledSectionSubtotal",
                confidence: reconciliation ? 0.92 : 0.84,
                reconciliation: reconciliation ?? {
                    reason: "section detail rows reconcile to subtotal"
                },
                components: subtotalComponents.map(component => ({
                    rowIndex: component.rowIndex,
                    label: getRowLabel(component.row),
                    values: Object.fromEntries(
                        getNumericColumns(table, section).map((column, valueIndex) => [
                            getColumnPeriodLabel(table, column),
                            component.values[valueIndex]
                        ])
                    ),
                    concept: concept ?? classifyFinancialConcept(
                        getRowLabel(component.row),
                        getSectionLabel(table, section)
                    )
                }))
            }
        });
    }

    candidates.sort((left, right) =>
        right.score - left.score ||
        Number(right.valueShape) - Number(left.valueShape) ||
        right.rowIndex - left.rowIndex
    );

    const selected = candidates[0];

    if (!selected || selected.score < 75) {
        return null;
    }

    console.log(
        `[STRUCTURAL SUBTOTAL DEBUG] section=${section.startIndex}:${section.endIndex} candidates=${candidates.map(candidate =>
            `#${candidate.rowIndex} score=${candidate.score} ${candidate.reconciliation?.reason ?? "structural evidence"}`
        ).join("; ") || "(none)"} selected=#${selected.rowIndex} score=${selected.score}`
    );

    return selected;
}


/* =========================================================
   STRUCTURAL AGGREGATE RESOLUTION
   ========================================================= */

function findStructuralMetricRow(
    table,
    config,
    metricsConfig,
    analyticsConfig = {}
) {
    const configAliases =
        getConfiguredAliases(config);

    const structural =
        getStructuralAliases(config);

    /*
     * Metric-level structural aliases have priority.
     *
     * If absent, use analytics-level section signals.
     *
     * This is what allows minimal configuration.
     */
    let sectionAliases =
        structural.sectionAliases ?? [];

    if (
        sectionAliases.length === 0
    ) {
        sectionAliases =
            getConfiguredSectionAliasesFromTableSelection(
                analyticsConfig
            );
    }

    const aggregateAliases = [
        ...new Set([
            ...(structural.aggregateAliases ??
                []),
            ...configAliases
        ])
    ];

    const sectionSpecificAliases = sectionAliases.flatMap(
        sectionAlias => {
            const normalizedSection =
                normalizeSectionLabel(sectionAlias);

            return normalizedSection
                ? [
                    `total ${normalizedSection}`,
                    `subtotal ${normalizedSection}`
                ]
                : [];
        }
    );

    const allAggregateAliases = [
        ...new Set([
            ...aggregateAliases,
            ...sectionSpecificAliases
        ])
    ];

    const sectionAggregateAliases = [
        ...new Set([
            ...aggregateAliases,
            ...sectionSpecificAliases,
            "total",
            "subtotal"
        ])
    ];

    const metricSectionAliases =
        configAliases
            .map(alias =>
                alias.replace(
                    /^(?:total|subtotal)\s+/,
                    ""
                )
            )
            .filter(Boolean);

    const role =
        getMetricRole(config);

    const resolvesSectionTotal =
        role === "sectiontotal" ||
        role === "section" ||
        sectionAliases.length > 0;

    if (
        sectionAliases.length === 0
    ) {
        return null;
    }

    const sections =
        findConfiguredSections(
            table,
            analyticsConfig
        );

    /*
     * ---------------------------------------------------------
     * If analytics-level sections exist, use them.
     * ---------------------------------------------------------
     */
    if (sections.length > 0) {
        for (const section of sections) {
            /*
             * Only use a section matching this metric's
             * configured structural section when one exists.
             */
            const matchingSectionAliases =
                structural.sectionAliases?.length > 0
                    ? structural.sectionAliases
                    : role === "sectiontotal"
                        ? metricSectionAliases
                        : [];

            if (
                matchingSectionAliases.length > 0 &&
                !section.aliases.some(
                    alias =>
                        matchesStructuralSection(
                            alias,
                            matchingSectionAliases
                        ) ||
                        matchesStructuralSection(
                            matchingSectionAliases[0],
                            [alias]
                        )
                )
            ) {
                continue;
            }

            let exactAggregate = null;
            let strongLabeledAggregate = null;
            let explicitAggregate = null;
            let blankNumericCandidate = null;
            const statementBoundary =
                findStatementTotalBoundary(
                    table,
                    metricsConfig,
                    section.startIndex
                );

            for (
                let index =
                    section.startIndex + 1;
                index < section.endIndex;
                index++
            ) {
                const row =
                    table.rows[index];

                if (
                    !row ||
                    !row.length
                ) {
                    continue;
                }

                const label =
                    getRowLabel(row);

                const normalizedLabel =
                    canonicalizeMatchText(label);

                if (
                    label &&
                    hasNumericValue(row) &&
                    !conceptCompatible(
                        getMetricConcept(config),
                        label,
                        getSectionLabel(table, section)
                    )
                ) {
                    continue;
                }

                if (
                    label &&
                    hasNumericValue(row) &&
                    isSectionAggregateLabel(
                        label,
                        allAggregateAliases
                    )
                ) {
                    const genericTotal =
                        normalizedLabel ===
                            "total" ||
                        normalizedLabel ===
                            "subtotal" ||
                        normalizedLabel ===
                            "subtotal";

                    const exactConfiguredAlias =
                        configAliases.some(
                            alias =>
                                canonicalizeMatchText(
                                    label
                                ) ===
                                canonicalizeMatchText(
                                    alias
                                )
                        );

                    if (
                        role === "sectiontotal" &&
                        statementBoundary >= 0 &&
                        index >= statementBoundary &&
                        !exactConfiguredAlias
                    ) {
                        continue;
                    }

                    const reconcilesAsSectionTotal =
                        isSubtotalValueShape(
                            table,
                            section,
                            index,
                            sectionAggregateAliases
                        );

                    const reconcilesAsStatementTotal =
                        role === "statementtotal" &&
                        isStatementTotalValueShape(
                            table,
                            sections,
                            index,
                            sectionAggregateAliases
                        );

                    if (
                        exactConfiguredAlias &&
                        (
                            role !== "statementtotal" ||
                            reconcilesAsStatementTotal
                        ) &&
                        !(
                            role === "statementtotal" &&
                            normalizedLabel === "total"
                        ) &&
                        !exactAggregate
                    ) {
                        exactAggregate = {
                            row,
                            rowIndex: index,
                            resolution: {
                                method: "source",
                                reason: "explicitLabelledTotal",
                                confidence: 0.99,
                                reconciliation: null
                            }
                        };
                    } else if (
                        genericTotal &&
                        (
                            role === "statementtotal"
                                ? reconcilesAsStatementTotal
                                : reconcilesAsSectionTotal
                        )
                    ) {
                        strongLabeledAggregate = {
                            row,
                            rowIndex: index,
                            resolution: {
                                method: "source",
                                reason: "labelledTotal",
                                confidence: 0.94,
                                reconciliation: {
                                    reason: "section detail rows reconcile to labelled total"
                                }
                            }
                        };
                    } else if (
                        !genericTotal &&
                        (
                            role !== "statementtotal" ||
                            reconcilesAsStatementTotal
                        )
                    ) {
                        explicitAggregate ??= {
                            row,
                            rowIndex: index,
                            resolution: {
                                method: "source",
                                reason: "labelledTotal",
                                confidence: 0.96,
                                reconciliation: reconcilesAsSectionTotal
                                    ? {
                                        reason: "section detail rows reconcile to labelled total"
                                    }
                                    : null
                            }
                        };
                    }

                    continue;
                }

                /*
                 * Unlabelled numeric subtotal.
                 */
                if (
                    normalizedLabel === "" &&
                    hasNumericValue(row)
                ) {
                    const nextLabel =
                        findNextMeaningfulLabel(
                            table,
                            index
                        );
                    if (
                        nextLabel &&
                        isSectionAggregateLabel(
                            nextLabel,
                            sectionAggregateAliases
                        )
                    ) {
                        blankNumericCandidate = {
                            row,
                            rowIndex: index
                        };
                    }
                }
            }

            if (exactAggregate) {
                return exactAggregate;
            }

            if (strongLabeledAggregate) {
                return strongLabeledAggregate;
            }

            if (explicitAggregate) {
                return explicitAggregate;
            }

            if (
                resolvesSectionTotal
            ) {
                const structuralSubtotal =
                    findStructuralUnlabeledSubtotal(
                        table,
                        section,
                        metricsConfig,
                        sectionAggregateAliases,
                        getMetricConcept(config)
                    );

                if (role !== "statementtotal") {
                    return structuralSubtotal;
                }

            }

            if (role === "sectiontotal") {
                return findStructuralUnlabeledSubtotal(
                    table,
                    section,
                    metricsConfig,
                    sectionAggregateAliases,
                    getMetricConcept(config)
                );
            }
        }
    }

    /*
     * ---------------------------------------------------------
     * Legacy metric-level structural resolution.
     * ---------------------------------------------------------
     */
    let sectionStart = -1;

    for (
        let index = 0;
        index < table.rows.length;
        index++
    ) {
        const row =
            table.rows[index];

        if (
            !row ||
            !row.length
        ) {
            continue;
        }

        const label =
            getRowLabel(row);

        if (
            matchesAnyStructuralSection(
                label,
                sectionAliases
            )
        ) {
            sectionStart = index;
            break;
        }
    }

    if (sectionStart === -1) {
        return null;
    }

    const allSectionAliases =
        getAllSectionAliases(
            metricsConfig
        );

    let sectionEnd =
        table.rows.length;

    for (
        let index =
            sectionStart + 1;
        index < table.rows.length;
        index++
    ) {
        const row =
            table.rows[index];

        if (
            !row ||
            !row.length
        ) {
            continue;
        }

        const label =
            getRowLabel(row);

        if (!label) {
            continue;
        }

        if (
            matchesAnyStructuralSection(
                label,
                sectionAliases
            )
        ) {
            continue;
        }

        if (
            allSectionAliases.length > 0 &&
            matchesAnyStructuralSection(
                label,
                allSectionAliases
            )
        ) {
            sectionEnd = index;
            break;
        }
    }

    let exactAggregate = null;
    let strongLabeledAggregate = null;
    let explicitAggregate = null;
    let blankNumericCandidate = null;

    for (
        let index =
            sectionStart + 1;
        index < sectionEnd;
        index++
    ) {
        const row =
            table.rows[index];

        if (
            !row ||
            !row.length
        ) {
            continue;
        }

        const label =
            getRowLabel(row);

        const normalizedLabel =
            canonicalizeMatchText(label);

        if (
            label &&
            hasNumericValue(row) &&
            !conceptCompatible(
                getMetricConcept(config),
                label,
                getRowLabel(table.rows[sectionStart])
            )
        ) {
            continue;
        }

        if (
            label &&
            hasNumericValue(row) &&
            isSectionAggregateLabel(
                label,
                allAggregateAliases
            )
        ) {
            const genericTotal =
                normalizedLabel === "total" ||
                normalizedLabel === "subtotal" ||
                normalizedLabel === "subtotal";

            const exactConfiguredAlias =
                configAliases.some(
                    alias =>
                        canonicalizeMatchText(label) ===
                        canonicalizeMatchText(alias)
                );

            if (
                exactConfiguredAlias &&
                !exactAggregate
            ) {
                exactAggregate = {
                    row,
                    rowIndex: index
                };
            } else if (genericTotal) {
                strongLabeledAggregate = {
                    row,
                    rowIndex: index
                };
            } else if (!genericTotal) {
                explicitAggregate ??= {
                    row,
                    rowIndex: index
                };
            }

            continue;
        }

        if (
            normalizedLabel === "" &&
            hasNumericValue(row)
        ) {
            const nextLabel =
                findNextMeaningfulLabel(
                    table,
                    index
                );

            if (
                nextLabel &&
                isSectionAggregateLabel(
                    nextLabel,
                    allAggregateAliases
                )
            ) {
                blankNumericCandidate = {
                    row,
                    rowIndex: index
                };
            }
        }
    }

    if (exactAggregate) {
        return exactAggregate;
    }

    if (strongLabeledAggregate) {
        return strongLabeledAggregate;
    }

    if (explicitAggregate) {
        return explicitAggregate;
    }

    if (
        resolvesSectionTotal
    ) {
        const structuralSubtotal =
            findStructuralUnlabeledSubtotal(
                table,
                {
                    startIndex: sectionStart,
                    endIndex: sectionEnd
                },
                metricsConfig,
                sectionAggregateAliases,
                getMetricConcept(config)
            );

        return structuralSubtotal;
    }

    return null;
}


/* =========================================================
   GENERIC AGGREGATE FINDER
   ========================================================= */

function findAggregateMetricRow(
    table,
    config,
    metricsConfig,
    analyticsConfig = {}
) {
    const aliases =
        getConfiguredAliases(config);

    const role =
        getMetricRole(config);

    const semanticSections = findConfiguredSections(
        table,
        analyticsConfig
    );

    if (role === "statementtotal") {
        const explicitStatementTotal = findExplicitAggregateRow(
            table,
            aliases.filter(alias => canonicalizeMatchText(alias) !== "total"),
            role,
            0,
            getMetricConcept(config)
        );

        if (explicitStatementTotal) {
            explicitStatementTotal.row.__analyticsResolution =
                explicitStatementTotal.resolution;
            return explicitStatementTotal.row;
        }
    }

    if (role === "aggregate") {
        const explicitAggregate = findExplicitAggregateRow(
            table,
            aliases,
            role,
            0,
            getMetricConcept(config)
        );

        if (explicitAggregate && conceptCompatible(
            getMetricConcept(config),
            getRowLabel(explicitAggregate.row)
        )) {
            explicitAggregate.row.__analyticsResolution = explicitAggregate.resolution;
            return explicitAggregate.row;
        }

        const componentAggregate = findDebtComponentAggregate(
            table,
            config,
            metricsConfig,
            analyticsConfig
        );

        if (componentAggregate) {
            return componentAggregate.row;
        }
    }

    /*
     * Section totals must be resolved inside their section.
     * A global alias match could otherwise select a similarly
     * named total from another section.
     */
    if (
        role !== "sectiontotal" &&
        semanticSections.length === 0 &&
        getRequiredSectionSignals(analyticsConfig).length === 0
    ) {
        const explicitAliases =
            role === "statementtotal" &&
            semanticSections.length > 0
                ? aliases.filter(alias => alias !== "total")
                : aliases;

        const explicit =
            findExplicitAggregateRow(
                table,
                explicitAliases,
                role,
                0,
                getMetricConcept(config)
            );

        if (explicit) {
            explicit.row.__analyticsResolution = explicit.resolution;
            return explicit.row;
        }
    }

    const structural =
        getStructuralAliases(config);

    const analyticsSections =
        getConfiguredSectionAliasesFromTableSelection(
            analyticsConfig
        );

    const hasStructuralMetadata =
        (
            structural.sectionAliases?.length ??
            0
        ) > 0 ||
        (
            structural.aggregateAliases?.length ??
            0
        ) > 0 ||
        analyticsSections.length > 0;

    const requiresAggregateResolution =
        role === "sectiontotal" ||
        role === "statementtotal" ||
        role === "aggregate";

    if (
        !hasStructuralMetadata &&
        !requiresAggregateResolution
    ) {
        return null;
    }

    /*
     * Structural resolution.
     */
    const structuralMatch =
        findStructuralMetricRow(
            table,
            config,
            metricsConfig,
            analyticsConfig
        );

    if (structuralMatch?.row) {
        structuralMatch.row.__analyticsResolution =
            structuralMatch.resolution ??
            structuralMatch.row.__analyticsResolution ?? {
                method: "structural_resolution",
                confidence: 0.72,
                reconciliation: null
            };
        return structuralMatch.row;
    }

    if (role === "statementtotal" && structural.sectionAliases?.length > 0) {
        const sectionStart = table.rows.findIndex(row =>
            matchesAnyStructuralSection(getRowLabel(row), structural.sectionAliases)
        );
        if (sectionStart >= 0) {
            const sectionEnd = table.rows.findIndex((row, index) =>
                index > sectionStart &&
                matchesAnyStructuralSection(
                    getRowLabel(row),
                    getAllSectionAliases(metricsConfig)
                )
            );
            const endIndex = sectionEnd >= 0 ? sectionEnd : table.rows.length;
            const yearColumns = getNumericColumns(table, { startIndex: sectionStart, endIndex });
            const reconciledSectionTotal = table.rows
                .slice(sectionStart + 1, endIndex)
                .map((row, offset) => ({ row, index: sectionStart + 1 + offset }))
                .filter(candidate => !getRowLabel(candidate.row) && hasValidYearValues(table, candidate.row))
                .find(candidate => {
                    const candidateValues = getPeriodValues(table, candidate.row, yearColumns);
                    const detailValues = table.rows
                        .slice(sectionStart + 1, candidate.index)
                        .filter(row => getRowLabel(row) && hasValidYearValues(table, row))
                        .map(row => getPeriodValues(table, row, yearColumns));
                    return detailValues.length > 0 && candidateValues.every((value, valueIndex) =>
                        reconcilesWithinNumericTolerance(
                            value,
                            detailValues.reduce((sum, values) => sum + values[valueIndex], 0)
                        )
                    );
                });
            if (reconciledSectionTotal) {
                reconciledSectionTotal.row.__analyticsResolution = {
                    method: "structuralSubtotal",
                    reason: "reconciledConfiguredSection",
                    confidence: 0.9,
                    reconciliation: { reason: "section detail rows reconcile to total" }
                };
                return reconciledSectionTotal.row;
            }
            const sectionTotal = findStructuralUnlabeledSubtotal(
                table,
                { startIndex: sectionStart, endIndex },
                metricsConfig,
                ["total", "subtotal"],
                getMetricConcept(config)
            );
            if (sectionTotal?.row) {
                sectionTotal.row.__analyticsResolution = sectionTotal.resolution;
                return sectionTotal.row;
            }
        }
    }

    if (role === "sectiontotal") {
        return null;
    }

    /*
     * Statement-total fallback.
     *
     * Never use a fixed row number.
     */
    if (
        role !== "statementtotal"
    ) {
        return null;
    }

    const sections =
        findConfiguredSections(
            table,
            analyticsConfig
        );

    /*
     * If semantic sections exist, search the
     * final section for the statement total.
     */
    if (sections.length > 0 && structural.sectionAliases?.length === 0) {
        const section =
            sections[sections.length - 1];

        let lastAggregate = null;

        for (
            let index =
                section.startIndex + 1;
            index < section.endIndex;
            index++
        ) {
            const row =
                table.rows[index];

            if (
                !row ||
                !row.length ||
                !hasNumericValue(row)
            ) {
                continue;
            }

            const label =
                getRowLabel(row);

            if (
                safeAggregateLabel(
                    label,
                    structural.aggregateAliases ??
                        aliases
                )
            ) {
                lastAggregate = row;
            }
        }

        if (lastAggregate) {
            lastAggregate.__analyticsResolution = {
                method: "statementTotal",
                reason: "labelledStatementTotal",
                confidence: 0.8,
                reconciliation: null
            };
            return lastAggregate;
        }

        const statementCandidates = [];
        const lastSection = sections.at(-1);
        for (let index = lastSection.startIndex + 1; index < lastSection.endIndex; index++) {
            const row = table.rows[index];
            if (!getRowLabel(row) && hasValidYearValues(table, row)) {
                statementCandidates.push({ row, index });
            }
        }

        const reconciledStatement = statementCandidates
            .filter(candidate => isStatementTotalValueShape(
                table,
                sections,
                candidate.index,
                aliases
            ))
            .at(-1);

        const statementCandidate = reconciledStatement ?? statementCandidates
            .sort((left, right) =>
                getContextValues(right.row).reduce((sum, value) => sum + value, 0) -
                getContextValues(left.row).reduce((sum, value) => sum + value, 0)
            )
            .at(0);
        if (statementCandidate) {
            statementCandidate.row.__analyticsResolution = {
                method: "statementTotal",
                reason: reconciledStatement
                    ? "reconciledUnlabelledStatementTotal"
                    : "unlabelledStatementBoundaryTotal",
                confidence: reconciledStatement ? 0.9 : 0.78,
                reconciliation: reconciledStatement
                    ? { reason: "statement detail rows reconcile to total" }
                    : null
            };
            return statementCandidate.row;
        }
    }

    return null;
}


function logSectionTotalMatch(
    metricName,
    config,
    table,
    selectedRow,
    analyticsConfig
) {
    const structural =
        getStructuralAliases(config);

    const sectionAliases =
        structural.sectionAliases.length > 0
            ? structural.sectionAliases
            : getConfiguredSectionAliasesFromTableSelection(
                analyticsConfig
            );

    const sections =
        findConfiguredSections(
            table,
            analyticsConfig
        );

    const selectedIndex = selectedRow
        ? table.rows.indexOf(selectedRow)
        : -1;

    const fallbackStartIndex =
        selectedIndex >= 0
            ? table.rows.reduce(
                (startIndex, row, index) =>
                    index <= selectedIndex &&
                    matchesAnyStructuralSection(
                        getRowLabel(row),
                        sectionAliases
                    )
                        ? index
                        : startIndex,
                -1
            )
            : -1;

    const section =
        sections.find(
            candidate =>
                selectedIndex > candidate.startIndex &&
                selectedIndex <= candidate.endIndex
        ) ??
        [...sections]
            .reverse()
            .find(candidate =>
                selectedIndex > candidate.startIndex
            ) ??
        (
            fallbackStartIndex >= 0
                ? {
                    startIndex: fallbackStartIndex,
                    endIndex: selectedIndex
                }
                : null
        );

    const sectionLabel = section
        ? table.rows[section.startIndex]?.[0]?.text ??
          section.aliases.join(" / ")
        : sectionAliases.join(" / ") || "unresolved";

    const structuralCandidate = section
        ? findStructuralUnlabeledSubtotal(
            table,
            section,
            analyticsConfig?.metrics,
            [
                ...structural.aggregateAliases,
                ...getConfiguredAliases(config),
                "total",
                "subtotal"
            ]
        )
        : null;

    let candidateRows = section
        ? table.rows
            .slice(
                section.startIndex + 1,
                Math.min(
                    Math.max(
                        section.endIndex + 1,
                        selectedIndex + 1
                    ),
                    table.rows.length
                )
            )
            .map((row, offset) => ({
                row,
                rowIndex: section.startIndex + 1 + offset
            }))
            .filter(candidate =>
                hasNumericValue(candidate.row)
            )
            .map(candidate =>
                `#${candidate.rowIndex} ${getRowLabel(candidate.row) || "(blank)"}`
            )
            .map(candidate => {
                const label = getRowLabel(candidate.row);
                const normalizedLabel =
                    canonicalizeMatchText(label);
                const aliases = [
                    ...getConfiguredAliases(config),
                    ...(structural.aggregateAliases ?? []),
                    "total",
                    "subtotal"
                ];
                let priority = null;
                let reason = null;

                if (
                    aliases.some(alias =>
                        canonicalizeMatchText(alias) ===
                        normalizedLabel
                    )
                ) {
                    priority = 1;
                    reason = "exact configured alias";
                } else if (
                    normalizedLabel === "total" ||
                    normalizedLabel === "subtotal" ||
                    normalizedLabel.startsWith("total ") ||
                    normalizedLabel.startsWith("subtotal ")
                ) {
                    priority = 2;
                    reason = "strong normalized total/subtotal label";
                } else if (
                    safeAggregateLabel(label, aliases)
                ) {
                    priority = 3;
                    reason = "semantically valid labeled aggregate";
                } else if (!label) {
                    const nextLabel =
                        findNextMeaningfulLabel(
                            table,
                            candidate.rowIndex
                        );

                    if (
                        nextLabel &&
                        isSectionAggregateLabel(
                            nextLabel,
                            aliases
                        )
                    ) {
                        priority = 4;
                        reason = "structural fallback";
                    }
                } else if (
                    !safeAggregateLabel(label) &&
                    (
                        !label ||
                        isWeakSubtotalLabel(label) ||
                        isSubtotalValueShape(
                            table,
                            section,
                            candidate.rowIndex,
                            aliases
                        )
                    )
                ) {
                    priority = 4;
                    reason = "structural fallback candidate";
                }

                return priority
                    ? `#${candidate.rowIndex} ${label || "(blank)"} [priority ${priority}: ${reason}]`
                    : null;
            })
            .filter(Boolean)
        : [];

    const selectedLabel = selectedRow
        ? getRowLabel(selectedRow) || "(blank)"
        : "(none)";
    const selectedResolution =
        selectedRow?.__analyticsResolution ?? null;

    let reason = selectedResolution?.reason ?? "unresolved";

    if (selectedRow) {
        const normalizedSelected =
            canonicalizeMatchText(selectedLabel);

        if (
            getConfiguredAliases(config).some(
                alias =>
                    canonicalizeMatchText(alias) ===
                    normalizedSelected
            )
        ) {
            reason = "exact configured alias within section";
        } else if (
            structuralCandidate?.rowIndex === selectedIndex
        ) {
            reason = "structurally identified section subtotal";
        } else if (
            normalizedSelected === "total" ||
            normalizedSelected === "subtotal" ||
            normalizedSelected.startsWith("total ") ||
            normalizedSelected.startsWith("subtotal ")
        ) {
            reason = "strong normalized total/subtotal label";
        } else if (!getRowLabel(selectedRow)) {
            reason = "structurally identified section-ending subtotal";
        } else {
            reason = "section-specific total label";
        }

        if (selectedResolution?.reason) {
            reason = selectedResolution.reason;
        }

        if (
            candidateRows.length === 0 &&
            selectedRow
        ) {
            const selectedPriority =
                reason === "exact configured alias within section"
                    ? 1
                    : reason === "strong normalized total/subtotal label"
                        ? 2
                        : reason === "section-specific total label"
                            ? 3
                            : 4;

            candidateRows = [
                `#${selectedIndex} ${selectedLabel} [priority ${selectedPriority}: ${reason}]`
            ];
        }
    }

    console.log(
        `[SECTION TOTAL DEBUG] ${metricName} -> ${sectionLabel} -> candidate rows: ${candidateRows.join(", ") || "(none)"} -> selected row: ${selectedIndex >= 0 ? `#${selectedIndex} ${selectedLabel}` : selectedLabel} -> reason: ${reason}`
    );
}


/* =========================================================
   CHILD ROW RESOLUTION
   ========================================================= */

function findChildMetricRow(
    table,
    parentRowIndex,
    aliases,
    boundaryAliases = []
) {
    for (
        let index =
            parentRowIndex + 1;
        index < table.rows.length;
        index++
    ) {
        const row =
            table.rows[index];

        if (
            !row ||
            !row.length
        ) {
            continue;
        }

        const label =
            getRowLabel(row);

        /*
         * Stop when another semantic section begins.
         */
        if (
            boundaryAliases.length > 0 &&
            label &&
            matchesAnyStructuralSection(
                label,
                boundaryAliases
            ) &&
            index !==
                parentRowIndex + 1
        ) {
            break;
        }

        if (!hasNumericValue(row)) {
            continue;
        }

        if (
            matchesAnyAlias(
                label,
                aliases
            )
        ) {
            return row;
        }
    }

    return null;
}


function isExactMetricLabelMatch(
    rowLabel,
    aliases
) {
    const normalizedRow =
        canonicalizeMatchText(
            rowLabel
        );

    return aliases.some(
        alias =>
            normalizedRow ===
            canonicalizeMatchText(alias)
    );
}


/* =========================================================
   MAIN METRIC MATCHER
   ========================================================= */

function findMetricRows(
    table,
    metricsConfig,
    analyticsConfig = {}
) {
    const matches = {};

    const configuredSections =
        findConfiguredSections(
            table,
            analyticsConfig
        );

    const tableSelectionSectionAliases =
        getConfiguredSectionAliasesFromTableSelection(
            analyticsConfig
        );

    for (
        const [
            metricName,
            config
        ] of Object.entries(
            metricsConfig ?? {}
        )
    ) {
        const aliases =
            getConfiguredAliases(config);

        if (aliases.length === 0) {
            continue;
        }

        const allowChildRows =
            !Array.isArray(config) &&
            config?.allowChildRows === true;

        const role =
            getMetricRole(config);

        /*
         * -----------------------------------------------------
         * AGGREGATES
         * -----------------------------------------------------
         */
        if (
            role === "sectiontotal" ||
            role === "statementtotal" ||
            role === "aggregate"
        ) {
            const aggregateRow =
                findAggregateMetricRow(
                    table,
                    config,
                    metricsConfig,
                    analyticsConfig
                );

            if (role === "sectiontotal") {
                logSectionTotalMatch(
                    metricName,
                    config,
                    table,
                    aggregateRow,
                    analyticsConfig
                );
            }

            if (aggregateRow) {
                matches[metricName] = {
                    metricName,
                    rowLabel:
                        getSemanticRowLabel(aggregateRow),
                    row:
                        aggregateRow
                };
            }

            continue;
        }

        /*
         * -----------------------------------------------------
         * DETAIL METRICS
         * -----------------------------------------------------
         */

        let candidates = [];

        if (
            configuredSections.length > 0
        ) {
            /*
             * Search only inside configured sections.
             */
            for (
                const section of
                configuredSections
            ) {
                const sectionRow = table.rows[section.startIndex];

                if (
                    sectionRow &&
                    matchesAnyAlias(getRowLabel(sectionRow), aliases) &&
                    hasValidYearValues(table, sectionRow)
                ) {
                    candidates.push({
                        row: sectionRow,
                        rowIndex: section.startIndex,
                        section
                    });
                }

                for (
                    let index =
                        section.startIndex + 1;
                    index < section.endIndex;
                    index++
                ) {
                    const row =
                        table.rows[index];

                    if (
                        !row ||
                        !row.length
                    ) {
                        continue;
                    }

                    const rowLabel =
                        getRowLabel(row);

                    if (
                        matchesAnyAlias(
                            rowLabel,
                            aliases
                        )
                    ) {
                        candidates.push({
                            row,
                            rowIndex: index,
                            section
                        });
                    }
                }
            }
        } else {
            /*
             * No section signals:
             * preserve generic full-table search.
             */
            candidates =
                findMetricCandidateRows(
                    table,
                    aliases,
                    analyticsConfig
                );
        }

        if (config?.searchOutsideSections) {
            candidates = [
                ...findMetricCandidateRows(table, aliases, analyticsConfig, true),
                ...candidates
            ];
        }

        let numericMatch = null;
        let parentMatch = null;

        /*
         * Prefer exact numeric matches.
         */
        for (
            const candidate of candidates
        ) {
            const row =
                candidate.row;

            if (hasValidYearValues(table, row)) {
                /*
                 * Exact label always wins.
                 */
                if (
                    isExactMetricLabelMatch(
                        getRowLabel(row),
                        aliases
                    )
                ) {
                    numericMatch =
                        candidate;

                    break;
                }

                if (!numericMatch) {
                    numericMatch =
                        candidate;
                }

                continue;
            }

            if (
                allowChildRows &&
                parentMatch === null
            ) {
                parentMatch =
                    candidate;
            }
        }

        let matchedRow = null;

        if (numericMatch) {
            matchedRow =
                numericMatch.row;
        }

        /*
         * Parent row without values:
         * search its children.
         */
        else if (
            allowChildRows &&
            parentMatch
        ) {
            let boundaryAliases = [
                ...new Set([
                    ...tableSelectionSectionAliases,
                    ...getAllSectionAliases(
                        metricsConfig
                    )
                ])
            ];

            /*
             * Add current section aliases.
             *
             * This is deliberately `let`, not `const`.
             */
            if (parentMatch.section) {
                boundaryAliases = [
                    ...new Set([
                        ...boundaryAliases,
                        ...parentMatch
                            .section
                            .aliases
                    ])
                ];
            }

            const childRow =
                findChildMetricRow(
                    table,
                    parentMatch.rowIndex,
                    aliases,
                    boundaryAliases
                );

            matchedRow =
                childRow ??
                parentMatch.row;
        }

        const structural = getStructuralAliases(config);

        if (
            !matchedRow &&
            metricName === "profitAfterTax"
        ) {
            const structuralPat = findStructuralPatRow(
                table,
                metricsConfig,
                analyticsConfig
            );

            if (structuralPat) {
                matchedRow = structuralPat.row;
                matchedRow.__analyticsResolution = structuralPat.resolution;
            }
        }

        if (
            !matchedRow &&
            (
                structural.sectionAliases.length > 0 ||
                structural.aggregateAliases.length > 0
            )
        ) {
            matchedRow = findAggregateMetricRow(
                table,
                config,
                metricsConfig,
                analyticsConfig
            );
        }

        if (matchedRow) {
            matchedRow.__analyticsResolution ??= {
                method: "labelled_source",
                confidence: isExactMetricLabelMatch(
                    getRowLabel(matchedRow),
                    aliases
                ) ? 0.99 : 0.82,
                reconciliation: null
            };

            matches[metricName] = {
                metricName,
                rowLabel:
                    getSemanticRowLabel(matchedRow),
                row:
                    matchedRow
            };
        }
    }

    return matches;
}


/* =========================================================
   EXPORTS
   ========================================================= */

function canonicalRowRole(role) {
    const normalized = String(role ?? "").trim().toLowerCase();
    const canonicalRoles = {
        header: "header",
        detail: "detail",
        subtotal: "subtotal",
        sectiontotal: "sectionTotal",
        aggregate: "aggregate",
        result: "result",
        tax: "tax",
        statementtotal: "statementTotal",
        unknown: "unknown"
    };

    if (canonicalRoles[normalized]) {
        return canonicalRoles[normalized];
    }

    if (normalized.includes("tax")) return "tax";
    if (["profit", "persharemetric", "cashbalance"].includes(normalized)) return "result";
    if (["income", "expense", "operatingmetric", "operatingadjustment", "workingcapitaladjustment", "operatingcashitem", "investingcashitem", "financingcashitem", "cashcomponent"].includes(normalized)) return "detail";

    return "unknown";
}

function getContextValues(row) {
    if (row?.values && typeof row.values === "object") {
        return Object.values(row.values).map(Number).filter(Number.isFinite);
    }

    if (Array.isArray(row)) {
        return row.slice(1).map(getNumericCellValue).filter(value => value !== null);
    }

    return [];
}

function valuesReconcileToSum(candidate, rows) {
    const candidateValues = getContextValues(candidate);
    const sourceValues = rows.map(getContextValues);

    if (candidateValues.length === 0 || sourceValues.some(values => values.length !== candidateValues.length)) {
        return false;
    }

    return candidateValues.every((value, valueIndex) =>
        reconcilesWithinNumericTolerance(
            value,
            sourceValues.reduce((sum, values) => sum + values[valueIndex], 0)
        )
    );
}

function resolveRowRole(row, context = {}) {
    const label = normalizeFinancialLabel(row?.label ?? getSemanticRowLabel(row));
    const normalizedLabel = canonicalizeMatchText(label);
    const metricConfigs = context.metricConfigs ?? {};
    const metricNames = context.metricNames ?? [];
    const configuredRoles = metricNames
        .map(metricName => canonicalRowRole(metricConfigs[metricName]?.role ?? context.metricRole))
        .filter(role => role !== "unknown");
    const hasValues = getContextValues(row).length > 0;

    const structuralRole = configuredRoles.find(role =>
        ["statementTotal", "sectionTotal", "subtotal", "aggregate", "result", "tax"].includes(role)
    );
    if (structuralRole) {
        return { role: structuralRole, confidence: 0.99, reason: "validated configured structural role" };
    }

    const rows = Array.isArray(context.section?.rows)
        ? context.section.rows
        : Array.isArray(context.rows) ? context.rows : [];
    const rowIndex = Number.isInteger(context.rowIndex) ? context.rowIndex : rows.indexOf(row);
    const previousRows = rows
        .filter(candidate => (candidate.rowIndex ?? rows.indexOf(candidate)) < rowIndex)
        .filter(candidate => getContextValues(candidate).length > 0);
    const previousStructural = previousRows.filter(candidate =>
        ["sectionTotal", "subtotal", "aggregate", "statementTotal"].includes(candidate.role)
    );

    if (!label && hasValues && valuesReconcileToSum(row, previousRows.slice(-10).filter(candidate => {
        const candidateLabel = canonicalizeMatchText(candidate.label);
        return candidateLabel && !/\b(?:total|subtotal|profit|loss|tax|cash flow|closing|opening)\b/.test(candidateLabel);
    }))) {
        return { role: "sectionTotal", confidence: 0.92, reason: "preceding detail rows reconcile to parent total" };
    }

    if (normalizedLabel && /\b(?:profit|loss|exceptional|extraordinary|earnings per share|net income|net cash flow|opening cash|closing cash)\b/.test(normalizedLabel)) {
        return { role: "result", confidence: 0.9, reason: "statement result semantic classification" };
    }

    if (normalizedLabel && /\b(?:tax|deferred tax|current tax)\b/.test(normalizedLabel)) {
        return { role: "tax", confidence: 0.9, reason: "tax semantic classification" };
    }

    if (normalizedLabel && /\b(?:total|subtotal|aggregate|gross profit|operating profit|cash generated from|cash used in|cash and cash equivalents)\b/.test(normalizedLabel)) {
        const sectionQualifier = /\b(?:current|non current|noncurrent)\b/.test(normalizedLabel);
        const statementLike = !sectionQualifier && /\b(?:assets|liabilities|equity|income|expenses|expense|period|year|net cash|closing cash)\b/.test(normalizedLabel);
        return { role: statementLike ? "statementTotal" : "sectionTotal", confidence: 0.88, reason: "generic structural total semantics" };
    }

    if (!label && hasValues && previousStructural.length > 0) {
        return { role: "sectionTotal", confidence: 0.78, reason: "unlabelled numeric row follows structural parent" };
    }

    if (label && hasValues) {
        return { role: "detail", confidence: 0.8, reason: "labelled numeric source row" };
    }

    return { role: "unknown", confidence: 0.1, reason: "insufficient semantic or structural evidence" };
}

export {
    findMetricRows,
    findConfiguredSections,
    getRequiredSectionSignals,
    normalizeText,
    canonicalizeMatchText,
    normalizeFinancialLabel,
    canonicalRowRole,
    resolveRowRole,
    getRowLabel,
    hasNumericValue,
    matchesAnyAlias
};