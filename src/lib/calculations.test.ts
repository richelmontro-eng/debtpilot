import { describe, expect, it } from 'vitest';
import { buildForecast } from './forecast';
import { simulatePayoff } from './payoff';
import { evaluateVehicle, monthlyLoanPayment } from './vehicle';

describe('payoff engine', () => {
  const debts = [
    { id: 'high', name: 'High APR', balance: 1_000, apr: 24, minimum: 50 },
    { id: 'small', name: 'Small balance', balance: 500, apr: 5, minimum: 25 },
  ];

  it('pays debt off faster and with less interest when extra money is added', () => {
    const minimumOnly = simulatePayoff(debts, 0, 'avalanche');
    const accelerated = simulatePayoff(debts, 100, 'avalanche');
    expect(accelerated.paidOff).toBe(true);
    expect(accelerated.months).toBeLessThan(minimumOnly.months);
    expect(accelerated.totalInterest).toBeLessThan(minimumOnly.totalInterest);
  });

  it('reports a negative-amortization plan as not payable', () => {
    const result = simulatePayoff([{ id: '1', name: 'Debt', balance: 10_000, apr: 24, minimum: 100 }], 0, 'avalanche');
    expect(result.paidOff).toBe(false);
    expect(result.debtFreeDate).toBeNull();
  });

  it('returns an immediate paid-off result for an empty portfolio', () => {
    const result = simulatePayoff([], 500, 'snowball');
    expect(result).toMatchObject({ months: 0, totalInterest: 0, paidOff: true });
  });
});

describe('cash-flow forecast engine', () => {
  it('clamps monthly due dates to the final day of short months', () => {
    const result = buildForecast({
      startingBalance: 1_000,
      payPerCheck: 0,
      payFrequency: 'monthly',
      days: 35,
      startDate: new Date(2026, 0, 30),
      bills: [{ id: '1', name: 'Rent', amount: 100, dueDay: 31, frequency: 'monthly' }],
    });
    const februaryBill = result.events.find(event => event.label === 'Rent' && event.date.getMonth() === 1);
    expect(februaryBill?.date.getDate()).toBe(28);
  });

  it('uses calendar semimonthly dates without 15-day drift', () => {
    const result = buildForecast({
      startingBalance: 0,
      payPerCheck: 1_000,
      payFrequency: 'semimonthly',
      days: 45,
      startDate: new Date(2026, 0, 1),
      bills: [],
    });
    expect(result.events.map(event => `${event.date.getMonth() + 1}/${event.date.getDate()}`))
      .toEqual(['1/15', '1/31', '2/15']);
  });

  it('credits income before bills occurring on the same date', () => {
    const result = buildForecast({
      startingBalance: 0,
      payPerCheck: 1_000,
      payFrequency: 'semimonthly',
      days: 20,
      startDate: new Date(2026, 0, 1),
      bills: [{ id: '1', name: 'Rent', amount: 800, dueDay: 15, frequency: 'monthly' }],
    });
    expect(result.events.map(event => event.type)).toEqual(['income', 'bill']);
    expect(result.lowestBalance).toBe(0);
    expect(result.endingBalance).toBe(200);
  });
});

describe('vehicle readiness engine', () => {
  it('calculates a standard amortized payment', () => {
    expect(monthlyLoanPayment(20_000, 6, 60)).toBeCloseTo(386.66, 1);
  });

  it('handles zero-interest financing without dividing by zero', () => {
    expect(monthlyLoanPayment(12_000, 0, 48)).toBe(250);
  });

  it('does not let negative ownership inputs improve readiness', () => {
    const result = evaluateVehicle({
      price: 20_000, downPayment: 2_000, tradeIn: 0, taxRate: 5, fees: 500,
      apr: 6, termMonths: 60, insuranceMonthly: -100, fuelMonthly: -100, maintenanceMonthly: -100,
    }, {
      monthlyIncome: 4_000, monthlyBills: 1_000, monthlyDebtMinimums: 300,
      monthlyLiving: 1_000, checking: 2_000, savings: 10_000, checkingCushion: 1_000,
    });
    expect(result.ownershipMonthly).toBeGreaterThan(0);
    expect(result.ownershipMonthly).toBe(result.paymentMonthly);
  });

  it('does not count cash-paid fees in the financed balance', () => {
    const result = evaluateVehicle({
      price: 20_000, downPayment: 2_000, tradeIn: 1_000, taxRate: 5, fees: 500,
      apr: 6, termMonths: 60, insuranceMonthly: 0, fuelMonthly: 0, maintenanceMonthly: 0,
    }, {
      monthlyIncome: 4_000, monthlyBills: 1_000, monthlyDebtMinimums: 300,
      monthlyLiving: 1_000, checking: 2_000, savings: 10_000, checkingCushion: 1_000,
    });
    expect(result.amountFinanced).toBe(17_950);
    expect(result.cashDueAtPurchase).toBe(2_500);
  });
});
