alter table public.debts
  add column if not exists promotion_type text not null default 'none',
  add column if not exists promotional_apr numeric(7,3),
  add column if not exists promotion_end_date date,
  add column if not exists post_promotion_apr numeric(7,3),
  add column if not exists original_promotional_balance numeric(12,2),
  add column if not exists estimated_deferred_interest numeric(12,2);

alter table public.debts alter column promotional_apr drop not null;
alter table public.debts alter column promotional_apr drop default;

alter table public.debts drop constraint if exists debts_promotion_type_check;
alter table public.debts add constraint debts_promotion_type_check check (promotion_type in ('none', 'zero_percent', 'deferred_interest'));
alter table public.debts drop constraint if exists debts_promotional_apr_check;
alter table public.debts add constraint debts_promotional_apr_check check (promotional_apr is null or promotional_apr >= 0);
alter table public.debts drop constraint if exists debts_post_promotion_apr_check;
alter table public.debts add constraint debts_post_promotion_apr_check check (post_promotion_apr is null or post_promotion_apr >= 0);
alter table public.debts drop constraint if exists debts_original_promotional_balance_check;
alter table public.debts add constraint debts_original_promotional_balance_check check (original_promotional_balance is null or original_promotional_balance >= 0);
alter table public.debts drop constraint if exists debts_estimated_deferred_interest_check;
alter table public.debts add constraint debts_estimated_deferred_interest_check check (estimated_deferred_interest is null or estimated_deferred_interest >= 0);

notify pgrst, 'reload schema';
