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

### 4. Deploy to Render

The app is hosted on Render and deploys automatically on every push to `main`.

**Create the service as a Node web service** — not Docker. Render builds a Docker
service from a `Dockerfile`, and this repo doesn't have one, so a Docker service
fails in about a second with `failed to read dockerfile`. Render can't switch an
existing service between Docker and a native language; that needs a new service.

| Setting | Value |
|---|---|
| Language | **Node** |
| Branch | `main` |
| Root directory | *(blank — the app is at the repo root)* |
| Build command | `npm ci && npm run build` |
| Start command | `npm start` |
| Health check path | `/` |
| Auto-Deploy | **Off** — GitHub Actions triggers deploys instead |

**Environment variables** on the service: `DATABASE_URL` (required — the app queries
Postgres on every page load, so without it the site builds fine and then errors at
request time), `NODE_VERSION` = `22`, plus optional `CRON_SECRET` (any random string,
locks down the interest endpoint) and `NEXT_PUBLIC_APP_TIMEZONE` if you're not in
US Central.

**GitHub setup** — under Settings → Secrets and variables → Actions:

| Name | Kind | Value |
|---|---|---|
| `RENDER_API_KEY` | Secret | An API key from Render → Account Settings → API Keys |
| `CRON_SECRET` | Secret | Same value as the service's `CRON_SECRET` |
| `RENDER_SERVICE_ID` | Variable | The service's ID, `srv-…`, from its dashboard URL |
| `APP_URL` | Variable | e.g. `https://schlaisbank.onrender.com` |

The service ID is a variable rather than hardcoded, so recreating the Render service
means updating that one value instead of editing the workflow.

Turning Render's own Auto-Deploy **off** matters: leave it on and every push
deploys twice, once from Render's GitHub hook and once from the workflow.

### How deploys run

`.github/workflows/deploy.yml` fires on every push to `main`. It asks Render to
deploy that exact commit, then polls until the deploy is `live` — so a red X on the
commit means the deploy failed, not just the build. You can also run it by hand from
the Actions tab, and the same workflow is the rollback path: re-run it on an older
commit.

## How interest works

On the 1st of each month, each kid earns **1% of their balance as of the last day of
the previous month**. The posting happens two ways, and they can't double up:

- **On page load.** Opening the app checks every kid for unpaid months and posts them.
- **A scheduled GitHub Action.** `.github/workflows/monthly-interest.yml` calls
  `/api/cron/interest` at 08:00 UTC on the 1st as a backstop. (Render's free plan has
  no cron jobs, and its free services sleep when idle, so the schedule lives in
  GitHub Actions and the call retries through the cold start.)

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
.github/workflows/
  deploy.yml             push to main -> Render deploy, waits for it to go live
  monthly-interest.yml   monthly backstop that calls the interest endpoint
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
