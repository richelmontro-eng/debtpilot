import { describe, expect, it } from 'vitest';
import { createRecurringTimelineEvents, createScenarioPaymentSeries, PilotEngine } from '.';

describe('Pilot Engine phase 1', () => {
  it.each(['weekly', 'biweekly', 'semimonthly', 'monthly'] as const)('produces a reusable forecast for %s pay', cadence => {
    const paychecks = createRecurringTimelineEvents({ idPrefix: 'pay', name: 'Paycheck', amount: 1000, firstDate: '2026-01-01', endDate: '2026-02-28', cadence });
    const result = PilotEngine.simulate({ startDate: '2026-01-01', endDate: '2026-02-28', currentCheckingBalance: 500, protectedCheckingCushion: 200, paychecks, bills: [{ id: 'rent', name: 'Rent', date: '2026-01-03', amount: -900, required: true }, { id: 'power', name: 'Power', date: '2026-01-03', amount: -100, required: true }] });
    expect(result.timeline.map(event => event.date)).toEqual([...result.timeline.map(event => event.date)].sort());
    expect(result).toEqual(expect.objectContaining({ forecast: expect.any(Object), warnings: expect.any(Array), recommendations: expect.any(Array), statistics: expect.any(Object), confidence: expect.any(Object) }));
  });

  it('supports general income and every supported outflow type', () => {
    const result = PilotEngine.simulate({ startDate: '2026-01-01', endDate: '2026-01-31', currentCheckingBalance: 1000, protectedCheckingCushion: 250, income: [{ id: 'income', name: 'Side income', date: '2026-01-02', amount: 200 }], debtPayments: [{ id: 'debt', name: 'Card', date: '2026-01-03', amount: -100 }], goalContributions: [{ id: 'goal', name: 'Goal', date: '2026-01-04', amount: -50 }], scheduledTransactions: [{ id: 'once', name: 'One-time', date: '2026-01-05', amount: -25 }] });
    expect(result.timeline.map(event => event.type)).toEqual(['income', 'debt_payment', 'goal_contribution', 'scheduled_transaction']);
    expect(result.forecast.endingBalance).toBe(1025);
  });

  it('adds and removes a temporary monthly scenario without mutating inputs', () => {
    const scenario = createScenarioPaymentSeries({ scenarioId: 'vehicle-1', name: 'Vehicle payment', amount: -612, firstDate: '2026-01-10', endDate: '2026-03-31', cadence: 'monthly' });
    const input = { startDate: '2026-01-01', endDate: '2026-03-31', currentCheckingBalance: 2000, protectedCheckingCushion: 500, scenarioTransactions: scenario };
    const withScenario = PilotEngine.simulate(input);
    const removed = PilotEngine.simulate({ ...input, excludedScenarioIds: ['vehicle-1'] });
    expect(withScenario.statistics.outflowEventCount).toBe(3);
    expect(removed.timeline).toHaveLength(0);
    expect(scenario).toHaveLength(3);
  });

  it('reports cushion violations, negative balances, and recovery after income', () => {
    const result = PilotEngine.simulate({ startDate: '2026-01-01', endDate: '2026-01-15', currentCheckingBalance: 500, protectedCheckingCushion: 300, bills: [{ id: 'bill', name: 'Rent', date: '2026-01-02', amount: -700, required: true }], paychecks: [{ id: 'pay', name: 'Paycheck', date: '2026-01-08', amount: 1200 }] });
    expect(result.forecast).toMatchObject({ lowestBalance: -200, hasNegativeBalance: true, recovers: true, recoveryDate: '2026-01-08' });
    expect(result.warnings.map(warning => warning.type)).toEqual(expect.arrayContaining(['below_cushion', 'negative_balance', 'obligation_at_risk', 'recovery']));
    expect(result.recommendations[0].action).toBe('cover_shortfall');
  });
});
