import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PilotEngine } from './simulator';
import { confirmPaycheck, expectedPaycheckDrafts, reconcileCheckingBalance, shouldRequestBalanceConfirmation, type PaycheckReconciliation } from './reconciliation';

const paycheck = { id: 'pay-1', name: 'Paycheck', amount: 2_000, date: '2026-07-24' };
const record = (overrides: Partial<PaycheckReconciliation> = {}): PaycheckReconciliation => ({ id: 'record-1', expectedDate: '2026-07-24', expectedAmount: 2_000, status: 'expected', ...overrides });
const simulate = (event: PaycheckReconciliation, asOfDate = '2026-07-25') => PilotEngine.simulate({
  startDate: '2026-07-20', endDate: '2026-08-01', currentCheckingBalance: 1_000, protectedCheckingCushion: 500,
  paychecks: [paycheck], reconciliation: { asOfDate, paycheckEvents: [event] },
});

describe('Pilot reality check and reconciliation', () => {
  it('keeps a future paycheck expected and includes it in the forecast', () => {
    const result = simulate(record(), '2026-07-20');
    expect(result.forecast.endingBalance).toBe(3_000);
    expect(result.reconciliation.unconfirmedPastEvents).toBe(0);
    expect(result.timeline[0].metadata?.incomeConfirmation).toBe('expected');
  });

  it('flags a past unconfirmed paycheck without silently calling it confirmed', () => {
    const result = simulate(record());
    expect(result.reconciliation.unconfirmedPastEvents).toBe(1);
    expect(result.reconciliation.overdueUnconfirmedIncome).toBe(2_000);
    expect(result.reconciliation.disclosures[0]).toContain('has not been confirmed');
  });

  it('uses the expected amount when received as expected', () => {
    const result = simulate(confirmPaycheck(record(), 'received', undefined, '2026-07-24T15:00:00Z'));
    expect(result.forecast.endingBalance).toBe(3_000);
    expect(result.reconciliation.confirmedIncomeTotal).toBe(2_000);
  });

  it('uses the actual amount when a paycheck differs', () => {
    const result = simulate(confirmPaycheck(record(), 'received_different_amount', 1_840, '2026-07-24T15:00:00Z'));
    expect(result.forecast.endingBalance).toBe(2_840);
    expect(result.timeline[0].amount).toBe(1_840);
  });

  it('removes a missed paycheck from realized cash flow', () => {
    const result = simulate(confirmPaycheck(record(), 'missed', undefined, '2026-07-24T15:00:00Z'));
    expect(result.forecast.endingBalance).toBe(1_000);
    expect(result.timeline[0].amount).toBe(0);
  });

  it('lowers confidence for delayed income', () => {
    const delayed = simulate(confirmPaycheck(record(), 'delayed')).forecastConfidence;
    expect(delayed.score).toBeLessThan(100);
    expect(delayed.reasons).toContain('1 paycheck is delayed.');
  });

  it('uses a confirmed checking balance as the forecast starting point', () => {
    const balance = reconcileCheckingBalance(3_142, 2_982, '2026-07-25T12:00:00Z');
    const result = PilotEngine.simulate({ startDate: '2026-07-25', endDate: '2026-07-30', currentCheckingBalance: 3_142, protectedCheckingCushion: 500, reconciliation: { asOfDate: '2026-07-25', latestBalance: balance } });
    expect(result.forecast.startingBalance).toBe(2_982);
    expect(result.reconciliation.startingBalanceSource).toBe('confirmed');
  });

  it('records checking balance variance without fabricating a transaction', () => {
    const balance = reconcileCheckingBalance(3_142, 2_982, '2026-07-25T12:00:00Z');
    expect(balance.variance).toBe(-160);
    expect(Object.keys(balance)).not.toContain('transaction');
  });

  it('returns high confidence for a recently confirmed balance and confirmed income', () => {
    const balance = reconcileCheckingBalance(1_000, 1_000, '2026-07-25T08:00:00Z');
    const result = PilotEngine.simulate({ startDate: '2026-07-25', endDate: '2026-08-01', currentCheckingBalance: 1_000, protectedCheckingCushion: 500, reconciliation: { asOfDate: '2026-07-25', latestBalance: balance } });
    expect(result.forecastConfidence.level).toBe('high');
  });

  it('returns lower confidence for a stale balance and overdue income', () => {
    const stale = reconcileCheckingBalance(1_000, 1_000, '2026-06-01T08:00:00Z');
    const result = PilotEngine.simulate({ startDate: '2026-07-20', endDate: '2026-08-01', currentCheckingBalance: 1_000, protectedCheckingCushion: 500, paychecks: [paycheck], reconciliation: { asOfDate: '2026-07-25', latestBalance: stale, paycheckEvents: [record()] } });
    expect(result.forecastConfidence.level).toBe('low');
    expect(result.forecastConfidence.unconfirmedPastEvents).toBe(1);
  });

  it('creates deterministic paycheck dates without duplicates in one series', () => {
    const drafts = expectedPaycheckDrafts({ userId: 'user-1', firstDate: '2026-07-03', endDate: '2026-07-31', expectedAmount: 1_000, cadence: 'weekly' });
    expect(new Set(drafts.map(draft => `${draft.user_id}:${draft.expected_date}`)).size).toBe(drafts.length);
  });

  it('centralizes balance-confirmation eligibility', () => {
    expect(shouldRequestBalanceConfirmation({ asOfDate: '2026-07-25', lastConfirmedAt: '2026-07-24T08:00:00Z' })).toBe(false);
    expect(shouldRequestBalanceConfirmation({ asOfDate: '2026-07-25', lastConfirmedAt: '2026-07-24T08:00:00Z', majorRecommendation: true })).toBe(true);
  });

  it('defines user-isolated RLS for both reconciliation tables', () => {
    const migration = readFileSync('supabase/migrations/013_pilot_reconciliation.sql', 'utf8');
    expect(migration).toContain('alter table public.paycheck_events enable row level security');
    expect(migration).toContain('alter table public.checking_balance_reconciliations enable row level security');
    expect(migration.match(/auth\.uid\(\)\) = user_id/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration).toContain('unique(user_id, expected_date)');
  });
});
