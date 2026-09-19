const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || process.env.DB_LOCAL;
if (!connectionString) {
  console.error('DATABASE_URL/DB_LOCAL not set');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();

  const tablesRes = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
  );

  const tables = tablesRes.rows.map((r) => r.table_name);
  const counts = {};
  let totalRows = 0;

  for (const table of tables) {
    const res = await client.query(`SELECT COUNT(*) AS c FROM public."${table}";`);
    const count = Number(res.rows[0].c);
    counts[table] = count;
    totalRows += count;
  }

  console.log('TABLE_COUNT=' + tables.length);
  console.log('TOTAL_ROWS=' + totalRows);
  for (const table of tables) {
    console.log(`${table}=${counts[table]}`);
  }

  const docPayloadCheck = await client.query(
    "SELECT COUNT(*) AS c FROM public.documents WHERE extraction_payload IS NOT NULL OR file_hash IS NOT NULL;"
  );
  console.log('DOCUMENT_ROWS_WITH_DATA=' + Number(docPayloadCheck.rows[0].c));

  await client.end();
})().catch((err) => {
  console.error('DB check failed:', err.message);
  process.exit(1);
});
