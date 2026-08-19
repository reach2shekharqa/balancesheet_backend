function normalizeText(value) {
    return String(value ?? "")
        .toLowerCase()
        .replace(/&amp;/g, "&")
        .replace(/&/g, " and ")
        .replace(/[()]/g, " ")
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
        .filter(token => !/^\d+$/.test(token))
        .map(singularizeWord)
        .join(" ");
}


function getRowLabel(row) {
    if (!row || !row.length) {
        return "";
    }

    return normalizeText(row[0]?.text);
}


function getRowValues(row) {
    if (!row || !row.length) {
        return [];
    }

    return row
        .slice(1)
        .map(cell => normalizeText(cell?.text));
}


function isSpecificEnoughForContainedMatch(shorterText, longerText) {
    if (!shorterText || !longerText) {
        return false;
    }

    const shorterTokens = shorterText.split(" ").filter(Boolean);
    const longerTokens = longerText.split(" ").filter(Boolean);

    if (shorterTokens.length <= 1) {
        return false;
    }

    if (longerTokens.length <= shorterTokens.length) {
        return false;
    }

    return longerTokens.length - shorterTokens.length <= 2;
}


function getTokenMatchQuality(rowLabel, alias) {
    const normalizedRow = canonicalizeMatchText(rowLabel);
    const normalizedAlias = canonicalizeMatchText(alias);

    if (!normalizedRow || !normalizedAlias) {
        return null;
    }

    const rowWords = normalizedRow.split(" ").filter(Boolean).filter(token => !/^\d+$/.test(token));
    const aliasWords = normalizedAlias.split(" ").filter(Boolean).filter(token => !/^\d+$/.test(token));

    if (rowWords.length === 0 || aliasWords.length === 0) {
        return null;
    }

    const rowWordSet = new Set(rowWords);
    const aliasWordSet = new Set(aliasWords);

    const missingFromRow = [...aliasWordSet].filter(word => !rowWordSet.has(word));
    const missingFromAlias = [...rowWordSet].filter(word => !aliasWordSet.has(word));
    const totalWordDifference = missingFromRow.length + missingFromAlias.length;

    if (totalWordDifference > 1) {
        return null;
    }

    if (totalWordDifference === 1) {
        const onlyDifference = missingFromRow[0] ?? missingFromAlias[0];
        const connectorWords = new Set([
            "and", "or", "the", "of", "for", "at", "to", "in", "on",
            "with", "by", "as", "per", "a", "an", "it", "net", "gross"
        ]);

        if (onlyDifference && !connectorWords.has(onlyDifference)) {
            return null;
        }
    }

    const sharedWords = [...rowWordSet].filter(word => aliasWordSet.has(word));
    const minWordCount = Math.min(rowWordSet.size, aliasWordSet.size);

    if (minWordCount === 0) {
        return null;
    }

    return sharedWords.length / minWordCount;
}


function getBestAliasMatch(rowLabel, aliases) {
    let bestMatch = null;

    for (const alias of aliases) {
        const normalizedAlias = canonicalizeMatchText(alias);
        const normalizedRow = canonicalizeMatchText(rowLabel);

        if (!normalizedAlias || !normalizedRow) {
            continue;
        }

        let matchRank = null;

        if (normalizedRow === normalizedAlias) {
            matchRank = 1;
        } else if (normalizedRow.includes(normalizedAlias)) {
            const rowTokens = normalizedRow.split(" ").filter(Boolean).filter(token => !/^\d+$/.test(token));
            const aliasTokens = normalizedAlias.split(" ").filter(Boolean).filter(token => !/^\d+$/.test(token));
            const leadingExtra = normalizedRow.slice(0, normalizedRow.indexOf(normalizedAlias)).trim();
            const trailingExtra = normalizedRow.slice(normalizedRow.indexOf(normalizedAlias) + normalizedAlias.length).trim();
            const trailingStartsWithAnd = trailingExtra.startsWith("and ") || trailingExtra.startsWith("or ") || trailingExtra.startsWith("& ");

            if (
                aliasTokens.length === 1 &&
                ["total", "subtotal"].includes(aliasTokens[0]) &&
                rowTokens.length > 1
            ) {
                continue;
            }

            if (
                rowTokens.length - aliasTokens.length <= 2 ||
                (trailingStartsWithAnd && trailingExtra.split(" ").filter(Boolean).length <= 3) ||
                (leadingExtra && leadingExtra.split(" ").filter(Boolean).length <= 2)
            ) {
                matchRank = 2;
            }
        } else if (
            normalizedAlias.includes(normalizedRow) &&
            isSpecificEnoughForContainedMatch(normalizedRow, normalizedAlias)
        ) {
            matchRank = 3;
        } else {
            const tokenMatchQuality = getTokenMatchQuality(normalizedRow, normalizedAlias);
            const rowWords = normalizedRow.split(" ").filter(Boolean).filter(token => !/^\d+$/.test(token));
            const aliasWords = normalizedAlias.split(" ").filter(Boolean).filter(token => !/^\d+$/.test(token));

            if (
                tokenMatchQuality !== null &&
                tokenMatchQuality >= 0.75 &&
                rowWords.length > 1 &&
                aliasWords.length > 1 &&
                Math.min(rowWords.length, aliasWords.length) >= 2
            ) {
                matchRank = 4;
            }
        }

        if (matchRank === null) {
            continue;
        }

        const specificity = normalizedAlias.length;
        const candidate = {
            alias: normalizedAlias,
            matchRank,
            specificity
        };

        if (
            !bestMatch ||
            matchRank < bestMatch.matchRank ||
            (matchRank === bestMatch.matchRank && specificity > bestMatch.specificity)
        ) {
            bestMatch = candidate;
        }
    }

    return bestMatch;
}


function aliasMatchesRow(rowLabel, aliases) {
    if (!Array.isArray(aliases) || aliases.length === 0) {
        return false;
    }

    return !!getBestAliasMatch(rowLabel, aliases);
}


function matchesAnyAlias(label, aliases) {
    if (!label) {
        return false;
    }

    return aliasMatchesRow(label, aliases);
}


function hasNumericValue(row) {
    if (!row || !row.length) {
        return false;
    }

    const numericCells = row
        .slice(1)
        .map(cell => String(cell?.text ?? "")
            .trim()
            .replace(/\*\*/g, "")
            .replace(/__/g, "")
            .replace(/\*/g, "")
            .replace(/_/g, "")
            .trim())
        .filter(value => value !== "")
        .filter(value => /^[-+]?(?:\(?\d[\d,]*)(?:\.\d+)?\)?$/.test(value.replace(/\s+/g, "")));

    if (numericCells.length === 0) {
        return false;
    }

    const meaningfulNumericCells = numericCells.filter(value => {
        const cleaned = value.replace(/[()]/g, "").replace(/,/g, "");
        return cleaned.includes(".") || cleaned.length > 4;
    });

    return meaningfulNumericCells.length > 0 || numericCells.length > 1;
}


function safeAggregateLabel(label, aggregateAliases = []) {
    const normalized = canonicalizeMatchText(label);

    if (!normalized) {
        return false;
    }

    if (normalized === "total" || normalized === "subtotal") {
        return true;
    }

    if (normalized.startsWith("total ") || normalized.startsWith("subtotal ")) {
        return true;
    }

    return matchesAnyAlias(normalized, aggregateAliases);
}


function getConfiguredAliases(config) {
    if (Array.isArray(config)) {
        return config.map(normalizeText).filter(Boolean);
    }

    if (!config || typeof config !== "object") {
        return [];
    }

    return (config.aliases ?? []).map(normalizeText).filter(Boolean);
}


function getStructuralAliases(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        return { sectionAliases: [], aggregateAliases: [] };
    }

    const structural = config.structural ?? {};

    return {
        sectionAliases: (structural.sectionAliases ?? []).map(normalizeText).filter(Boolean),
        aggregateAliases: (structural.aggregateAliases ?? []).map(normalizeText).filter(Boolean)
    };
}


function getMetricRole(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
        return "detail";
    }

    const role = String(config.role ?? "detail").trim().toLowerCase();
    return role || "detail";
}


function getAllSectionAliases(metricsConfig) {
    const aliases = [];

    for (const config of Object.values(metricsConfig ?? {})) {
        const structural = getStructuralAliases(config);
        aliases.push(...structural.sectionAliases);
    }

    return [...new Set(aliases.filter(Boolean))];
}


function findExplicitAggregateRow(table, aliases, role = "detail") {
    let bestMatch = null;

    for (let index = 0; index < table.rows.length; index++) {
        const row = table.rows[index];

        if (!row || !row.length) {
            continue;
        }

        const label = getRowLabel(row);

        if (!matchesAnyAlias(label, aliases)) {
            continue;
        }

        if (!hasNumericValue(row)) {
            continue;
        }

        const candidate = { row, rowIndex: index };

        if (role === "statementtotal" || role === "aggregate") {
            bestMatch = candidate;
            continue;
        }

        bestMatch ??= candidate;
    }

    return bestMatch;
}


function findNextMeaningfulLabel(table, startIndex) {
    for (let index = startIndex + 1; index < table.rows.length; index++) {
        const row = table.rows[index];

        if (!row || !row.length) {
            continue;
        }

        const label = getRowLabel(row);
        if (label) {
            return label;
        }
    }

    return "";
}


function normalizeSectionLabel(value) {
    const normalized = canonicalizeMatchText(value);

    /*
     * Remove common statement section numbering.
     *
     * Examples:
     *   "1 Non-Current Assets" -> "non current asset"
     *   "2 Current Assets"     -> "current asset"
     *   "II Assets"           -> "asset"
     *   "III Current Assets"  -> "current asset"
     *
     * Only remove numbering when it occurs at the beginning.
     */
    return normalized
        .replace(
            /^(?:[ivxlcdm]+|\d+|[a-z])\s+/i,
            ""
        )
        .trim();
}


function matchesStructuralSection(label, sectionAliases) {
    if (!label || !Array.isArray(sectionAliases)) {
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
         * Section matching is deliberately stricter than
         * normal metric matching.
         *
         * This prevents:
         *
         *   "non current assets"
         *
         * from matching:
         *
         *   "current assets"
         */
        if (normalizedLabel === normalizedAlias) {
            return true;
        }

        /*
         * Allow a section heading to contain the configured
         * section name, but only when the extra text is
         * structural rather than another financial category.
         *
         * Example:
         *   "current assets (schedule III)"
         *
         * should still match.
         */
        const labelWords =
            normalizedLabel.split(" ").filter(Boolean);

        const aliasWords =
            normalizedAlias.split(" ").filter(Boolean);

        if (
            labelWords.length >= aliasWords.length &&
            labelWords
                .slice(-aliasWords.length)
                .join(" ") === normalizedAlias
        ) {
            /*
             * Reject semantic qualifiers such as:
             *
             *   non current assets
             *
             * when looking for:
             *
             *   current assets
             */
            const prefixWords =
                labelWords.slice(
                    0,
                    labelWords.length -
                    aliasWords.length
                );

            const disqualifyingPrefixes = new Set([
                "non",
                "net",
                "gross"
            ]);

            if (
                prefixWords.length === 0 ||
                !prefixWords.some(word =>
                    disqualifyingPrefixes.has(word)
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
    if (!label || !Array.isArray(sectionAliases)) {
        return false;
    }

    return matchesStructuralSection(
        label,
        sectionAliases
    );
}

function findStructuralMetricRow(table, config, metricsConfig) {
    const configAliases = getConfiguredAliases(config);
    const structural = getStructuralAliases(config);

    const sectionAliases = structural.sectionAliases ?? [];

    const aggregateAliases = [
        ...new Set([
            ...(structural.aggregateAliases ?? []),
            ...configAliases
        ])
    ];

    const allSectionAliases =
        getAllSectionAliases(metricsConfig);

    const role = getMetricRole(config);

    if (sectionAliases.length === 0) {
        return null;
    }

    /*
     * ---------------------------------------------------------
     * STEP 1
     * Find the configured section heading.
     * ---------------------------------------------------------
     */
    let sectionStart = -1;

    for (let index = 0; index < table.rows.length; index++) {
        const row = table.rows[index];

        if (!row || !row.length) {
            continue;
        }

        const label = getRowLabel(row);

        if (matchesAnyStructuralSection(label, sectionAliases)) {
            sectionStart = index;
            break;
        }
    }

    if (sectionStart === -1) {
        return null;
    }

    /*
     * ---------------------------------------------------------
     * STEP 2
     * Find the NEXT DIFFERENT configured section.
     *
     * Important:
     *
     * We must NOT treat the current section heading itself
     * as a boundary.
     *
     * Example:
     *
     *     Current Assets
     *       ...
     *       subtotal
     *     Non-current Assets
     *
     * Only "Non-current Assets" ends the current section.
     * ---------------------------------------------------------
     */
    let sectionEnd = table.rows.length;

    for (
        let index = sectionStart + 1;
        index < table.rows.length;
        index++
    ) {
        const row = table.rows[index];

        if (!row || !row.length) {
            continue;
        }

        const label = getRowLabel(row);

        if (!label) {
            continue;
        }

        /*
         * Ignore the same section heading if it appears again.
         */
        if (matchesAnyAlias(label, sectionAliases)) {
            continue;
        }

        /*
         * A different configured section is the boundary.
         */
        if (
            allSectionAliases.length > 0 &&
            matchesAnyAlias(label, allSectionAliases)
        ) {
            sectionEnd = index;
            break;
        }
    }

    /*
     * ---------------------------------------------------------
     * STEP 3
     * Search ONLY inside this section.
     * ---------------------------------------------------------
     */
    let explicitAggregate = null;
    let blankNumericCandidate = null;

    for (
        let index = sectionStart + 1;
        index < sectionEnd;
        index++
    ) {
        const row = table.rows[index];

        if (!row || !row.length) {
            continue;
        }

        const label = getRowLabel(row);
        const normalizedLabel =
            canonicalizeMatchText(label);

        /*
         * -----------------------------------------------------
         * Explicit labelled aggregate.
         * -----------------------------------------------------
         */
        if (
            label &&
            hasNumericValue(row) &&
            safeAggregateLabel(
                label,
                aggregateAliases
            )
        ) {
            /*
             * Generic "Total" belongs to the section only when
             * there is no later statement-level total.
             *
             * For section totals, do not immediately accept a
             * generic "Total" because it may actually be the
             * overall statement total.
             */
            const normalizedAggregate =
                canonicalizeMatchText(label);

            const isGenericTotal =
                normalizedAggregate === "total" ||
                normalizedAggregate === "subtotal";

            if (!isGenericTotal) {
                explicitAggregate ??= {
                    row,
                    rowIndex: index
                };
            }

            continue;
        }

        /*
         * -----------------------------------------------------
         * Blank numeric subtotal.
         *
         * Example:
         *
         * Other Current Assets     38.62 34.54
         *                           6993.55 4414.68
         * Total                     7517.99 5404.79
         *
         * The blank row is the section subtotal.
         * -----------------------------------------------------
         */
        if (
            normalizedLabel === "" &&
            hasNumericValue(row)
        ) {
            const nextMeaningfulLabel =
                findNextMeaningfulLabel(
                    table,
                    index
                );

            if (
                nextMeaningfulLabel &&
                safeAggregateLabel(
                    nextMeaningfulLabel,
                    aggregateAliases
                )
            ) {
                blankNumericCandidate = {
                    row,
                    rowIndex: index
                };
            }
        }
    }

    /*
     * ---------------------------------------------------------
     * STEP 4
     * Explicit aggregate wins.
     * ---------------------------------------------------------
     */
    if (explicitAggregate) {
        return explicitAggregate;
    }

    /*
     * ---------------------------------------------------------
     * STEP 5
     * Section totals may legitimately be represented by
     * an unlabeled numeric subtotal.
     * ---------------------------------------------------------
     */
    if (
        role === "sectiontotal" ||
        role === "section"
    ) {
        return blankNumericCandidate;
    }

    /*
     * Statement totals must not blindly use a blank subtotal.
     */
    return null;
}


function findAggregateMetricRow(table, config, metricsConfig) {
    const aliases = getConfiguredAliases(config);
    const role = getMetricRole(config);

    /*
     * ---------------------------------------------------------
     * STEP 1
     * Always prefer an explicitly labelled aggregate.
     * ---------------------------------------------------------
     */
    const explicit =
        findExplicitAggregateRow(
            table,
            aliases,
            role
        );

    if (explicit) {
        return explicit.row;
    }

    /*
     * ---------------------------------------------------------
     * STEP 2
     * Structural aggregate resolution.
     * ---------------------------------------------------------
     */
    const structural =
        getStructuralAliases(config);

    const hasStructuralMetadata =
        (structural.sectionAliases?.length ?? 0) > 0 ||
        (structural.aggregateAliases?.length ?? 0) > 0;

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
     * ---------------------------------------------------------
     * STEP 3
     * Resolve section-level aggregates using the normal
     * structural resolver.
     * ---------------------------------------------------------
     */
    const structuralMatch =
        findStructuralMetricRow(
            table,
            config,
            metricsConfig
        );

    if (structuralMatch?.row) {
        return structuralMatch.row;
    }

    /*
     * ---------------------------------------------------------
     * STEP 4
     * Statement total fallback.
     *
     * If the statement total is not explicitly labelled,
     * find the final numeric aggregate belonging to the
     * configured statement section.
     *
     * We intentionally do NOT use a fixed row number.
     * ---------------------------------------------------------
     */
    if (role !== "statementtotal") {
        return null;
    }

    const sectionAliases =
        structural.sectionAliases ?? [];

    let sectionStart = -1;

    for (
        let index = 0;
        index < table.rows.length;
        index++
    ) {
        const row = table.rows[index];

        if (!row || !row.length) {
            continue;
        }

        const label = getRowLabel(row);

        if (
            matchesAnyAlias(
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

    /*
     * Find the last numeric aggregate in the statement.
     */
    let lastAggregate = null;

    for (
        let index = sectionStart + 1;
        index < table.rows.length;
        index++
    ) {
        const row = table.rows[index];

        if (!row || !row.length) {
            continue;
        }

        const label =
            getRowLabel(row);

        if (!hasNumericValue(row)) {
            continue;
        }

        /*
         * Explicit aggregate.
         */
        if (
            safeAggregateLabel(
                label,
                structural.aggregateAliases ?? []
            )
        ) {
            lastAggregate = {
                row,
                rowIndex: index
            };

            continue;
        }

        /*
         * Blank numeric aggregate candidate.
         *
         * Keep it as a candidate; later aggregate rows
         * can supersede it.
         */
        if (
            canonicalizeMatchText(label) === ""
        ) {
            lastAggregate = {
                row,
                rowIndex: index
            };
        }
    }

    return lastAggregate?.row ?? null;
}

function findChildMetricRow(table, parentRowIndex, aliases, boundaryAliases = []) {
    for (let index = parentRowIndex + 1; index < table.rows.length; index++) {
        const row = table.rows[index];
        if (!row || !row.length) {
            continue;
        }

        const label = getRowLabel(row);

        if (boundaryAliases.length > 0 && label && matchesAnyAlias(label, boundaryAliases) && index !== parentRowIndex + 1) {
            break;
        }

        if (!hasNumericValue(row)) {
            continue;
        }

        if (matchesAnyAlias(label, aliases)) {
            return row;
        }
    }

    return null;
}

function isExactMetricLabelMatch(rowLabel, aliases) {
    const normalizedRow = canonicalizeMatchText(rowLabel);

    return aliases.some(alias =>
        normalizedRow === canonicalizeMatchText(alias)
    );
}

function findMetricRows(table, metricsConfig) {
    const matches = {};

    for (const [metricName, config] of Object.entries(metricsConfig ?? {})) {
        const aliases = getConfiguredAliases(config);
        const allowChildRows =
            !Array.isArray(config) &&
            config?.allowChildRows === true;

        if (aliases.length === 0) {
            continue;
        }

        /*
         * Aggregate metrics must be resolved structurally.
         * Do NOT allow generic alias matching to select a
         * similarly named row from another section.
         */
        const role = getMetricRole(config);

        if (
            role === "sectiontotal" ||
            role === "statementtotal" ||
            role === "aggregate"
        ) {
            const aggregateRow =
                findAggregateMetricRow(
                    table,
                    config,
                    metricsConfig
                );

            if (aggregateRow) {
                matches[metricName] = {
                    metricName,
                    rowLabel: aggregateRow[0]?.text ?? "",
                    row: aggregateRow
                };
            }

            continue;
        }

        let numericMatch = null;
        let parentMatch = null;

        for (let index = 0; index < table.rows.length; index++) {
            const row = table.rows[index];
            if (!row || !row.length) {
                continue;
            }

            const rowLabel = getRowLabel(row);
            if (!matchesAnyAlias(rowLabel, aliases)) {
                continue;
            }

            if (hasNumericValue(row)) {
                const role = getMetricRole(config);
                if (role === "statementtotal" || role === "aggregate") {
                    numericMatch = { row, rowIndex: index };
                } else {
                    numericMatch ??= { row, rowIndex: index };
                }
                continue;
            }

            if (allowChildRows && parentMatch === null) {
                parentMatch = { row, rowIndex: index };
            }
        }

        let matchedRow = null;

        if (numericMatch) {
            matchedRow = numericMatch.row;
        } else if (allowChildRows && parentMatch) {
            const boundaryAliases = getAllSectionAliases(metricsConfig);
            const childRow = findChildMetricRow(table, parentMatch.rowIndex, aliases, boundaryAliases);
            matchedRow = childRow ?? parentMatch.row;
        } else if (parentMatch) {
            matchedRow = parentMatch.row;
        }

        if (!matchedRow) {
            matchedRow = findAggregateMetricRow(table, config, metricsConfig);
        }

        if (matchedRow) {
            matches[metricName] = {
                metricName,
                rowLabel: matchedRow[0]?.text ?? "",
                row: matchedRow
            };
        }
    }

    return matches;
}


export {
    findMetricRows
};