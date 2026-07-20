import { describe, expect, it } from 'vitest';
import { adviseVehicle, buildVehicleScenarioEvents, type VehicleAdvisorFinances, type VehiclePurchaseScenario } from './vehicle-advisor';

const scenario: VehiclePurchaseScenario = {
  price: 24_000, downPayment: 2_000, tradeIn: 0, taxRate: 5, fees: 300, apr: 6, termMonths: 60,
  insuranceMonthly: 120, fuelMonthly: 100, maintenanceMonthly: 50, registrationAnnual: 250,
  purchaseDate: '2026-08-01', firstPaymentDate: '2026-09-15', preferredPaymentDay: 15,
};

function finances(overrides: Partial<VehicleAdvisorFinances> = {}): VehicleAdvisorFinances {
  return {
    startDate: '2026-07-01', horizonDays: 90, currentCheckingBalance: 8_000, protectedCheckingCushion: 1_000,
    payPerCheck: 1_500, payFrequency: 'weekly', firstPaycheckDate: '2026-07-03', livingReservePerCheck: 500,
    bills: [{ id: 'rent', name: 'Rent', amount: 1_500, dueDay: 1, frequency: 'monthly' }],
    debtPayments: [{ id: 'card', name: 'Card minimum', amount: 150, dueDay: 12 }],
    plannedGoalContributions: [{ id: 'goal', name: 'Emergency fund', amount: 100, firstDate: '2026-07-20' }],
    existingVehicleMonthly: 0,
    ...overrides,
  };
}

describe('Vehicle Advisor Pilot Engine consumer', () => {
  it.each([
    ['weekly', 13],
    ['biweekly', 7],
    ['monthly', 3],
  ] as const)('uses every %s paycheck as a dated event', (payFrequency, count) => {
    const result = adviseVehicle(finances({ payFrequency }), scenario);
    expect(result.baselineForecast.timeline.filter(event => event.type === 'paycheck')).toHaveLength(count);
  });

  it('honors a delayed first payment date', () => {
    const events = buildVehicleScenarioEvents(scenario, '2026-10-31').filter(event => event.name === 'Vehicle payment');
    expect(events.map(event => event.date)).toEqual(['2026-09-15', '2026-10-15']);
  });

  it('optimizes payment dates by running five complete forecasts', () => {
    const result = adviseVehicle(finances(), scenario);
    expect(result.paymentDateAnalysis.options.map(option => option.paymentDay)).toEqual([1, 10, 15, 22, 'last']);
    expect(result.paymentDateAnalysis.options).toContainEqual(expect.objectContaining({ paymentDay: result.recommendedPaymentDate }));
  });

  it('converts an additional down payment into both cash and lower recurring loan events', () => {
    const current = adviseVehicle(finances(), scenario);
    const higher = adviseVehicle(finances(), { ...scenario, downPayment: 8_000 });
    expect(higher.loan.cashAtPurchase).toBeGreaterThan(current.loan.cashAtPurchase);
    expect(higher.loan.recurringPayment).toBeLessThan(current.loan.recurringPayment);
    expect(higher.scenarioForecast.timeline.some(event => event.id === 'vehicle-down-payment')).toBe(true);
  });

  it('simulates waiting for the next paycheck as a separate purchase timeline', () => {
    const result = adviseVehicle(finances({ currentCheckingBalance: 2_500, protectedCheckingCushion: 1_500 }), { ...scenario, purchaseDate: '2026-07-02', firstPaymentDate: '2026-08-02' });
    const nextPaycheck = result.waitAnalysis.options.find(option => option.label === 'Next paycheck');
    expect(nextPaycheck?.purchaseDate).toBe('2026-07-03');
    expect(nextPaycheck?.analysis).toEqual(expect.objectContaining({ lowestBalance: expect.any(Number), chart: expect.any(Array) }));
  });

  it('discloses expected paycheck assumptions', () => {
    const result = adviseVehicle(finances({
      firstPaycheckDate: '2026-07-03',
      reconciliation: { asOfDate: '2026-07-04', paycheckEvents: [{ id: 'pay', expectedDate: '2026-07-03', expectedAmount: 1_500, status: 'expected' }] },
    }), scenario);
    expect(result.confidence.unconfirmedPastEvents).toBe(1);
    expect(result.scenarioForecast.reconciliation.disclosures.join(' ')).toContain('has not been confirmed');
  });

  it('uses a reconciled checking balance in every vehicle forecast', () => {
    const result = adviseVehicle(finances({
      currentCheckingBalance: 8_000,
      reconciliation: { asOfDate: '2026-07-01', latestBalance: { id: 'balance', calculatedBalance: 8_000, confirmedBalance: 6_500, variance: -1_500, confirmedAt: '2026-07-01T12:00:00Z' } },
    }), scenario);
    expect(result.scenarioForecast.forecast.startingBalance).toBe(6_500);
    expect(result.scenario.chart[0].balance).toBe(5_000);
  });

  it('reports protected-cushion breaches from the day-by-day timeline', () => {
    const result = adviseVehicle(finances({ currentCheckingBalance: 2_000, protectedCheckingCushion: 1_500, bills: [] }), { ...scenario, purchaseDate: '2026-07-02', downPayment: 1_000 });
    expect(result.scenario.daysBelowCushion).toBeGreaterThan(0);
    expect(result.scenario.belowCushionDates[0]).toBe('2026-07-02');
    expect(result.explanation).toContain('protected-cushion breach');
  });

  it('reports bills, debt payments, and goals interrupted by the scenario', () => {
    const result = adviseVehicle(finances({ currentCheckingBalance: 100, payPerCheck: 0, protectedCheckingCushion: 0 }), { ...scenario, purchaseDate: '2026-07-01', downPayment: 0 });
    expect(result.scenario.billsProtected).toBe(false);
    expect(result.scenario.debtStrategyPreserved).toBe(false);
    expect(result.scenario.goalsPreserved).toBe(false);
  });

  it('does not mutate saved financial or vehicle inputs', () => {
    const financialInput = finances(), vehicleInput = structuredClone(scenario);
    const financialCopy = structuredClone(financialInput);
    adviseVehicle(financialInput, vehicleInput);
    expect(financialInput).toEqual(financialCopy);
    expect(vehicleInput).toEqual(scenario);
  });
});
