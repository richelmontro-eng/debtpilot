alter table public.profiles
  add column if not exists onboarding_step integer,
  add column if not exists onboarding_completed boolean,
  add column if not exists onboarding_data jsonb;

-- Preserve access for existing users while new profiles begin incomplete.
update public.profiles set onboarding_step = 5 where onboarding_step is null;
update public.profiles set onboarding_completed = true where onboarding_completed is null;
update public.profiles set onboarding_data = '{}'::jsonb where onboarding_data is null;

alter table public.profiles
  alter column onboarding_step set default 0,
  alter column onboarding_step set not null,
  alter column onboarding_completed set default false,
  alter column onboarding_completed set not null,
  alter column onboarding_data set default '{}'::jsonb,
  alter column onboarding_data set not null;

alter table public.profiles drop constraint if exists profiles_onboarding_step_check;
alter table public.profiles add constraint profiles_onboarding_step_check check (onboarding_step between 0 and 5);
