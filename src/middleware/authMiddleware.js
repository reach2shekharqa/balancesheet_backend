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
    try {
        const token = getToken(req);
        if (!token) {
            return res.status(401).json({ success: false, error: "Authentication required." });
        }

        const claims = verifyAuthToken(token);
        const result = await pool.query(
            `
            SELECT user_id, user_name, email, role, is_active, is_deleted
            FROM users
            WHERE user_id = $1
            `,
            [claims.sub]
        );

        const user = result.rows[0];
        if (!user || user.is_active === false || user.is_deleted === true) {
            return res.status(401).json({ success: false, error: "Authentication required." });
        }

        req.user = toPublicUser(user);
        return next();
    } catch {
        return res.status(401).json({ success: false, error: "Authentication required." });
    }
}