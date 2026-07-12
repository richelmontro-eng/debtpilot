-- Non-destructive indexes for the user-scoped queries used throughout the application.
create index if not exists debts_user_id_idx on public.debts(user_id);
create index if not exists bills_user_id_idx on public.bills(user_id);
create index if not exists goals_user_id_idx on public.goals(user_id);
create index if not exists vehicle_scenarios_user_id_idx on public.vehicle_scenarios(user_id);
create index if not exists financial_snapshots_user_id_snapshot_date_idx
  on public.financial_snapshots(user_id, snapshot_date);
