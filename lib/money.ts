/** Rounds to cents, avoiding the float noise in `Math.round(x * 100) / 100`. */
export function toCents(value: number): number {
  return Math.round((value + Number.EPSILON * Math.sign(value) * 100) * 100) / 100;
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "+$4.50" / "-$4.50", for transaction rows. */
export function formatSigned(value: number): string {
  const sign = value < 0 ? "-" : "+";
  return sign + formatMoney(Math.abs(value));
}

/** "2026-08-15" -> "Aug 15, 2026", without dragging the value through a timezone. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Set NEXT_PUBLIC_APP_TIMEZONE if you're not in US Central.
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "America/Chicago";

/** Today's date as "YYYY-MM-DD" in the family's timezone, not UTC. */
export function todayISO(timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
