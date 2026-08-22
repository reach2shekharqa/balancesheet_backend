import { pool } from "../db/db.js";

export const PLAN_CODES = Object.freeze({ FREE: "FREE", PLAN_99: "PLAN_99", PLAN_250: "PLAN_250" });

export async function getUserUploadQuota(userId) {
    const result = await pool.query(`
        SELECT COALESCE(p.code, 'FREE') AS plan,
               COALESCE(p.name, 'Free') AS plan_name,
               COALESCE(p.upload_quota, u.upload_quota, 1)::int AS upload_quota,
               COALESCE(u.uploads_used, 0)::int AS uploads_used
        FROM users u
        LEFT JOIN user_subscriptions s ON s.user_id = u.user_id AND s.status = 'active'
            AND (s.expires_at IS NULL OR s.expires_at > NOW())
        LEFT JOIN plans p ON p.id = s.plan_id AND p.is_active = TRUE
        WHERE u.user_id = $1 AND u.is_active = TRUE AND u.is_deleted = FALSE
        ORDER BY s.started_at DESC NULLS LAST LIMIT 1`, [userId]);
    return result.rows[0] ?? null;
}

export async function reserveUploadQuota(userId) {
    const result = await pool.query(`
        UPDATE users u
        SET uploads_used = u.uploads_used + 1, updated_at = NOW()
        WHERE u.user_id = $1 AND u.is_active = TRUE AND u.is_deleted = FALSE
          AND u.uploads_used < COALESCE((SELECT p.upload_quota FROM user_subscriptions s
              JOIN plans p ON p.id = s.plan_id AND p.is_active = TRUE
              WHERE s.user_id = u.user_id AND s.status = 'active'
                AND (s.expires_at IS NULL OR s.expires_at > NOW())
              ORDER BY s.started_at DESC LIMIT 1), u.upload_quota, 1)
        RETURNING uploads_used, COALESCE((SELECT p.upload_quota FROM user_subscriptions s
            JOIN plans p ON p.id = s.plan_id AND p.is_active = TRUE
            WHERE s.user_id = u.user_id AND s.status = 'active'
            ORDER BY s.started_at DESC LIMIT 1), u.upload_quota, 1)::int AS upload_quota`, [userId]);
    return result.rows[0] ?? null;
}

export async function releaseUploadQuota(userId) {
    await pool.query(`UPDATE users SET uploads_used = GREATEST(uploads_used - 1, 0), updated_at = NOW() WHERE user_id = $1`, [userId]);
}

export async function activatePaidPlan({ userId, planCode, paymentProvider, paymentReference }) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const plan = await client.query(`SELECT id, code, upload_quota FROM plans WHERE code = $1 AND code <> 'FREE' AND is_active = TRUE`, [planCode]);
        if (!plan.rows[0]) throw new Error("Unknown paid plan.");
        await client.query(`UPDATE user_subscriptions SET status = 'replaced', updated_at = NOW() WHERE user_id = $1 AND status = 'active'`, [userId]);
        await client.query(`INSERT INTO user_subscriptions (user_id, plan_id, status, payment_provider, payment_reference) VALUES ($1, $2, 'active', $3, $4)`, [userId, plan.rows[0].id, paymentProvider, paymentReference]);
        await client.query(`UPDATE users SET upload_quota = $2, updated_at = NOW() WHERE user_id = $1`, [userId, plan.rows[0].upload_quota]);
        await client.query("COMMIT");
        return plan.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}