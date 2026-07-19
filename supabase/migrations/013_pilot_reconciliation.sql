alter table public.profiles
  add column if not exists next_paycheck_date date;

create table if not exists public.paycheck_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expected_date date not null,
  expected_amount numeric(12,2) not null check (expected_amount >= 0),
  status text not null default 'expected'
    check (status in ('expected','received','received_different_amount','delayed','missed')),
  actual_amount numeric(12,2) check (actual_amount is null or actual_amount >= 0),
  confirmed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, expected_date)
);

create table if not exists public.checking_balance_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calculated_balance numeric(12,2) not null,
  confirmed_balance numeric(12,2) not null,
  variance numeric(12,2) generated always as (confirmed_balance - calculated_balance) stored,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists paycheck_events_user_date_idx
  on public.paycheck_events(user_id, expected_date);

create index if not exists checking_reconciliations_user_confirmed_idx
  on public.checking_balance_reconciliations(user_id, confirmed_at desc);

alter table public.paycheck_events enable row level security;
alter table public.checking_balance_reconciliations enable row level security;

drop policy if exists "Users select own paycheck events" on public.paycheck_events;
drop policy if exists "Users insert own paycheck events" on public.paycheck_events;
drop policy if exists "Users update own paycheck events" on public.paycheck_events;
drop policy if exists "Users delete own paycheck events" on public.paycheck_events;
drop policy if exists "Users select own checking reconciliations" on public.checking_balance_reconciliations;
drop policy if exists "Users insert own checking reconciliations" on public.checking_balance_reconciliations;

create policy "Users select own paycheck events" on public.paycheck_events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own paycheck events" on public.paycheck_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own paycheck events" on public.paycheck_events
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own paycheck events" on public.paycheck_events
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users select own checking reconciliations" on public.checking_balance_reconciliations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own checking reconciliations" on public.checking_balance_reconciliations
  for insert to authenticated with check ((select auth.uid()) = user_id);

create or replace function public.reconcile_checking_balance(
  p_calculated_balance numeric,
  p_confirmed_balance numeric
)
returns public.checking_balance_reconciliations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_result public.checking_balance_reconciliations;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  update public.profiles
    set checking_balance = p_confirmed_balance, updated_at = now()
    where user_id = v_user_id;
  if not found then raise exception 'Financial profile not found'; end if;
  insert into public.checking_balance_reconciliations(user_id, calculated_balance, confirmed_balance)
    values (v_user_id, p_calculated_balance, p_confirmed_balance)
    returning * into v_result;
  return v_result;
end;
$$;

grant execute on function public.reconcile_checking_balance(numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
