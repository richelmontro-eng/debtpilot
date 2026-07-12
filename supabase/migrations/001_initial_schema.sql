create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  pay_frequency text not null default 'weekly' check (pay_frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  weekly_take_home numeric(12,2) not null default 0 check (weekly_take_home >= 0),
  checking_balance numeric(12,2) not null default 0,
  savings_balance numeric(12,2) not null default 0,
  checking_cushion numeric(12,2) not null default 0 check (checking_cushion >= 0),
  weekly_living_reserve numeric(12,2) not null default 0 check (weekly_living_reserve >= 0),
  preferred_strategy text not null default 'avalanche' check (preferred_strategy in ('avalanche', 'snowball')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  apr numeric(7,3) not null default 0 check (apr >= 0),
  minimum_payment numeric(12,2) not null default 0 check (minimum_payment >= 0),
  due_day integer check (due_day between 1 and 31),
  credit_limit numeric(12,2) check (credit_limit is null or credit_limit >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  due_day integer check (due_day between 1 and 31),
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'quarterly', 'annual')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.debts enable row level security;
alter table public.bills enable row level security;

create policy "Users manage own profile" on public.profiles for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own debts" on public.debts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own bills" on public.bills for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists debts_user_id_idx on public.debts(user_id);
create index if not exists bills_user_id_idx on public.bills(user_id);
