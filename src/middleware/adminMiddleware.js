import { pool } from "../db/db.js";

export async function requireAdmin(req, res, next) {
    try {
        const result = await pool.query(
            `SELECT role FROM users WHERE user_id = $1 AND is_active = TRUE AND is_deleted = FALSE`,
            [req.user.userId]
        );

        if (result.rows[0]?.role !== "admin") {
            return res.status(403).json({ error: "Admin access required" });
        }

        req.admin = result.rows[0];
        return next();
    } catch (error) {
        console.error("Admin authorization failed:", error?.message ?? error);
        return res.status(403).json({ error: "Admin access required" });
    }
}