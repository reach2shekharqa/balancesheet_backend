function getCellText(cell) {
    return String(cell?.text ?? "").trim();
}

function getClassificationText(value) {
    return value
        .replace(/\*\*/g, "")
        .replace(/__/g, "")
        .replace(/^(?:\d+|[a-z])\.\s*/i, "")
        .replace(/:\s*$/, "")
        .trim();
}

function isNumericCellText(value) {
    const normalized = getClassificationText(value)
        .replace(/[\s,$€£¥₹]/g, "")
        .replace(/^rs\.?/i, "")
        .replace(/[()]/g, "");

    return /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(normalized);
}

function isFormulaCellText(value) {
    const classificationText = getClassificationText(value);

    return /[=+*]/.test(classificationText) ||
        /\/(?!\s*\()/.test(classificationText);
}

function isNarrativeCellText(value) {
    const classificationText = getClassificationText(value);
    return /[.!?;]/.test(classificationText) || classificationText.split(/\s+/).length > 12;
}

function isSemanticLabelCell(cell) {
    const value = getCellText(cell);

    return value !== "" &&
        !isNumericCellText(value) &&
        !isFormulaCellText(value) &&
        !isNarrativeCellText(value);
}

export function getSemanticRowLabels(row) {
    if (!Array.isArray(row)) {
        return [];
    }

    return row
        .filter(isSemanticLabelCell)
        .map(getCellText);
}

export function getSemanticRowLabel(row) {
    return getSemanticRowLabels(row)[0] ?? "";
}

export function getSemanticTableText(table) {
    const headerText = Array.isArray(table?.headers)
        ? table.headers
            .filter(isSemanticLabelCell)
            .map(getCellText)
        : [];

    const rowText = Array.isArray(table?.rows)
        ? table.rows.flatMap(getSemanticRowLabels)
        : [];

    return headerText.concat(rowText).join(" ");
}