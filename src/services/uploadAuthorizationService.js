import { pool } from "../db/db.js";

function invalidCompanyId() {
    const error = new Error("Invalid companyId.");
    error.status = 400;
    error.code = "INVALID_COMPANY_ID";
    return error;
}

function unauthorizedCompany() {
    const error = new Error("User is not authorized to upload documents for this company.");
    error.status = 403;
    error.code = "COMPANY_UPLOAD_FORBIDDEN";
    return error;
}

export async function authorizeDocumentUpload({ userId, companyId, db = pool }) {
    const suppliedCompanyId = companyId !== undefined && companyId !== null && String(companyId).trim() !== "";
    const membershipResult = await db.query(
        `
        SELECT cu.company_id, cu.access_role, c.cin, c.is_active
        FROM company_users cu
        INNER JOIN companies c ON c.id = cu.company_id
        WHERE cu.user_id = $1
        `,
        [userId]
    );

    const memberships = membershipResult.rows.filter(row => row.access_role === "OWNER" || row.access_role === "CONSUMER");

    if (!suppliedCompanyId) {
        if (memberships.length > 0) throw unauthorizedCompany();
        return { type: "INDEPENDENT", companyId: null, companyCin: null };
    }

    if (!/^\d+$/.test(String(companyId)) || Number(companyId) <= 0) throw invalidCompanyId();

    const membership = memberships.find(row => String(row.company_id) === String(companyId));
    if (!membership || membership.access_role !== "OWNER" || membership.is_active !== true) throw unauthorizedCompany();

    return {
        type: "COMPANY",
        companyId: Number(companyId),
        companyCin: membership.cin
    };
}

export function assertCachedDocumentAuthorized(document, authorization) {
    if (!document) return;

    if (authorization.type === "COMPANY" && String(document.company_id) !== String(authorization.companyId)) {
        throw unauthorizedCompany();
    }

    if (authorization.type === "INDEPENDENT" && document.company_id !== null && document.company_id !== undefined) {
        throw unauthorizedCompany();
    }
}

export function cinMismatch() {
    const error = new Error("The uploaded document belongs to a different company than the selected company.");
    error.status = 409;
    error.code = "COMPANY_CIN_MISMATCH";
    return error;
}