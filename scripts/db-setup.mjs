// Creates the tables and loads the spreadsheet history.
//   npm run db:setup      -> create tables, seed only if empty
//   npm run db:reimport   -> drop everything and reload from db/seed.sql
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load DATABASE_URL from .env / .env.local without pulling in a dotenv dependency.
for (const file of [".env", ".env.local"]) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  if (reset) {
    console.log("Dropping existing tables...");
    await client.query("drop table if exists transactions, kids cascade");
  }

  await client.query(readFileSync(join(root, "db", "schema.sql"), "utf8"));
  console.log("Schema ready.");

  const { rows } = await client.query("select count(*)::int as n from transactions");
  if (rows[0].n > 0 && !reset) {
    console.log(`Skipping seed: ${rows[0].n} transactions already present (use --reset to reload).`);
  } else {
    await client.query(readFileSync(join(root, "db", "seed.sql"), "utf8"));
    const summary = await client.query(
      `select k.name, count(t.id)::int as n, round(sum(t.amount), 2) as balance
         from kids k left join transactions t on t.kid_id = k.id
        group by k.id, k.name, k.sort_order order by k.sort_order`
    );
    for (const r of summary.rows) {
      console.log(`  ${r.name.padEnd(8)} ${String(r.n).padStart(3)} transactions, balance $${r.balance}`);
    }
  }
} finally {
  await client.end();
}
