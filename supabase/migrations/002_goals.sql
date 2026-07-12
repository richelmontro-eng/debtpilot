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

alter table public.goals enable row level security;

drop policy if exists "Users manage own goals" on public.goals;
create policy "Users manage own goals"
on public.goals
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
