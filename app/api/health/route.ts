import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Reports whether the app can reach its database, and why not if it can't.
 * Deliberately says nothing that isn't already knowable from the deployment:
 * no connection string, no credentials, no host.
 */
export async function GET() {
  const raw = process.env.DATABASE_URL ?? "";

  const config = {
    databaseUrlSet: raw.length > 0,
    // A pasted value that kept its surrounding quotes is the classic mistake:
    // the quote becomes part of the scheme or the hostname.
    hasSurroundingQuotes: /^["']|["']$/.test(raw),
    startsWithPostgresScheme: /^postgres(ql)?:\/\//.test(raw),
    hasSslMode: raw.includes("sslmode="),
  };

  if (!config.databaseUrlSet) {
    return NextResponse.json(
      { ok: false, reason: "DATABASE_URL is not set on this service", config },
      { status: 503 }
    );
  }

  try {
    const rows = await query<{ kids: number; transactions: number }>(
      `select (select count(*) from kids)::int as kids,
              (select count(*) from transactions)::int as transactions`
    );
    return NextResponse.json({ ok: true, config, data: rows[0] });
  } catch (error) {
    const err = error as { code?: string; message?: string };

    // Strip anything that could echo the credential back out.
    let message = err.message ?? "unknown error";
    const password = raw.match(/\/\/[^:]+:([^@]+)@/)?.[1];
    if (password) message = message.split(password).join("***");

    return NextResponse.json(
      { ok: false, reason: "database query failed", code: err.code ?? null, message, config },
      { status: 503 }
    );
  }
}
