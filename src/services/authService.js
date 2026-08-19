import crypto from "crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

import { pool } from "../db/db.js";

const AUTH_COOKIE_NAME = "financial_analyzer_auth";
const PASSWORD_ROUNDS = 12;
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

export function toPublicUser(user) {
    return {
        userId: user.user_id,
        userName: user.user_name,
        email: user.email,
        role: user.role,
    };
}

export function validateRegistrationInput({ userName, email, password }) {
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

    return null;
}

export async function registerUser({ userName, email, password }) {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await bcrypt.hash(password, PASSWORD_ROUNDS);
    const userId = `usr_${crypto.randomUUID()}`;

    const result = await pool.query(
        `
        INSERT INTO users (user_id, user_name, email, password, role)
        VALUES ($1, $2, $3, $4, 'user')
        RETURNING user_id, user_name, email, role
        `,
        [userId, String(userName).trim(), normalizedEmail, passwordHash]
    );

    return result.rows[0];
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