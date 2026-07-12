alter table public.profiles
  add column if not exists investment_balance numeric(12,2) not null default 0,
  add column if not exists other_assets numeric(12,2) not null default 0;

create table if not exists public.financial_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  total_assets numeric(12,2) not null default 0,
  total_debt numeric(12,2) not null default 0,
  net_worth numeric(12,2) not null default 0,
  checking_balance numeric(12,2) not null default 0,
  savings_balance numeric(12,2) not null default 0,
  investment_balance numeric(12,2) not null default 0,
  other_assets numeric(12,2) not null default 0,
  financial_health integer not null default 0 check (financial_health between 0 and 100),
  created_at timestamptz not null default now(),
  unique(user_id, snapshot_date)
);

alter table public.financial_snapshots enable row level security;

drop policy if exists "Users manage own financial snapshots" on public.financial_snapshots;

create policy "Users manage own financial snapshots"
on public.financial_snapshots
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
