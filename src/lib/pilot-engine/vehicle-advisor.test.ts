import { describe, expect, it } from 'vitest';
import { adviseVehicle, type VehicleAdvisorFinances, type VehiclePurchaseScenario } from './vehicle-advisor';

const scenario: VehiclePurchaseScenario = {
  price: 24_000, downPayment: 2_000, tradeIn: 0, taxRate: 5, fees: 300, apr: 6, termMonths: 60,
  insuranceMonthly: 120, fuelMonthly: 100, maintenanceMonthly: 50, purchaseDate: '2026-08-01',
};

function finances(overrides: Partial<VehicleAdvisorFinances> = {}): VehicleAdvisorFinances {
  return {
    startDate: '2026-07-01', horizonDays: 90, currentCheckingBalance: 8_000, protectedCheckingCushion: 1_000,
    payPerCheck: 1_500, payFrequency: 'weekly', firstPaycheckDate: '2026-07-03', livingReservePerCheck: 500,
    bills: [{ id: 'rent', name: 'Rent', amount: 1_500, dueDay: 1, frequency: 'monthly' }],
    debtPayments: [{ id: 'card', name: 'Card minimum', amount: 150, dueDay: 12 }], plannedGoalContributions: [], existingVehicleMonthly: 0,
    ...overrides,
  };
}

describe('Pilot Engine vehicle advisor integration', () => {
  it('uses every weekly paycheck, including a fifth check in the period', () => {
    const result = adviseVehicle(finances({ horizonDays: 35 }), scenario);
    expect(result.baselineForecast.timeline.filter(event => event.type === 'paycheck' && event.date <= '2026-08-05')).toHaveLength(5);
  });

  it.each([
    ['biweekly', 7],
    ['semimonthly', 6],
  ] as const)('uses the full %s paycheck schedule', (payFrequency, expected) => {
    const result = adviseVehicle(finances({ payFrequency, horizonDays: 90 }), scenario);
    expect(result.baselineForecast.timeline.filter(event => event.type === 'paycheck')).toHaveLength(expected);
  });

  it('detects a bill due before the next paycheck', () => {
    const result = adviseVehicle(finances({ currentCheckingBalance: 500, protectedCheckingCushion: 200, firstPaycheckDate: '2026-07-10', bills: [{ id: 'rent', name: 'Rent', amount: 900, dueDay: 2, frequency: 'monthly' }] }), scenario);
    expect(result.baseline.underfundedBills.map(item => item.name)).toContain('Rent');
  });

  it('explains a temporary cushion dip and recovery', () => {
    const result = adviseVehicle(finances({ currentCheckingBalance: 2_000, protectedCheckingCushion: 1_500, payPerCheck: 2_000, bills: [] }), { ...scenario, purchaseDate: '2026-07-02', downPayment: 900, fees: 0, price: 10_000 });
    expect(result.scenario.belowCushionDates.length).toBeGreaterThan(0);
    expect(result.scenario.recoveryDate).toBe('2026-07-03');
    expect(result.coach.explanation).toContain('recovers');
  });

  it('rates a persistent shortfall as reconsider', () => {
    const result = adviseVehicle(finances({ currentCheckingBalance: 500, protectedCheckingCushion: 500, payPerCheck: 300, livingReservePerCheck: 300 }), { ...scenario, price: 90_000, downPayment: 5_000, purchaseDate: '2026-07-02' });
    expect(result.scenario.negativeBalanceDates.length).toBeGreaterThan(0);
    expect(result.coach.rating).toBe('Reconsider');
  });

  it('identifies an affordable scenario', () => {
    const result = adviseVehicle(finances(), { ...scenario, price: 10_000, downPayment: 1_000 });
    expect(result.coach.rating).toBe('Strong fit');
    expect(result.scenario.underfundedBills).toHaveLength(0);
  });

  it('identifies an unaffordable scenario', () => {
    const result = adviseVehicle(finances({ currentCheckingBalance: 2_000, payPerCheck: 800, livingReservePerCheck: 600 }), { ...scenario, price: 100_000, downPayment: 5_000, purchaseDate: '2026-07-02' });
    expect(['Wait', 'Reconsider']).toContain(result.coach.rating);
    expect(result.realityCheck.affordablePriceHigh).toBeLessThan(100_000);
  });

  it('recalculates the loan for a higher down payment', () => {
    const low = adviseVehicle(finances(), scenario);
    const high = adviseVehicle(finances(), { ...scenario, downPayment: 10_000 });
    expect(high.loan.monthlyPayment).toBeLessThan(low.loan.monthlyPayment);
  });

  it('improves the projected monthly cost for a reduced vehicle price', () => {
    const entered = adviseVehicle(finances(), scenario);
    const lower = adviseVehicle(finances(), { ...scenario, price: 15_000 });
    expect(lower.loan.monthlyOwnershipCost).toBeLessThan(entered.loan.monthlyOwnershipCost);
    expect(lower.scenario.balances.day90).toBeGreaterThan(entered.scenario.balances.day90);
  });

  it('does not mutate saved financial data or the proposed scenario', () => {
    const financialInput = finances();
    const financialCopy = structuredClone(financialInput);
    const scenarioCopy = structuredClone(scenario);
    adviseVehicle(financialInput, scenario);
    expect(financialInput).toEqual(financialCopy);
    expect(scenario).toEqual(scenarioCopy);
  });
});
