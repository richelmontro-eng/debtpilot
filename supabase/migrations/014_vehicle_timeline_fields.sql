alter table public.vehicle_scenarios
  add column if not exists purchase_date date,
  add column if not exists first_payment_date date,
  add column if not exists preferred_payment_day integer
    check (preferred_payment_day is null or preferred_payment_day in (1,10,15,22,31)),
  add column if not exists registration_annual numeric(12,2) not null default 0
    check (registration_annual >= 0);

notify pgrst, 'reload schema';
