alter table public.transactions
  add column if not exists posted_at timestamptz,
  add column if not exists posted_account text,
  add column if not exists debt_id uuid references public.debts(id) on delete set null;

create index if not exists transactions_user_posted_idx
  on public.transactions(user_id, posted_at);

create or replace function public.post_transaction(
  p_transaction_id uuid,
  p_debt_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_account text;
  v_balance numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_tx
  from public.transactions
  where id = p_transaction_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Transaction not found';
  end if;

  if v_tx.posted_at is not null then
    raise exception 'Transaction is already posted';
  end if;

  if v_tx.transaction_type = 'transfer' then
    raise exception 'Transfers are ledger-only until source and destination accounts are supported';
  end if;

  v_account := lower(trim(v_tx.account));
  if v_account not in ('checking', 'savings') then
    raise exception 'Account must be Checking or Savings before posting';
  end if;

  select case when v_account = 'checking' then checking_balance else savings_balance end
    into v_balance
  from public.profiles
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'Financial profile not found';
  end if;

  if v_tx.transaction_type in ('income', 'refund', 'bonus') then
    if v_account = 'checking' then
      update public.profiles
      set checking_balance = checking_balance + v_tx.amount, updated_at = now()
      where user_id = v_user_id;
    else
      update public.profiles
      set savings_balance = savings_balance + v_tx.amount, updated_at = now()
      where user_id = v_user_id;
    end if;
  else
    if v_balance < v_tx.amount then
      raise exception 'Insufficient % balance to post this transaction', v_account;
    end if;

    if v_account = 'checking' then
      update public.profiles
      set checking_balance = checking_balance - v_tx.amount, updated_at = now()
      where user_id = v_user_id;
    else
      update public.profiles
      set savings_balance = savings_balance - v_tx.amount, updated_at = now()
      where user_id = v_user_id;
    end if;

    if v_tx.transaction_type = 'debt_payment' then
      if p_debt_id is null then
        raise exception 'Choose a debt before posting a debt payment';
      end if;

      update public.debts
      set balance = greatest(0, balance - v_tx.amount)
      where id = p_debt_id and user_id = v_user_id;

      if not found then
        raise exception 'Debt not found';
      end if;
    end if;
  end if;

  update public.transactions
  set posted_at = now(), posted_account = initcap(v_account), debt_id = p_debt_id, updated_at = now()
  where id = p_transaction_id and user_id = v_user_id;
end;
$$;

grant execute on function public.post_transaction(uuid, uuid) to authenticated;
