function normalizeIdentifier(value) {
    return String(value ?? "").replace(/[\s:;,#|/\-]+/g, "").toUpperCase();
}

function normalizeCompanyName(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function firstMatch(text, patterns) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) return match[1].trim();
    }
    return null;
}

const CIN_VALUE_PATTERN = "([A-Z][0-9]{5}[\\s-]*[A-Z]{2}[\\s-]*[0-9]{4}[\\s-]*[A-Z]{3}[\\s-]*[0-9]{6})";
const LABEL_SEPARATOR_PATTERN = "[\\s:#|\\-]*";

export function extractIdentityFromText(text) {
    const source = String(text ?? "");
    const cin = firstMatch(source, [
        new RegExp(`\\bCIN${LABEL_SEPARATOR_PATTERN}${CIN_VALUE_PATTERN}\\b`, "i"),
    ]);
    const pan = firstMatch(source, [
        new RegExp(`\\bPAN${LABEL_SEPARATOR_PATTERN}([A-Z]{5}[0-9]{4}[A-Z])\\b`, "i")
    ]);
    const companyName = firstMatch(source, [
        /(?:company|legal)\s+name\s*[:|-]\s*([^\n|]+)/i,
        /(?:^|\n)\s*name\s*of\s*the\s*company\s*[:|-]\s*([^\n|]+)/i
    ]);

    return {
        cin: cin ? normalizeIdentifier(cin) : null,
        pan: pan ? normalizeIdentifier(pan) : null,
        companyName: companyName ? normalizeCompanyName(companyName) : null
    };
}

export function extractIdentityFromDocument(document) {
    return extractIdentityFromText(document?.extraction_payload?.markdown);
}

export function compareCompanyIdentities(identities) {
    if (!Array.isArray(identities) || identities.length === 0) {
        return { status: "incomplete", reason: "No reports selected." };
    }

    const normalizedIdentities = identities.map(identity => ({
        ...identity,
        cin: identity?.cin ? normalizeIdentifier(identity.cin) : null,
        pan: identity?.pan ? normalizeIdentifier(identity.pan) : null,
    }));
    const missingIdentity = normalizedIdentities.findIndex(identity => !identity?.cin);
    if (missingIdentity !== -1) {
        return {
            status: "incomplete",
            reason: `Unable to verify the company identity for ${normalizedIdentities[missingIdentity].filename ?? "this report"}.`
        };
    }

    for (const field of ["cin", "pan"]) {
        const values = normalizedIdentities.map(identity => identity?.[field]).filter(Boolean);
        if (values.length > 1 && values.some(value => value !== values[0])) {
            const reference = normalizedIdentities.find(identity => identity?.[field]);
            const conflict = normalizedIdentities.find(identity => identity?.[field] && identity[field] !== reference[field]);
            return { status: "conflict", field: field.toUpperCase(), reference, conflict };
        }
    }

    const reference = normalizedIdentities[0];
    return {
        status: "verified",
        cin: reference.cin ?? null,
        pan: reference.pan ?? null,
        identities
    };
}