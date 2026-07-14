import { describe, expect, it } from 'vitest';
import { createRecurringTimelineEvents, FinancialTimelineEngine, type FinancialTimelineInput } from './financial-timeline-engine';

const base = (changes: Partial<FinancialTimelineInput> = {}): FinancialTimelineInput => ({ startDate: '2026-01-01', endDate: '2026-01-31', currentCheckingBalance: 500, protectedCheckingCushion: 200, ...changes });

describe('FinancialTimelineEngine', () => {
  it.each([
    ['weekly', 5], ['biweekly', 3], ['semimonthly', 2], ['monthly', 1],
  ] as const)('simulates %s pay deterministically', (cadence, expected) => {
    const paychecks = createRecurringTimelineEvents({ idPrefix: 'pay', name: 'Paycheck', amount: 1000, firstDate: '2026-01-01', endDate: '2026-01-31', cadence });
    const result = FinancialTimelineEngine.simulate(base({ paychecks }));
    expect(result.events).toHaveLength(expected);
    expect(result.summary.endingBalance).toBe(500 + expected * 1000);
  });

  it('preserves deterministic input order for multiple bills on the same day', () => {
    const result = FinancialTimelineEngine.simulate(base({ bills: [{ id: 'rent', name: 'Rent', date: '2026-01-10', amount: -300, required: true }, { id: 'power', name: 'Power', date: '2026-01-10', amount: -100, required: true }] }));
    expect(result.events.map(event => [event.id, event.projectedBalance])).toEqual([['rent', 200], ['power', 100]]);
  });

  it('counts calendar days below the protected cushion and identifies paycheck recovery', () => {
    const result = FinancialTimelineEngine.simulate(base({ endDate: '2026-01-12', bills: [{ id: 'bill', name: 'Bill', date: '2026-01-05', amount: -400, required: true }], paychecks: [{ id: 'pay', name: 'Paycheck', date: '2026-01-10', amount: 1000 }] }));
    expect(result.daysBelowCushion).toBe(5);
    expect(result.summary.recoveryDate).toBe('2026-01-10');
    expect(result.summary.recoversAfterNextPaycheck).toBe(true);
    expect(result.cashFlowWarnings.map(item => item.type)).toEqual(expect.arrayContaining(['below_cushion', 'recovery']));
  });

  it('reports negative balances and required obligations at risk', () => {
    const result = FinancialTimelineEngine.simulate(base({ bills: [{ id: 'rent', name: 'Rent', date: '2026-01-02', amount: -800, required: true }] }));
    expect(result.lowestProjectedBalance).toBe(-300);
    expect(result.negativeBalanceEvents.map(event => event.id)).toEqual(['rent']);
    expect(result.summary.requiredObligationsAtRisk).toBe(1);
    expect(result.summary.firstNegativeDate).toBe('2026-01-02');
  });

  it('overlays scenario events without modifying saved events', () => {
    const saved = [{ id: 'pay', name: 'Paycheck', date: '2026-01-01', amount: 1000 }];
    const scenario = [{ id: 'vehicle', scenarioId: 'car-1', name: 'Vehicle payment', date: '2026-01-15', amount: -612 }];
    const withScenario = FinancialTimelineEngine.simulate(base({ paychecks: saved, scenarioTransactions: scenario }));
    const removedScenario = FinancialTimelineEngine.simulate(base({ paychecks: saved, scenarioTransactions: scenario, excludedScenarioIds: ['car-1'] }));
    expect(withScenario.summary.endingBalance).toBe(888);
    expect(removedScenario.summary.endingBalance).toBe(1500);
    expect(saved).toEqual([{ id: 'pay', name: 'Paycheck', date: '2026-01-01', amount: 1000 }]);
    expect(scenario).toEqual([{ id: 'vehicle', scenarioId: 'car-1', name: 'Vehicle payment', date: '2026-01-15', amount: -612 }]);
  });

  it('combines debt, goal, scheduled, and scenario transactions chronologically', () => {
    const result = FinancialTimelineEngine.simulate(base({ debtPayments: [{ id: 'debt', name: 'Card', date: '2026-01-12', amount: -175, required: true }], goalContributions: [{ id: 'goal', name: 'Emergency fund', date: '2026-01-08', amount: -50 }], scheduledTransactions: [{ id: 'refund', name: 'Refund', date: '2026-01-04', amount: 75 }], scenarioTransactions: [{ id: 'car', name: 'Vehicle', date: '2026-01-20', amount: -100 }] }));
    expect(result.events.map(event => event.id)).toEqual(['refund', 'goal', 'debt', 'car']);
    expect(result.summary).toMatchObject({ totalInflows: 75, totalOutflows: 325, netChange: -250, endingBalance: 250 });
  });
});
