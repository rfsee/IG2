import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL_REQUIRED");
}

const sqlDir = resolve(process.cwd(), "sql");
const files = (await readdir(sqlDir)).filter((name) => name.endsWith(".sql")).sort();

if (files.length === 0) {
  console.log("No SQL migration files found.");
  process.exit(0);
}

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  for (const fileName of files) {
    const sqlText = await readFile(join(sqlDir, fileName), "utf8");
    if (!sqlText.trim()) {
      continue;
    }
    await client.query(sqlText);
    console.log(`Applied ${fileName}`);
  }
  await client.query("COMMIT");
  console.log("Migration completed.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
