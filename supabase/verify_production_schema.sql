-- DebtPilot production schema verifier.
-- Read-only: this script performs SELECTs only and is safe to run in Supabase SQL Editor.
-- Every returned row should have status = PASS. Details show the observed database state.

with
expected_tables(table_name) as (
  values ('profiles'), ('debts'), ('bills'), ('goals'), ('vehicle_scenarios'), ('financial_snapshots'), ('pilot_recommendation_history')
),
expected_columns(table_name, column_name) as (
  values
    ('profiles', 'user_id'), ('profiles', 'display_name'), ('profiles', 'pay_frequency'),
    ('profiles', 'weekly_take_home'), ('profiles', 'checking_balance'), ('profiles', 'savings_balance'),
    ('profiles', 'checking_cushion'), ('profiles', 'weekly_living_reserve'), ('profiles', 'investment_balance'),
    ('profiles', 'other_assets'), ('profiles', 'preferred_strategy'), ('profiles', 'created_at'), ('profiles', 'updated_at'),
    ('profiles', 'onboarding_step'), ('profiles', 'onboarding_completed'), ('profiles', 'onboarding_data'),
    ('debts', 'id'), ('debts', 'user_id'), ('debts', 'name'), ('debts', 'balance'), ('debts', 'apr'),
    ('debts', 'minimum_payment'), ('debts', 'due_day'), ('debts', 'credit_limit'), ('debts', 'promotion_type'),
    ('debts', 'promotional_apr'), ('debts', 'promotion_end_date'), ('debts', 'post_promotion_apr'),
    ('debts', 'original_promotional_balance'), ('debts', 'estimated_deferred_interest'), ('debts', 'created_at'),
    ('bills', 'id'), ('bills', 'user_id'), ('bills', 'name'), ('bills', 'amount'), ('bills', 'due_day'),
    ('bills', 'frequency'), ('bills', 'created_at'),
    ('goals', 'id'), ('goals', 'user_id'), ('goals', 'name'), ('goals', 'goal_type'),
    ('goals', 'target_amount'), ('goals', 'current_amount'), ('goals', 'priority'),
    ('goals', 'target_date'), ('goals', 'created_at'), ('goals', 'updated_at'),
    ('vehicle_scenarios', 'id'), ('vehicle_scenarios', 'user_id'), ('vehicle_scenarios', 'name'),
    ('vehicle_scenarios', 'price'), ('vehicle_scenarios', 'down_payment'), ('vehicle_scenarios', 'trade_in'),
    ('vehicle_scenarios', 'tax_rate'), ('vehicle_scenarios', 'fees'), ('vehicle_scenarios', 'apr'),
    ('vehicle_scenarios', 'term_months'), ('vehicle_scenarios', 'insurance_monthly'),
    ('vehicle_scenarios', 'fuel_monthly'), ('vehicle_scenarios', 'maintenance_monthly'),
    ('vehicle_scenarios', 'created_at'), ('vehicle_scenarios', 'updated_at'),
    ('financial_snapshots', 'id'), ('financial_snapshots', 'user_id'),
    ('financial_snapshots', 'snapshot_date'), ('financial_snapshots', 'total_assets'),
    ('financial_snapshots', 'total_debt'), ('financial_snapshots', 'net_worth'),
    ('financial_snapshots', 'checking_balance'), ('financial_snapshots', 'savings_balance'),
    ('financial_snapshots', 'investment_balance'), ('financial_snapshots', 'other_assets'),
    ('financial_snapshots', 'financial_health'), ('financial_snapshots', 'created_at'),
    ('pilot_recommendation_history', 'id'), ('pilot_recommendation_history', 'user_id'),
    ('pilot_recommendation_history', 'recommendation_id'), ('pilot_recommendation_history', 'category'),
    ('pilot_recommendation_history', 'title'), ('pilot_recommendation_history', 'confidence'),
    ('pilot_recommendation_history', 'estimated_benefit'), ('pilot_recommendation_history', 'reasoning'),
    ('pilot_recommendation_history', 'completed_at'), ('pilot_recommendation_history', 'created_at')
),
expected_policies(table_name, policy_name) as (
  values
    ('profiles', 'Users manage own profile'),
    ('debts', 'Users manage own debts'),
    ('bills', 'Users manage own bills'),
    ('goals', 'Users manage own goals'),
    ('vehicle_scenarios', 'Users manage own vehicle scenarios'),
    ('financial_snapshots', 'Users manage own financial snapshots'),
    ('pilot_recommendation_history', 'Users select own pilot recommendation history'),
    ('pilot_recommendation_history', 'Users insert own pilot recommendation history'),
    ('pilot_recommendation_history', 'Users delete own pilot recommendation history')
),
table_state as (
  select e.table_name, c.oid is not null as exists, coalesce(c.relrowsecurity, false) as rls_enabled
  from expected_tables e
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name and c.relkind in ('r', 'p')
),
checks as (
  select 'table'::text as check_type, table_name as object_name,
    case when exists then 'PASS' else 'FAIL' end as status,
    case when exists then 'table exists' else 'missing public table' end as details
  from table_state
  union all
  select 'rls', table_name,
    case when exists and rls_enabled then 'PASS' else 'FAIL' end,
    case when not exists then 'table missing' when rls_enabled then 'RLS enabled' else 'RLS DISABLED' end
  from table_state
  union all
  select 'column', e.table_name || '.' || e.column_name,
    case when c.column_name is not null then 'PASS' else 'FAIL' end,
    coalesce(c.data_type || case when c.is_nullable = 'NO' then ' NOT NULL' else ' nullable' end, 'missing column')
  from expected_columns e
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = e.table_name and c.column_name = e.column_name
  union all
  select 'policy', e.table_name || '.' || e.policy_name,
    case when p.policyname is not null then 'PASS' else 'FAIL' end,
    coalesce('command=' || p.cmd || '; using=' || coalesce(p.qual, '<none>') || '; check=' || coalesce(p.with_check, '<none>'), 'missing policy')
  from expected_policies e
  left join pg_policies p
    on p.schemaname = 'public' and p.tablename = e.table_name and p.policyname = e.policy_name
)
select check_type, object_name, status, details
from checks
order by case status when 'FAIL' then 0 else 1 end, check_type, object_name;

-- Summary: expected result is zero failed checks.
with
expected_tables(table_name) as (
  values ('profiles'), ('debts'), ('bills'), ('goals'), ('vehicle_scenarios'), ('financial_snapshots'), ('pilot_recommendation_history')
),
expected_policies(table_name, policy_name) as (
  values
    ('profiles', 'Users manage own profile'), ('debts', 'Users manage own debts'),
    ('bills', 'Users manage own bills'), ('goals', 'Users manage own goals'),
    ('vehicle_scenarios', 'Users manage own vehicle scenarios'),
    ('financial_snapshots', 'Users manage own financial snapshots'),
    ('pilot_recommendation_history', 'Users select own pilot recommendation history'),
    ('pilot_recommendation_history', 'Users insert own pilot recommendation history'),
    ('pilot_recommendation_history', 'Users delete own pilot recommendation history')
)
select
  count(*) filter (where c.oid is null) as missing_tables,
  count(*) filter (where c.oid is not null and not c.relrowsecurity) as tables_without_rls,
  (select count(*) from expected_policies e left join pg_policies p
    on p.schemaname = 'public' and p.tablename = e.table_name and p.policyname = e.policy_name
    where p.policyname is null) as missing_policies
from expected_tables e
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name and c.relkind in ('r', 'p');
