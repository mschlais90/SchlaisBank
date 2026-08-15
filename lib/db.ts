import { Pool } from "pg";

// Serverless functions get recycled constantly, so cache the pool on globalThis
// to avoid opening a new connection on every hot reload / warm invocation.
const globalForPg = globalThis as unknown as { bankPool?: Pool };

export const pool =
  globalForPg.bankPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForPg.bankPool = pool;

export async function query<T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
