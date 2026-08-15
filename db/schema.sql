-- Bank of Dad schema

create table if not exists kids (
  id         serial primary key,
  name       text not null unique,
  slug       text not null unique,
  sort_order int  not null default 0
);

create table if not exists transactions (
  id         serial primary key,
  kid_id     integer not null references kids(id) on delete cascade,
  -- Date the transaction counts for. Balances are ordered by (date, id).
  date       date not null,
  -- 4 decimals so the imported spreadsheet history survives byte-for-byte.
  -- Everything created by the app is rounded to cents.
  amount     numeric(12, 4) not null,
  reason     text not null default '',
  -- 'manual' = entered by a parent, 'interest' = posted by the monthly job.
  kind       text not null default 'manual' check (kind in ('manual', 'interest')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_kid_date_idx on transactions (kid_id, date, id);

-- Interest posts on the 1st of the month, so one interest row per kid per date
-- is exactly the "don't post August twice" guard the catch-up job needs.
create unique index if not exists transactions_one_interest_per_month
  on transactions (kid_id, date) where kind = 'interest';
