create table if not exists public.bill_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null references public.bills(id) on delete cascade,
  due_date date not null,
  expected_amount numeric(12,2) not null check (expected_amount >= 0),
  status text not null default 'upcoming' check (status in ('upcoming', 'paid', 'overdue', 'skipped', 'partial')),
  paid_at timestamptz,
  paid_amount numeric(12,2) check (paid_amount is null or paid_amount >= 0),
  transaction_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, bill_id, due_date)
);

alter table public.bill_occurrences enable row level security;
create policy "Users select own bill occurrences" on public.bill_occurrences for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own bill occurrences" on public.bill_occurrences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own bill occurrences" on public.bill_occurrences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own bill occurrences" on public.bill_occurrences for delete to authenticated using ((select auth.uid()) = user_id);
create index if not exists bill_occurrences_user_due_idx on public.bill_occurrences(user_id, due_date);
create index if not exists bill_occurrences_bill_idx on public.bill_occurrences(bill_id);
