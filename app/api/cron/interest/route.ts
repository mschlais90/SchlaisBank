import { NextResponse } from "next/server";
import { postDueInterest } from "@/lib/bank";

export const dynamic = "force-dynamic";

/**
 * Backstop for the monthly interest, wired to Vercel Cron in vercel.json.
 * The app also catches up on page load, so this is belt-and-braces: it just
 * means the 1st-of-the-month posting lands even if nobody opens the app.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const created = await postDueInterest();
  return NextResponse.json({ ok: true, created });
}
