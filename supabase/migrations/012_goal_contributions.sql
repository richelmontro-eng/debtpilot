create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  contributed_on date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.goal_contributions enable row level security;
create policy "Users select own goal contributions" on public.goal_contributions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users insert own goal contributions" on public.goal_contributions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own goal contributions" on public.goal_contributions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own goal contributions" on public.goal_contributions for delete to authenticated using ((select auth.uid()) = user_id);
create index if not exists goal_contributions_user_goal_date_idx on public.goal_contributions(user_id, goal_id, contributed_on desc);
