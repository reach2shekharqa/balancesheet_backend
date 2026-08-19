import bcrypt from "bcryptjs";

import { pool, query } from "../src/db/db.js";

const legacyPassword = process.env.LEGACY_PASSWORD;

if (!legacyPassword) {
    throw new Error("Set LEGACY_PASSWORD when running this one-time migration.");
}

const passwordHash = await bcrypt.hash(legacyPassword, 12);
const result = await query(
    `
    UPDATE users
    SET password = $1,
        updated_at = now()
    WHERE password = $2
    `,
    [passwordHash, legacyPassword]
);

console.log(`Migrated ${result.rowCount} legacy password record(s).`);
await pool.end();