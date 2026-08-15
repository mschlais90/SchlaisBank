# Bank of Dad

A small web app that replaces the `BankOfDad.xlsx` spreadsheet: one account per kid, a
running balance, a balance-over-time chart, and 1% interest paid automatically on the
1st of every month.

Next.js (App Router) + Postgres. No login — anyone with the URL can view and edit.

## Setup

### 1. Create the database

Any Postgres works. The free tier of [Neon](https://neon.tech) is the easiest:

1. Create a project, then copy the **pooled** connection string.
2. Save it locally:

   ```bash
   cp .env.example .env.local
   # paste the connection string into DATABASE_URL
   ```

### 2. Create the tables and load the spreadsheet history

The workbook and the seed file it generates are **not in this repo** — this is a public
repo and they hold real account history. Keep `BankOfDad.xlsx` in the project folder,
then:

```bash
npm install
npm run db:generate-seed   # BankOfDad.xlsx -> db/seed.sql
npm run db:setup           # create tables, load the seed
```

`db:generate-seed` validates as it goes: it rebuilds each running balance and refuses
to write the seed if any of them disagree with the sheet's `Total` column.

`db:setup` skips the seed if the tables already have data; use `npm run db:reimport` to
wipe and reload from scratch.

### 3. Run it

```bash
npm run dev     # http://localhost:3000
```

### 4. Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, "Add New → Project" and import `mschlais90/SchlaisBank`.
3. Add the environment variable `DATABASE_URL` (same value as `.env.local`).
   Optionally add `CRON_SECRET` (any random string) to lock down the cron endpoint,
   and `NEXT_PUBLIC_APP_TIMEZONE` if you're not in US Central.
4. Deploy. `vercel.json` registers a monthly cron that posts interest on the 1st.

## How interest works

On the 1st of each month, each kid earns **1% of their balance as of the last day of
the previous month**. The posting happens two ways, and they can't double up:

- **On page load.** Opening the app checks every kid for unpaid months and posts them.
- **Vercel Cron.** `/api/cron/interest` runs at 08:00 UTC on the 1st as a backstop.

If nobody opens the app for a few months, the missed months are filled in one at a
time in order, so the interest compounds correctly. A unique index on
`(kid_id, date) where kind = 'interest'` guarantees a month can never be paid twice.

Catch-up starts from each kid's **last interest row**, so months that were skipped
back in the spreadsheet days stay skipped — the app never rewrites your history.

## Notes on the import

- Historical amounts keep the spreadsheet's precision. Everything the app creates
  from here on is rounded to the cent.
- The import sorts by date. A few sheet rows were entered out of date order, so the
  running balances shown in the app differ slightly from the sheet's `Total` column
  in those stretches. Final balances are unchanged.
- A row with no Event text imports with an empty reason and shows as "No reason
  given"; it can be filled in from the app.
- Interest rows are recognised by the word "interest" in the Event column, which is
  what stops the app from re-posting a month the spreadsheet already paid.

## Layout

```
app/
  page.tsx               all three kids and their balances
  kid/[slug]/page.tsx    one kid: balance, add/subtract form, chart, history
  actions.ts             server actions for add / edit / delete
  api/cron/interest      monthly interest backstop
components/              transaction form, transaction list, balance chart
lib/
  bank.ts                queries, balances, the interest rule
  db.ts                  Postgres pool
  money.ts               rounding and formatting
db/
  schema.sql             tables and indexes
  seed.sql               generated from BankOfDad.xlsx (git-ignored)
scripts/
  parse-xlsx.mjs         dependency-free .xlsx reader
  generate-seed.mjs      regenerates db/seed.sql from the spreadsheet
  db-setup.mjs           creates tables and loads the seed
```

## Adding a fourth kid

```sql
insert into kids (name, slug, sort_order) values ('Name', 'name', 3);
```

They start at $0 and begin earning interest the month after their first transaction.
