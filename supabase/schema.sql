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
  investment_balance numeric(12,2) not null default 0,
  other_assets numeric(12,2) not null default 0,
  onboarding_step integer not null default 0 check (onboarding_step between 0 and 5),
  onboarding_completed boolean not null default false,
  onboarding_data jsonb not null default '{}'::jsonb,
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
  promotion_type text not null default 'none' check (promotion_type in ('none', 'zero_percent', 'deferred_interest')),
  promotional_apr numeric(7,3) check (promotional_apr is null or promotional_apr >= 0),
  promotion_end_date date,
  post_promotion_apr numeric(7,3) check (post_promotion_apr is null or post_promotion_apr >= 0),
  original_promotional_balance numeric(12,2) check (original_promotional_balance is null or original_promotional_balance >= 0),
  estimated_deferred_interest numeric(12,2) check (estimated_deferred_interest is null or estimated_deferred_interest >= 0),
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

create table if not exists public.vehicle_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  down_payment numeric(12,2) not null default 0,
  trade_in numeric(12,2) not null default 0,
  tax_rate numeric(7,3) not null default 0,
  fees numeric(12,2) not null default 0,
  apr numeric(7,3) not null default 0,
  term_months integer not null default 72,
  insurance_monthly numeric(12,2) not null default 0,
  fuel_monthly numeric(12,2) not null default 0,
  maintenance_monthly numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.bill_occurrences (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade, due_date date not null,
  expected_amount numeric(12,2) not null, status text not null default 'upcoming' check (status in ('upcoming','paid','overdue','skipped','partial')),
  paid_at timestamptz, paid_amount numeric(12,2), transaction_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,bill_id,due_date)
);

create table if not exists public.pilot_recommendation_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id text not null,
  category text not null,
  title text not null,
  confidence integer not null check (confidence between 0 and 100),
  estimated_benefit text not null,
  reasoning jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.debts enable row level security;
alter table public.bills enable row level security;
alter table public.goals enable row level security;
alter table public.vehicle_scenarios enable row level security;
alter table public.financial_snapshots enable row level security;
alter table public.pilot_recommendation_history enable row level security;
alter table public.bill_occurrences enable row level security;

drop policy if exists "Users manage own profile" on public.profiles;
drop policy if exists "Users manage own debts" on public.debts;
drop policy if exists "Users manage own bills" on public.bills;
drop policy if exists "Users manage own goals" on public.goals;
drop policy if exists "Users manage own vehicle scenarios" on public.vehicle_scenarios;
drop policy if exists "Users manage own financial snapshots" on public.financial_snapshots;
drop policy if exists "Users select own pilot recommendation history" on public.pilot_recommendation_history;
drop policy if exists "Users insert own pilot recommendation history" on public.pilot_recommendation_history;
drop policy if exists "Users delete own pilot recommendation history" on public.pilot_recommendation_history;
drop policy if exists "Users select own bill occurrences" on public.bill_occurrences;
drop policy if exists "Users insert own bill occurrences" on public.bill_occurrences;
drop policy if exists "Users update own bill occurrences" on public.bill_occurrences;
drop policy if exists "Users delete own bill occurrences" on public.bill_occurrences;

create policy "Users manage own profile" on public.profiles for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own debts" on public.debts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own bills" on public.bills for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own goals" on public.goals for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own vehicle scenarios" on public.vehicle_scenarios for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage own financial snapshots" on public.financial_snapshots for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users select own pilot recommendation history" on public.pilot_recommendation_history for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own pilot recommendation history" on public.pilot_recommendation_history for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users delete own pilot recommendation history" on public.pilot_recommendation_history for delete to authenticated using ((select auth.uid()) = user_id);
create policy "Users select own bill occurrences" on public.bill_occurrences for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own bill occurrences" on public.bill_occurrences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own bill occurrences" on public.bill_occurrences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own bill occurrences" on public.bill_occurrences for delete to authenticated using ((select auth.uid()) = user_id);

create index if not exists debts_user_id_idx on public.debts(user_id);
create index if not exists bills_user_id_idx on public.bills(user_id);
create index if not exists goals_user_id_idx on public.goals(user_id);
create index if not exists vehicle_scenarios_user_id_idx on public.vehicle_scenarios(user_id);
create index if not exists financial_snapshots_user_id_snapshot_date_idx on public.financial_snapshots(user_id, snapshot_date);
create index if not exists pilot_recommendation_history_user_completed_idx on public.pilot_recommendation_history(user_id, completed_at desc);
create unique index if not exists pilot_recommendation_history_user_recommendation_uidx on public.pilot_recommendation_history(user_id, recommendation_id);
create index if not exists bill_occurrences_user_due_idx on public.bill_occurrences(user_id,due_date);
