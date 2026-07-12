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

alter table public.vehicle_scenarios enable row level security;

drop policy if exists "Users manage own vehicle scenarios" on public.vehicle_scenarios;

create policy "Users manage own vehicle scenarios"
on public.vehicle_scenarios
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
