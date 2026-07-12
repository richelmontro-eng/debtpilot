create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  pay_frequency text not null default 'weekly',
  weekly_take_home numeric(12,2) not null default 0,
  checking_balance numeric(12,2) not null default 0,
  savings_balance numeric(12,2) not null default 0,
  checking_cushion numeric(12,2) not null default 0,
  weekly_living_reserve numeric(12,2) not null default 0,
  preferred_strategy text not null default 'avalanche',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  balance numeric(12,2) not null default 0,
  apr numeric(7,3) not null default 0,
  minimum_payment numeric(12,2) not null default 0,
  due_day integer check (due_day between 1 and 31),
  credit_limit numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null default 0,
  due_day integer check (due_day between 1 and 31),
  frequency text not null default 'monthly',
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  goal_type text not null default 'custom',
  target_amount numeric(12,2) not null default 0,
  current_amount numeric(12,2) not null default 0,
  priority integer not null default 2 check (priority between 1 and 3),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.debts enable row level security;
alter table public.bills enable row level security;
alter table public.goals enable row level security;

drop policy if exists "Users manage own profile" on public.profiles;
drop policy if exists "Users manage own debts" on public.debts;
drop policy if exists "Users manage own bills" on public.bills;
drop policy if exists "Users manage own goals" on public.goals;

create policy "Users manage own profile" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own debts" on public.debts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own bills" on public.bills for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own goals" on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
