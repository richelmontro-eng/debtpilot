import { describe, expect, it } from 'vitest';
import { evaluatePurchase, type PurchaseFinancialState, type PurchaseScenario } from './before-you-buy';

const finances: PurchaseFinancialState = {
  payPerCheck: 1500, periodsPerYear: 26, checking: 8000, savings: 5000, checkingCushion: 2000,
  livingPerCheck: 500, monthlyBills: 1800, strategy: 'avalanche',
  debts: [{ id: 'card', name: 'Card', balance: 3000, apr: 18, minimum: 100 }],
  goals: [{ id: 'emergency', name: 'Emergency Fund', goalType: 'emergency_fund', targetAmount: 10000, currentAmount: 5000, priority: 1 }],
};
const base: PurchaseScenario = { itemName: 'Laptop', purchasePrice: 1000, method: 'cash', downPayment: 0, monthlyPayment: 0, interestRate: 0, loanLength: 0, purchaseDate: '2026-08-01' };

describe('Before You Buy decision engine', () => {
  it('proceeds when a cash purchase preserves the cushion and cash flow', () => {
    const result = evaluatePurchase(base, finances);
    expect(result.decision).toBe('Proceed');
    expect(result.checkingAfter).toBe(7000);
    expect(result.pilotBefore.recommendation).toBeDefined();
    expect(result.pilotAfter.recommendation).toBeDefined();
  });

  it('reconsiders a purchase that overdraws checking', () => {
    const result = evaluatePurchase({ ...base, purchasePrice: 12000 }, finances);
    expect(result.decision).toBe('Reconsider');
    expect(result.risks.join(' ')).toContain('protected cushion');
  });

  it('calculates financing and its debt-free impact deterministically', () => {
    const result = evaluatePurchase({ ...base, method: 'finance', purchasePrice: 20000, downPayment: 2000, interestRate: 7, loanLength: 60 }, finances);
    expect(result.monthlyPayment).toBeGreaterThan(350);
    expect(result.debtFreeAfter).not.toBe(result.debtFreeBefore);
    expect(result.why).toHaveLength(4);
  });

  it('reports goal delays without inventing missing goals', () => {
    const result = evaluatePurchase(base, finances);
    expect(result.goalDelays.find(goal => goal.label === 'Emergency Fund')?.status).not.toBe('No matching goal saved');
    expect(result.goalDelays.find(goal => goal.label === 'Vacation')?.status).toBe('No matching goal saved');
  });
});
