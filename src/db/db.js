import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.DB_LOCAL
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error);
});

export async function query(text, params = []) {
    return pool.query(text, params);
}

export async function getClient() {
    return pool.connect();
}

export default pool;