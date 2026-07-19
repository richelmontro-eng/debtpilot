import { createRecurringTimelineEvents, type PilotSourceEvent } from './events';
import { PilotEngine } from './simulator';
import type { PilotEngineInput, PilotEngineResult } from './types';
import type { PilotReconciliationContext } from './reconciliation';
import { maximumPrincipalForPayment, monthlyLoanPayment, type VehicleScenario } from '../vehicle';

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type DatedBill = { id: string; name: string; amount: number; dueDay: number; frequency: 'weekly' | 'monthly' | 'quarterly' | 'annual' };
export type DatedDebtPayment = { id: string; name: string; amount: number; dueDay: number };
export type PlannedGoalContribution = { id: string; name: string; amount: number; firstDate: string; cadence?: PayFrequency };

export type VehicleAdvisorFinances = {
  startDate: string;
  horizonDays?: number;
  currentCheckingBalance: number;
  protectedCheckingCushion: number;
  payPerCheck: number;
  payFrequency: PayFrequency;
  firstPaycheckDate: string;
  livingReservePerCheck: number;
  bills: readonly DatedBill[];
  debtPayments: readonly DatedDebtPayment[];
  plannedGoalContributions: readonly PlannedGoalContribution[];
  existingVehicleMonthly: number;
  reconciliation?: PilotReconciliationContext;
};

export type VehiclePurchaseScenario = VehicleScenario & { purchaseDate: string };
export type ForecastSnapshot = {
  lowestBalance: number;
  belowCushionDates: string[];
  negativeBalanceDates: string[];
  recoveryDate: string | null;
  balances: { day30: number; day60: number; day90: number };
  underfundedBills: { id: string; name: string; date: string }[];
  health: number;
};

export type VehicleAdvisorResult = {
  baseline: ForecastSnapshot;
  scenario: ForecastSnapshot;
  baselineForecast: PilotEngineResult;
  scenarioForecast: PilotEngineResult;
  coach: {
    rating: 'Strong fit' | 'Affordable with caution' | 'Wait' | 'Reconsider';
    explanation: string;
  };
  realityCheck: {
    affordablePriceLow: number;
    affordablePriceHigh: number;
    maximumSafeMonthlyPayment: number;
    additionalDownPaymentNeeded: number;
    lowerPriceAlternative: number;
    estimatedWaitMonths: number | null;
  };
  loan: { amountFinanced: number; monthlyPayment: number; monthlyOwnershipCost: number; cashAtPurchase: number; totalInterest: number };
  assumptions: string[];
  confidence: { score: number; level: 'high' | 'medium' | 'low' };
  calculation: string;
};

const DAY = 86_400_000;
const round = (value: number) => Math.round(value * 100) / 100;
const date = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => iso(new Date(date(value).getTime() + days * DAY));

function nextMonthlyDate(startDate: string, dueDay: number) {
  const start = date(startDate);
  const candidate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), Math.min(28, Math.max(1, dueDay))));
  if (candidate < start) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  return iso(candidate);
}

function recurringObligation(item: { id: string; name: string; amount: number; dueDay: number }, startDate: string, endDate: string, months = 1): PilotSourceEvent[] {
  const cursor = date(nextMonthlyDate(startDate, item.dueDay));
  const end = date(endDate);
  const events: PilotSourceEvent[] = [];
  let index = 0;
  while (cursor <= end) {
    events.push({ id: `${item.id}-${++index}`, name: item.name, amount: -Math.max(0, item.amount), date: iso(cursor), required: true, metadata: { sourceId: item.id } });
    cursor.setUTCMonth(cursor.getUTCMonth() + months);
  }
  return events;
}

function buildBaselineInput(finances: VehicleAdvisorFinances, endDate: string): PilotEngineInput {
  const paychecks = createRecurringTimelineEvents({ idPrefix: 'vehicle-paycheck', name: 'Paycheck', amount: Math.max(0, finances.payPerCheck), firstDate: finances.firstPaycheckDate, endDate, cadence: finances.payFrequency });
  const living = paychecks.map((paycheck, index) => ({ id: `living-reserve-${index + 1}`, name: 'Living reserve', amount: -Math.max(0, finances.livingReservePerCheck), date: paycheck.date, required: true, sequence: 10 }));
  const bills = finances.bills.flatMap(item => item.frequency === 'weekly'
    ? createRecurringTimelineEvents({ idPrefix: `bill-${item.id}`, name: item.name, amount: -Math.max(0, item.amount), firstDate: finances.startDate, endDate, cadence: 'weekly', required: true }).map(event => ({ ...event, metadata: { sourceId: item.id } }))
    : recurringObligation({ ...item, id: `bill-${item.id}` }, finances.startDate, endDate, item.frequency === 'quarterly' ? 3 : item.frequency === 'annual' ? 12 : 1));
  const debtPayments = finances.debtPayments.flatMap(item => recurringObligation({ ...item, id: `debt-${item.id}` }, finances.startDate, endDate));
  const goals = finances.plannedGoalContributions.flatMap(item => createRecurringTimelineEvents({ idPrefix: `goal-${item.id}`, name: item.name, amount: -Math.max(0, item.amount), firstDate: item.firstDate, endDate, cadence: item.cadence ?? 'monthly' }));
  const existingVehicle = finances.existingVehicleMonthly > 0
    ? recurringObligation({ id: 'existing-vehicle', name: 'Existing vehicle obligation', amount: finances.existingVehicleMonthly, dueDay: 1 }, finances.startDate, endDate)
    : [];
  return { startDate: finances.startDate, endDate, currentCheckingBalance: finances.currentCheckingBalance, protectedCheckingCushion: finances.protectedCheckingCushion, paychecks, bills, debtPayments, goalContributions: goals, scheduledTransactions: [...living, ...existingVehicle], reconciliation: finances.reconciliation };
}

function loanDetails(scenario: VehiclePurchaseScenario) {
  const tax = Math.max(0, scenario.price - scenario.tradeIn) * Math.max(0, scenario.taxRate) / 100;
  const amountFinanced = Math.max(0, scenario.price + tax - scenario.downPayment - scenario.tradeIn);
  const monthlyPayment = monthlyLoanPayment(amountFinanced, scenario.apr, scenario.termMonths);
  const operating = Math.max(0, scenario.insuranceMonthly) + Math.max(0, scenario.fuelMonthly) + Math.max(0, scenario.maintenanceMonthly);
  return { amountFinanced, monthlyPayment, monthlyOwnershipCost: monthlyPayment + operating, cashAtPurchase: Math.max(0, scenario.downPayment + scenario.fees), totalInterest: Math.max(0, monthlyPayment * scenario.termMonths - amountFinanced) };
}

function scenarioEvents(scenario: VehiclePurchaseScenario, endDate: string): PilotSourceEvent[] {
  const loan = loanDetails(scenario);
  const firstMonthly = addDays(scenario.purchaseDate, 30);
  const recurring = [
    ['loan', 'Vehicle loan payment', loan.monthlyPayment],
    ['insurance', 'Vehicle insurance', scenario.insuranceMonthly],
    ['fuel', 'Vehicle fuel', scenario.fuelMonthly],
    ['maintenance', 'Vehicle maintenance', scenario.maintenanceMonthly],
  ] as const;
  const events: PilotSourceEvent[] = [
    { id: 'vehicle-down-payment', name: 'Vehicle down payment', amount: -Math.max(0, scenario.downPayment), date: scenario.purchaseDate, scenarioId: 'vehicle-advisor' },
    { id: 'vehicle-fees', name: 'Vehicle taxes and fees paid at purchase', amount: -Math.max(0, scenario.fees), date: scenario.purchaseDate, scenarioId: 'vehicle-advisor' },
  ];
  for (const [id, name, amount] of recurring) {
    events.push(...createRecurringTimelineEvents({ idPrefix: `vehicle-${id}`, name, amount: -Math.max(0, amount), firstDate: firstMonthly, endDate, cadence: 'monthly' }).map(event => ({ ...event, scenarioId: 'vehicle-advisor' })));
  }
  return events;
}

function balanceOn(result: PilotEngineResult, startingBalance: number, target: string) {
  return result.timeline.filter(event => event.date.slice(0, 10) <= target).at(-1)?.projectedBalance ?? startingBalance;
}

function snapshot(result: PilotEngineResult, input: PilotEngineInput, finances: VehicleAdvisorFinances): ForecastSnapshot {
  const balances = new Map<string, number>();
  let current = input.currentCheckingBalance;
  let index = 0;
  for (let cursor = date(input.startDate); cursor <= date(input.endDate); cursor = new Date(cursor.getTime() + DAY)) {
    const day = iso(cursor);
    while (index < result.timeline.length && result.timeline[index].date.slice(0, 10) === day) current = result.timeline[index++].projectedBalance;
    balances.set(day, current);
  }
  const belowCushionDates = [...balances].filter(([, value]) => value < finances.protectedCheckingCushion).map(([day]) => day);
  const negativeBalanceDates = [...balances].filter(([, value]) => value < 0).map(([day]) => day);
  const underfundedBills = result.timeline.filter(event => event.type === 'bill' && event.obligationAtRisk).map(event => ({ id: String(event.metadata?.sourceId ?? event.id), name: event.name, date: event.date.slice(0, 10) }));
  const health = Math.max(0, Math.round(100 - Math.min(55, negativeBalanceDates.length * 5) - Math.min(30, belowCushionDates.length * 2) - underfundedBills.length * 10));
  return {
    lowestBalance: round(result.forecast.lowestBalance), belowCushionDates, negativeBalanceDates,
    recoveryDate: result.forecast.recoveryDate, underfundedBills, health,
    balances: {
      day30: round(balanceOn(result, input.currentCheckingBalance, addDays(input.startDate, 30))),
      day60: round(balanceOn(result, input.currentCheckingBalance, addDays(input.startDate, 60))),
      day90: round(balanceOn(result, input.currentCheckingBalance, addDays(input.startDate, 90))),
    },
  };
}

function isSafe(result: PilotEngineResult, cushion: number) {
  return result.forecast.lowestBalance >= cushion && result.forecast.requiredObligationsAtRisk === 0;
}

function money(value: number) { return Math.abs(Math.round(value)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); }
function friendlyDate(value: string) { return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }); }

export function adviseVehicle(finances: VehicleAdvisorFinances, vehicle: VehiclePurchaseScenario): VehicleAdvisorResult {
  const horizon = Math.max(90, finances.horizonDays ?? 90);
  const endDate = addDays(finances.startDate, horizon);
  const baselineInput = buildBaselineInput(finances, endDate);
  const baselineForecast = PilotEngine.simulate(baselineInput);
  const vehicleEvents = scenarioEvents(vehicle, endDate);
  const scenarioInput = { ...baselineInput, scenarioTransactions: vehicleEvents };
  const scenarioForecast = PilotEngine.simulate(scenarioInput);
  const baseline = snapshot(baselineForecast, baselineInput, finances);
  const scenario = snapshot(scenarioForecast, scenarioInput, finances);
  const loan = loanDetails(vehicle);

  let rating: VehicleAdvisorResult['coach']['rating'];
  if (scenario.negativeBalanceDates.length && (!scenario.recoveryDate || scenario.underfundedBills.length)) rating = 'Reconsider';
  else if (scenario.negativeBalanceDates.length || (scenario.belowCushionDates.length && !scenario.recoveryDate)) rating = 'Wait';
  else if (scenario.belowCushionDates.length) rating = 'Affordable with caution';
  else rating = 'Strong fit';
  const firstDip = scenario.belowCushionDates[0];
  const shortfall = Math.max(0, finances.protectedCheckingCushion - scenario.lowestBalance);
  const explanation = firstDip
    ? `This vehicle would push projected checking ${money(shortfall)} below your protected cushion on ${friendlyDate(firstDip)}${scenario.recoveryDate ? `, and it recovers on ${friendlyDate(scenario.recoveryDate)}` : ', without recovering during the forecast'}.`
    : `Projected checking stays above your protected cushion, with a lowest projected balance of ${money(scenario.lowestBalance)}.`;

  const operating = Math.max(0, vehicle.insuranceMonthly) + Math.max(0, vehicle.fuelMonthly) + Math.max(0, vehicle.maintenanceMonthly);
  let low = 0;
  let high = Math.max(10_000, loan.monthlyPayment * 2 + 2_000);
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const candidate = (low + high) / 2;
    const candidateEvents = scenarioEvents({ ...vehicle, price: 0, downPayment: vehicle.downPayment, tradeIn: 0, fees: vehicle.fees, insuranceMonthly: 0, fuelMonthly: 0, maintenanceMonthly: 0 }, endDate)
      .filter(event => !event.id.startsWith('vehicle-loan'));
    candidateEvents.push(...createRecurringTimelineEvents({ idPrefix: 'safe-payment', name: 'Maximum safe vehicle payment', amount: -Math.max(0, candidate + operating), firstDate: addDays(vehicle.purchaseDate, 30), endDate, cadence: 'monthly' }).map(event => ({ ...event, scenarioId: 'vehicle-advisor' })));
    const candidateResult = PilotEngine.simulate({ ...baselineInput, scenarioTransactions: candidateEvents });
    if (isSafe(candidateResult, finances.protectedCheckingCushion)) low = candidate; else high = candidate;
  }
  const maximumSafeMonthlyPayment = round(low);
  const maximumLoanAmount = maximumPrincipalForPayment(maximumSafeMonthlyPayment, vehicle.apr, vehicle.termMonths);
  const taxRate = Math.max(0, vehicle.taxRate) / 100;
  const affordablePriceHigh = Math.max(0, (maximumLoanAmount + vehicle.downPayment + vehicle.tradeIn * (1 + taxRate)) / (1 + taxRate));
  const additionalDownPaymentNeeded = Math.max(0, loan.amountFinanced - maximumLoanAmount);

  let estimatedWaitMonths: number | null = rating === 'Strong fit' ? 0 : null;
  if (estimatedWaitMonths === null) {
    for (let month = 1; month <= 24; month += 1) {
      const shifted = { ...vehicle, purchaseDate: addDays(vehicle.purchaseDate, month * 30) };
      const shiftedEnd = addDays(shifted.purchaseDate, 90);
      const shiftedBaseline = buildBaselineInput(finances, shiftedEnd);
      if (isSafe(PilotEngine.simulate({ ...shiftedBaseline, scenarioTransactions: scenarioEvents(shifted, shiftedEnd) }), finances.protectedCheckingCushion)) { estimatedWaitMonths = month; break; }
    }
  }

  return {
    baseline, scenario, baselineForecast, scenarioForecast,
    coach: { rating, explanation },
    realityCheck: {
      affordablePriceLow: round(affordablePriceHigh * 0.8), affordablePriceHigh: round(affordablePriceHigh), maximumSafeMonthlyPayment,
      additionalDownPaymentNeeded: round(additionalDownPaymentNeeded), lowerPriceAlternative: round(affordablePriceHigh * 0.9), estimatedWaitMonths,
    },
    loan: { amountFinanced: round(loan.amountFinanced), monthlyPayment: round(loan.monthlyPayment), monthlyOwnershipCost: round(loan.monthlyOwnershipCost), cashAtPurchase: round(loan.cashAtPurchase), totalInterest: round(loan.totalInterest) },
    assumptions: ['Every expected paycheck in the forecast is included using the saved pay frequency and next paycheck date.', 'Bills and debt minimums use their saved due days; weekly bills recur every seven days.', 'Living reserve is protected after every paycheck.', 'Sales tax is financed; entered fees and down payment are paid on the purchase date.', 'No future goal contribution is assumed unless a planned contribution schedule is supplied.'],
    confidence: { score: baselineForecast.confidence.score, level: baselineForecast.confidence.level },
    calculation: 'DebtPilot builds a dated baseline of paychecks, bills, minimum debt payments, living reserves, planned goal contributions, and existing vehicle costs. It adds the purchase cash and each monthly vehicle cost as temporary events, then reruns the shared Pilot Engine. The safe payment and price range are found by testing payments against the full timeline until checking stays at or above the protected cushion; no income-percentage rule is used.',
  };
}
