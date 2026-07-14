import { describe, expect, it } from 'vitest';
import { buildDebtWorkspace } from './debt-workspace';
import type { PersistedDebt } from './debt-persistence';

const debt = (changes: Partial<PersistedDebt> = {}): PersistedDebt => ({
  id: 'card', name: 'Card', balance: 2000, apr: 20, minimum: 100, promotionType: 'none', promotionalApr: null,
  promotionEndDate: '', postPromotionApr: null, originalPromotionalBalance: null, estimatedDeferredInterest: null, ...changes,
});

describe('debt workspace model', () => {
  it('summarizes active debts and honors avalanche ranking', () => {
    const model = buildDebtWorkspace([debt(), debt({ id: 'loan', name: 'Loan', balance: 5000, apr: 8, minimum: 150 })], 'avalanche', new Date('2026-01-01'));
    expect(model.totalDebt).toBe(7000);
    expect(model.totalMinimums).toBe(250);
    expect(model.sections['Active Payoff'][0].debt.name).toBe('Card');
    expect(model.sections['Active Payoff'][0].recommendedPayment).toBeGreaterThan(100);
  });

  it('puts incomplete and endangered promotional debts in needs attention', () => {
    const model = buildDebtWorkspace([
      debt({ id: 'missing', minimum: 0 }),
      debt({ id: 'promo', promotionType: 'deferred_interest', promotionalApr: 0, promotionEndDate: '2026-03-01', estimatedDeferredInterest: 500 }),
    ], 'avalanche', new Date('2026-01-01'));
    expect(model.sections['Needs Attention'].map(item => item.debt.id)).toEqual(expect.arrayContaining(['missing', 'promo']));
    expect(model.sections['Needs Attention'].find(item => item.debt.id === 'promo')?.promotion.effectiveApr).toBe(0);
  });

  it('separates paid-off debts and uses the active promotional rate for interest', () => {
    const model = buildDebtWorkspace([
      debt({ id: 'paid', balance: 0 }),
      debt({ promotionType: 'zero_percent', promotionalApr: 0, postPromotionApr: 29, promotionEndDate: '2027-01-01' }),
    ], 'avalanche', new Date('2026-01-01'));
    expect(model.sections['Paid Off']).toHaveLength(1);
    expect(model.estimatedMonthlyInterest).toBe(0);
  });
});
