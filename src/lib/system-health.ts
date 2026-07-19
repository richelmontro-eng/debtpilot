export const REQUIRED_SCHEMA = {
  profiles: ['user_id','display_name','pay_frequency','weekly_take_home','checking_balance','savings_balance','checking_cushion','weekly_living_reserve','onboarding_completed','next_paycheck_date'],
  debts: ['id','user_id','name','balance','apr','minimum_payment','promotion_type','promotional_apr','promotion_end_date','post_promotion_apr'],
  bills: ['id','user_id','name','amount','due_day','frequency'],
  goals: ['id','user_id','name','goal_type','target_amount','current_amount','priority'],
  goal_contributions: ['id','user_id','goal_id','amount','contributed_on','created_at'],
  transactions: ['id','user_id','transaction_date','transaction_type','amount','posted_at'],
  vehicle_scenarios: ['id','user_id','name','price','down_payment','apr','term_months'],
  financial_snapshots: ['id','user_id','snapshot_date','net_worth','financial_health'],
  pilot_recommendation_history: ['id','user_id','recommendation_id','completed_at'],
  bill_occurrences: ['id','user_id','bill_id','due_date','expected_amount','status','paid_at','paid_amount'],
  paycheck_events: ['id','user_id','expected_date','expected_amount','status','actual_amount','confirmed_at','note'],
  checking_balance_reconciliations: ['id','user_id','calculated_balance','confirmed_balance','variance','confirmed_at'],
} as const;

export const MIGRATIONS = [
  '001_initial_schema.sql','002_goals.sql','003_vehicle_scenarios.sql','004_financial_snapshots.sql','005_query_indexes.sql',
  '006_pilot_recommendation_history.sql','006_transactions.sql','007_onboarding.sql','007_transaction_posting.sql',
  '008_promotional_interest_debts.sql','009_promotional_debt_persistence.sql','010_beta_data_safety.sql','011_bill_occurrences.sql','012_goal_contributions.sql','013_pilot_reconciliation.sql',
] as const;

export const LATEST_SCHEMA_VERSION = '013';
export type Probe = { table:string; ok:boolean; error?:string };
export function missingMigrations(probes:Probe[]) {
  const failed = new Set(probes.filter(probe=>!probe.ok).map(probe=>probe.table));
  const missing:string[]=[];
  if (failed.has('profiles')||failed.has('debts')||failed.has('bills')) missing.push('001_initial_schema.sql');
  if (failed.has('goals')) missing.push('002_goals.sql');
  if (failed.has('goal_contributions')) missing.push('012_goal_contributions.sql');
  if (failed.has('vehicle_scenarios')) missing.push('003_vehicle_scenarios.sql');
  if (failed.has('financial_snapshots')) missing.push('004_financial_snapshots.sql');
  if (failed.has('pilot_recommendation_history')) missing.push('006_pilot_recommendation_history.sql');
  if (failed.has('transactions')) missing.push('006_transactions.sql / 007_transaction_posting.sql');
  if (failed.has('bill_occurrences')) missing.push('011_bill_occurrences.sql');
  if (failed.has('paycheck_events')||failed.has('checking_balance_reconciliations')) missing.push('013_pilot_reconciliation.sql');
  return missing;
}
