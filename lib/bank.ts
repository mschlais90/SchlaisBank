import { query } from "./db";
import { toCents, todayISO } from "./money";

export type Kid = {
  id: number;
  name: string;
  slug: string;
  balance: number;
};

export type Transaction = {
  id: number;
  kidId: number;
  date: string;
  amount: number;
  reason: string;
  kind: "manual" | "interest";
  /** Running balance through this transaction, ordered by (date, id). */
  balance: number;
};

export const MONTHLY_INTEREST_RATE = 0.01;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function getKids(): Promise<Kid[]> {
  return query<Kid>(
    `select k.id, k.name, k.slug,
            coalesce(sum(t.amount), 0)::float8 as balance
       from kids k
       left join transactions t on t.kid_id = k.id
      group by k.id, k.name, k.slug, k.sort_order
      order by k.sort_order, k.id`
  );
}

export async function getKidBySlug(slug: string): Promise<Kid | null> {
  const rows = await query<Kid>(
    `select k.id, k.name, k.slug,
            coalesce(sum(t.amount), 0)::float8 as balance
       from kids k
       left join transactions t on t.kid_id = k.id
      where k.slug = $1
      group by k.id, k.name, k.slug`,
    [slug]
  );
  return rows[0] ?? null;
}

/** All of a kid's transactions, newest first, each carrying its running balance. */
export async function getTransactions(kidId: number): Promise<Transaction[]> {
  return query<Transaction>(
    `select id,
            kid_id as "kidId",
            to_char(date, 'YYYY-MM-DD') as date,
            amount::float8 as amount,
            reason,
            kind,
            sum(amount) over (order by date, id rows between unbounded preceding and current row)::float8 as balance
       from transactions
      where kid_id = $1
      order by date desc, id desc`,
    [kidId]
  );
}

export async function addTransaction(input: {
  kidId: number;
  date: string;
  amount: number;
  reason: string;
}): Promise<void> {
  await query(
    `insert into transactions (kid_id, date, amount, reason, kind)
     values ($1, $2, $3, $4, 'manual')`,
    [input.kidId, input.date, toCents(input.amount), input.reason.trim()]
  );
}

export async function updateTransaction(input: {
  id: number;
  date: string;
  amount: number;
  reason: string;
}): Promise<void> {
  await query(
    `update transactions
        set date = $2, amount = $3, reason = $4, updated_at = now()
      where id = $1`,
    [input.id, input.date, toCents(input.amount), input.reason.trim()]
  );
}

export async function deleteTransaction(id: number): Promise<void> {
  await query(`delete from transactions where id = $1`, [id]);
}

/**
 * Posts the 1%-per-month interest for any months that haven't been paid yet.
 *
 * For each kid we walk forward from the month after their last interest row
 * (or their first transaction, if interest has never been posted) up to the
 * current month, adding 1% of the balance as of the last day of the previous
 * month. Walking month by month is what makes it compound correctly when
 * several months are caught up at once.
 *
 * Safe to call on every page load: the unique index on (kid_id, date) for
 * interest rows means a double-run can't post the same month twice.
 *
 * Returns the number of interest transactions created.
 */
export async function postDueInterest(): Promise<number> {
  const today = todayISO();
  const [year, month] = today.split("-").map(Number);
  const currentMonthStart = { year, month };

  const kids = await query<{ id: number; firstDate: string | null; lastInterest: string | null }>(
    `select k.id,
            to_char(min(t.date), 'YYYY-MM-DD') as "firstDate",
            to_char(max(t.date) filter (where t.kind = 'interest'), 'YYYY-MM-DD') as "lastInterest"
       from kids k
       left join transactions t on t.kid_id = k.id
      group by k.id`
  );

  let created = 0;

  for (const kid of kids) {
    if (!kid.firstDate) continue; // no history yet, nothing to earn interest on

    // Start at the month after the last interest posting. If interest has never
    // been posted, start the month after their first transaction — we never
    // back-fill months that were skipped before the app existed.
    const anchor = kid.lastInterest ?? kid.firstDate;
    const [anchorYear, anchorMonth] = anchor.split("-").map(Number);

    let y = anchorYear;
    let m = anchorMonth + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }

    while (y < currentMonthStart.year || (y === currentMonthStart.year && m <= currentMonthStart.month)) {
      const postDate = `${y}-${String(m).padStart(2, "0")}-01`;

      // Balance as of the last day of the previous month.
      const [{ balance }] = await query<{ balance: number }>(
        `select coalesce(sum(amount), 0)::float8 as balance
           from transactions
          where kid_id = $1 and date < $2`,
        [kid.id, postDate]
      );

      const interest = toCents(balance * MONTHLY_INTEREST_RATE);
      if (interest > 0) {
        const result = await query(
          `insert into transactions (kid_id, date, amount, reason, kind)
           values ($1, $2, $3, $4, 'interest')
           on conflict do nothing
           returning id`,
          [kid.id, postDate, interest, `${MONTH_NAMES[m - 1]} Interest`]
        );
        created += result.length;
      }

      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  return created;
}
