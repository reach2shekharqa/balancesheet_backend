import crypto from "crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

import { pool } from "../db/db.js";

const AUTH_COOKIE_NAME = "financial_analyzer_auth";
const PASSWORD_ROUNDS = 12;
const REGISTRATION_INTENTS = new Set(["owner", "consumer"]);
const googleClient = new OAuth2Client();

function getJwtSecret() {
    const secret = process.env.AUTH_JWT_SECRET;

    if (!secret || secret.length < 32) {
        throw new Error("AUTH_JWT_SECRET must be at least 32 characters.");
    }

    return secret;
}

export function normalizeEmail(email) {
    return String(email ?? "").trim().toLowerCase();
}

export async function toPublicUser(user, db = pool) {
    const memberships = await db.query(
        `
        SELECT c.id AS "companyId", c.company_name AS "companyName", c.cin, c.pan,
               cu.access_role AS "accessRole"
        FROM company_users cu
        INNER JOIN companies c ON c.id = cu.company_id
        INNER JOIN users u ON u.user_id = cu.user_id
        WHERE cu.user_id = $1
          AND u.is_active = TRUE
          AND u.is_deleted = FALSE
          AND c.is_active = TRUE
        ORDER BY c.company_name
        `,
        [user.user_id]
    );

    const companies = memberships.rows;
    return {
        userId: user.user_id,
        userName: user.user_name,
        email: user.email,
        role: user.role,
        companies,
        company: companies.length === 1 ? companies[0] : null,
    };
}

export function validateRegistrationInput({ userName, email, password, companyName, cin, pan, registrationIntent = "owner" }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = String(userName ?? "").trim();

    if (normalizedName.length < 2 || normalizedName.length > 100) {
        return "User name must be between 2 and 100 characters.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return "A valid email is required.";
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 128) {
        return "Password must be between 8 and 128 characters.";
    }

    if (!REGISTRATION_INTENTS.has(registrationIntent)) {
        return "A valid registration intent is required.";
    }

    if (registrationIntent === "consumer") {
        return null;
    }

    const normalizedCompanyName = String(companyName ?? "").trim();
    const normalizedCin = String(cin ?? "").trim().toUpperCase();
    const normalizedPan = String(pan ?? "").trim().toUpperCase();

    if (normalizedCompanyName.length < 2 || normalizedCompanyName.length > 200) {
        return "Company name must be between 2 and 200 characters.";
    }

    if (!/^[A-Z0-9-]{3,30}$/.test(normalizedCin)) {
        return "A valid CIN is required.";
    }

    if (normalizedPan && !/^[A-Z0-9-]{3,20}$/.test(normalizedPan)) {
        return "PAN must contain only letters and numbers.";
    }

    return null;
}

function normalizeCompanyValue(value) {
    return String(value ?? "").trim().toUpperCase();
}

export async function registerUser({ userName, email, password, companyName, cin, pan, registrationIntent = "owner" }, db = pool) {
    if (!REGISTRATION_INTENTS.has(registrationIntent)) {
        throw new Error("A valid registration intent is required.");
    }

    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
    const userId = `usr_${crypto.randomUUID()}`;
    const normalizedCin = normalizeCompanyValue(cin);
    const normalizedPan = normalizeCompanyValue(pan);
    const normalizedCompanyName = String(companyName ?? "").trim();
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        let company = null;
        if (registrationIntent === "owner") {
            const companyResult = await client.query(
                `
                INSERT INTO companies (cin, pan, company_name, normalized_company_name)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (cin) DO NOTHING
                RETURNING id, cin, pan, company_name
                `,
                [normalizedCin, normalizedPan || null, normalizedCompanyName, normalizedCompanyName.toUpperCase()]
            );

            company = companyResult.rows[0] ?? (await client.query(
                `SELECT id, cin, pan, company_name FROM companies WHERE cin = $1 FOR UPDATE`,
                [normalizedCin]
            )).rows[0];

            if (!company) {
                throw new Error("Company could not be created.");
            }

            const nameConflicts = company.company_name && company.company_name.trim().toUpperCase() !== normalizedCompanyName.toUpperCase();
            const panConflicts = company.pan && normalizedPan && company.pan.trim().toUpperCase() !== normalizedPan;
            if (nameConflicts || panConflicts) {
                const error = new Error("This CIN is already registered with different company information. Please verify the company name and PAN.");
                error.code = "COMPANY_DETAILS_CONFLICT";
                throw error;
            }
        }

        const userResult = await client.query(
            `
            INSERT INTO users (user_id, user_name, email, password, role)
            VALUES ($1, $2, $3, $4, 'user')
            RETURNING user_id, user_name, email, role
            `,
            [userId, String(userName).trim(), normalizedEmail, passwordHash]
        );

        if (company) {
            await client.query(
                `INSERT INTO company_users (company_id, user_id, access_role) VALUES ($1, $2, 'OWNER')`,
                [company.id, userId]
            );
        }

        await client.query("COMMIT");
        return userResult.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function authenticateUser({ identifier, email, password }) {
    const loginIdentifier = identifier ?? email;
    const result = await pool.query(
        `
        SELECT user_id, user_name, email, password, role, is_active, is_deleted
        FROM users
        WHERE lower(email) = lower($1) OR lower(user_name) = lower($1)
        LIMIT 1
        `,
        [String(loginIdentifier ?? "").trim()]
    );

    const user = result.rows[0];
    if (!user || user.is_active === false || user.is_deleted === true) {
        return null;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    return passwordMatches ? user : null;
}

export async function authenticateGoogleUser(credential) {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
        throw new Error("Google login is not configured.");
    }

    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
        payload = ticket.getPayload();
    } catch {
        const error = new Error("Invalid Google sign-in token.");
        error.code = "GOOGLE_TOKEN_INVALID";
        throw error;
    }

    if (!payload?.email || payload.email_verified !== true) {
        const error = new Error("Google account email could not be verified.");
        error.code = "GOOGLE_TOKEN_INVALID";
        throw error;
    }

    const email = normalizeEmail(payload.email);
    const existingUser = await pool.query(
        `
        SELECT user_id, user_name, email, password, role, is_active, is_deleted
        FROM users
        WHERE lower(email) = $1
        LIMIT 1
        `,
        [email]
    );

    if (existingUser.rows[0]) {
        const user = existingUser.rows[0];
        return user.is_active === false || user.is_deleted === true ? null : user;
    }

    const generatedPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), PASSWORD_ROUNDS);
    const fallbackName = email.split("@")[0];
    const userName = String(payload.name || fallbackName).trim().slice(0, 100) || "Google user";
    try {
        const result = await pool.query(
            `
            INSERT INTO users (user_id, user_name, email, password, role)
            VALUES ($1, $2, $3, $4, 'user')
            RETURNING user_id, user_name, email, password, role, is_active, is_deleted
            `,
            [`usr_${crypto.randomUUID()}`, userName, email, generatedPassword]
        );

        return result.rows[0];
    } catch (error) {
        if (error?.code !== "23505") {
            throw error;
        }

        const duplicateUser = await pool.query(
            `
            SELECT user_id, user_name, email, password, role, is_active, is_deleted
            FROM users
            WHERE lower(trim(email)) = $1
            LIMIT 1
            `,
            [email]
        );

        const user = duplicateUser.rows[0];
        return user && user.is_active !== false && user.is_deleted !== true ? user : null;
    }
}

export function createAuthToken(user) {
    return jwt.sign(
        { sub: user.user_id, role: user.role },
        getJwtSecret(),
        { expiresIn: process.env.AUTH_JWT_EXPIRES_IN || "1d" }
    );
}

export function verifyAuthToken(token) {
    return jwt.verify(token, getJwtSecret());
}

export function getAuthCookieOptions() {
    const isProduction = process.env.NODE_ENV === "production";

    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : (process.env.AUTH_COOKIE_SAME_SITE || "lax"),
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
    };
}

export { AUTH_COOKIE_NAME };