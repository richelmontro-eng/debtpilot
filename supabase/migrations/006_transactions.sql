create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null default current_date,
  transaction_type text not null check (transaction_type in ('income', 'expense', 'bill_payment', 'debt_payment', 'transfer', 'refund', 'bonus')),
  description text not null,
  category text not null default 'Other',
  account text not null default 'Checking',
  amount numeric(12,2) not null check (amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions(user_id, transaction_date desc);

create index if not exists transactions_user_type_idx
  on public.transactions(user_id, transaction_type);

alter table public.transactions enable row level security;

drop policy if exists "Users manage own transactions" on public.transactions;

create policy "Users manage own transactions"
on public.transactions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
