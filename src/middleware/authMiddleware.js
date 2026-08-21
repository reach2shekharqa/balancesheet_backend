import { pool } from "../db/db.js";
import {
    AUTH_COOKIE_NAME,
    toPublicUser,
    verifyAuthToken,
} from "../services/authService.js";

function getCookieValue(cookieHeader, cookieName) {
    const cookie = cookieHeader
        ?.split(";")
        .map(value => value.trim())
        .find(value => value.startsWith(`${cookieName}=`));

    return cookie ? decodeURIComponent(cookie.slice(cookieName.length + 1)) : null;
}

function getToken(req) {
    const authorization = req.get("authorization");
    if (authorization?.startsWith("Bearer ")) {
        return authorization.slice(7).trim();
    }

    return getCookieValue(req.get("cookie"), AUTH_COOKIE_NAME);
}

export async function requireAuth(req, res, next) {
    const authStartedAt = Date.now();

    console.log("[AUTH DEBUG] requireAuth entered", {
        method: req.method,
        path: req.originalUrl,
        hasAuthorization: !!req.get("authorization"),
        hasCookie: !!req.get("cookie")
    });

    try {
        const token = getToken(req);

        console.log("[AUTH DEBUG] token extracted", {
            hasToken: !!token,
            elapsedMs: Date.now() - authStartedAt
        });

        if (!token) {
            console.warn("[AUTH DEBUG] no authentication token");

            return res.status(401).json({
                success: false,
                error: "Authentication required."
            });
        }

        const claims = verifyAuthToken(token);

        console.log("[AUTH DEBUG] token verified", {
            subject: claims.sub,
            elapsedMs: Date.now() - authStartedAt
        });

        console.log("[AUTH DEBUG] querying users table");

        const result = await pool.query(
            `
            SELECT user_id, user_name, email, role, is_active, is_deleted
            FROM users
            WHERE user_id = $1
            `,
            [claims.sub]
        );

        console.log("[AUTH DEBUG] users query completed", {
            rows: result.rows.length,
            elapsedMs: Date.now() - authStartedAt
        });

        const user = result.rows[0];

        if (!user || user.is_active === false || user.is_deleted === true) {
            console.warn("[AUTH DEBUG] user invalid/inactive");

            return res.status(401).json({
                success: false,
                error: "Authentication required."
            });
        }

        req.user = toPublicUser(user);

        console.log("[AUTH DEBUG] authentication successful", {
            userId: req.user.userId,
            elapsedMs: Date.now() - authStartedAt
        });

        return next();

    } catch (error) {

        console.error("[AUTH DEBUG] authentication failed", {
            message: error?.message,
            stack: error?.stack,
            elapsedMs: Date.now() - authStartedAt
        });

        return res.status(401).json({
            success: false,
            error: "Authentication required."
        });
    }
}