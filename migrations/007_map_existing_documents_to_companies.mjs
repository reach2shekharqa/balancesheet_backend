import { extractIdentityFromDocument } from "../src/services/companyIdentityService.js";
import { getClient } from "../src/db/db.js";

function normalizeIdentifier(value) {
    return String(value ?? "").replace(/[\s:;,#|/\-]+/g, "").toUpperCase();
}

function hasCinLabel(markdown) {
    return /\b(?:CIN|corporate\s+(?:identity|identification)|company\s+identification)\b/i.test(String(markdown ?? ""));
}

function classifyDocument(document, companies) {
    if (document.company_id !== null && document.company_id !== undefined) {
        return {
            ...document,
            CIN: null,
            PAN: null,
            company_name: null,
            identity_status: "ALREADY_MAPPED",
            matched_company_id: document.company_id,
            user_mapping_status: null,
            reason: "Document already has a company mapping; it was not changed."
        };
    }

    const identity = extractIdentityFromDocument(document);
    const cin = identity.cin ? normalizeIdentifier(identity.cin) : null;
    const pan = identity.pan ? normalizeIdentifier(identity.pan) : null;
    const matchingCompanies = cin
        ? companies.filter(company => normalizeIdentifier(company.cin) === cin)
        : [];

    let identityStatus = "READY";
    let reason = "CIN matches exactly one company.";
    let matchedCompany = matchingCompanies[0] ?? null;

    if (!cin) {
        identityStatus = hasCinLabel(document.extraction_payload?.markdown) ? "INVALID_CIN" : "MISSING_CIN";
        reason = identityStatus === "INVALID_CIN"
            ? "A CIN label is present, but no valid CIN could be extracted."
            : "No CIN was extracted from the document.";
    } else if (matchingCompanies.length === 0) {
        identityStatus = "NO_MATCHING_COMPANY";
        reason = "The CIN is valid, but no existing company has that CIN; no company was created.";
    } else if (matchingCompanies.length !== 1) {
        identityStatus = "CONFLICTING_IDENTITY";
        matchedCompany = null;
        reason = "The CIN matched more than one company, so it was not mapped.";
    } else if (pan && matchedCompany.pan && normalizeIdentifier(matchedCompany.pan) !== pan) {
        identityStatus = "CONFLICTING_IDENTITY";
        reason = "The document PAN conflicts with the PAN stored for the CIN-matched company.";
        matchedCompany = null;
    }

    return {
        ...document,
        CIN: cin,
        PAN: pan,
        company_name: identity.companyName,
        identity_status: identityStatus,
        matched_company_id: matchedCompany?.id ?? null,
        user_mapping_status: null,
        reason
    };
}

function summarize(rows, changedDocuments = [], usersMapped = 0, companiesCreated = 0, relationshipsCreated = 0) {
    const count = status => rows.filter(row => row.identity_status === status).length;
    return {
        "Total completed documents": rows.length,
        "Already mapped": count("ALREADY_MAPPED"),
        "Ready for mapping": count("READY"),
        "Successfully mapped": changedDocuments.length,
        "Missing CIN": count("MISSING_CIN"),
        "Invalid CIN": count("INVALID_CIN"),
        "Conflicting identity": count("CONFLICTING_IDENTITY"),
        "No matching company": count("NO_MATCHING_COMPANY"),
        "Review required": rows.filter(row => row.user_mapping_status === "REVIEW_REQUIRED").length,
        "Users mapped to companies": usersMapped,
        "Companies created": companiesCreated,
        "Company-user relationships created": relationshipsCreated
    };
}

export async function assess(client) {
    const [documentsResult, companiesResult] = await Promise.all([
        client.query(`
            SELECT id, user_id, original_filename, extraction_payload, company_id
            FROM documents
            WHERE extraction_status = 'completed'
            ORDER BY id
        `),
        client.query(`SELECT id, cin, pan FROM companies ORDER BY id`)
    ]);

    const rows = documentsResult.rows.map(document => classifyDocument(document, companiesResult.rows));
    return { rows, summary: summarize(rows) };
}

export async function applyAssessment(client, assessment) {
    const changedDocuments = [];
    let usersMapped = 0;
    let relationshipsCreated = 0;

    for (const row of assessment.rows) {
        if (row.identity_status !== "READY") continue;

        const existingMembership = await client.query(
            `SELECT 1 FROM company_users WHERE company_id = $1 AND user_id = $2`,
            [row.matched_company_id, row.user_id]
        );

        row.user_mapping_status = existingMembership.rowCount === 0 ? "REVIEW_REQUIRED" : "ALREADY_MAPPED";

        const result = await client.query(
            `UPDATE documents
             SET company_id = $1
             WHERE id = $2 AND company_id IS NULL
             RETURNING id`,
            [row.matched_company_id, row.id]
        );

        if (result.rowCount !== 1) {
            throw new Error(`Unexpected document mapping conflict for document ${row.id}.`);
        }

        changedDocuments.push({
            document_id: row.id,
            old_company_id: null,
            new_company_id: row.matched_company_id,
            CIN: row.CIN,
            reason: row.reason
        });
    }

    return {
        changedDocuments,
        summary: summarize(assessment.rows, changedDocuments, usersMapped, 0, relationshipsCreated)
    };
}

function printReport(title, assessment, result = null) {
    console.log(`\n${title}`);
    console.table(assessment.rows.map(row => ({
        document_id: row.id,
        user_id: row.user_id,
        filename: row.original_filename,
        CIN: row.CIN,
        PAN: row.PAN,
        company_name: row.company_name,
        identity_status: row.identity_status,
        user_mapping_status: row.user_mapping_status,
        matched_company_id: row.matched_company_id,
        reason: row.reason
    })));
    console.table(result?.changedDocuments ?? []);
    console.table(result?.summary ?? assessment.summary);
}

export async function run({ apply = false, client = null } = {}) {
    const dbClient = client ?? await getClient();
    try {
        if (apply) await dbClient.query("BEGIN");
        const assessment = await assess(dbClient);
        printReport("Migration assessment", assessment);
        if (!apply) return assessment;

        const result = await applyAssessment(dbClient, assessment);
        await dbClient.query("COMMIT");
        printReport("Migration result", assessment, result);
        return { ...assessment, ...result };
    } catch (error) {
        if (apply) await dbClient.query("ROLLBACK");
        throw error;
    } finally {
        if (!client) dbClient.release();
    }
}

if (process.argv[1]?.endsWith("007_map_existing_documents_to_companies.mjs")) {
    run({ apply: process.argv.includes("--apply") })
        .catch(error => {
            console.error("Migration rolled back:", error.message);
            process.exitCode = 1;
        });
}