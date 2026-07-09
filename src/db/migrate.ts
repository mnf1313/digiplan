/**
 * Schema migration runner.
 *
 * Reads src/db/schema.sql and applies it to the Neon database.
 * Safe to run multiple times — all tables use IF NOT EXISTS.
 *
 * Usage: npx tsx src/db/migrate.ts
 * (DATABASE_URL must be set in the environment)
 */
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    console.error("Set it in the environment before running migration.");
    process.exit(1);
  }

  const sql = neon(url);
  const schemaPath = resolve(__dirname, "schema.sql");
  const schema = await readFile(schemaPath, "utf8");

  console.log("Running schema migration...");

  // Split on semicolons and filter empty statements
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const stmt of statements) {
    try {
      await sql(stmt + ";");
      console.log(`  ✓ ${stmt.slice(0, 60)}...`);
    } catch (err) {
      console.error(`  ✗ ${stmt.slice(0, 60)}...`);
      console.error(`    ${String(err)}`);
      // Don't exit on every error — some extensions may already exist
    }
  }

  console.log("\nMigration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});