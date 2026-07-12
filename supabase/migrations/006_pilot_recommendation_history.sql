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

alter table public.pilot_recommendation_history enable row level security;

create policy "Users select own pilot recommendation history"
on public.pilot_recommendation_history for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users insert own pilot recommendation history"
on public.pilot_recommendation_history for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users delete own pilot recommendation history"
on public.pilot_recommendation_history for delete to authenticated
using ((select auth.uid()) = user_id);

create index if not exists pilot_recommendation_history_user_completed_idx
  on public.pilot_recommendation_history(user_id, completed_at desc);
