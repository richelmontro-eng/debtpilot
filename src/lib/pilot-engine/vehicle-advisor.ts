import { analyzePilotTimeline, compareTimelineStrength, isTimelineProtected, type PilotTimelineAnalysis } from './analysis';
import { createRecurringTimelineEvents, type PilotSourceEvent } from './events';
import type { PilotReconciliationContext } from './reconciliation';
import { PilotEngine } from './simulator';
import type { PilotEngineInput, PilotEngineResult } from './types';
import { monthlyLoanPayment, type VehicleScenario } from '../vehicle';

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type VehiclePaymentDay = 1 | 10 | 15 | 22 | 'last';
type CalendarDay = number | 'last';
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

export type VehiclePurchaseScenario = VehicleScenario & {
  purchaseDate: string;
  firstPaymentDate: string;
  preferredPaymentDay?: VehiclePaymentDay;
  registrationAnnual: number;
};

export type VehicleRecommendation = 'Buy Now' | 'Wait Until Next Paycheck' | 'Increase Down Payment' | 'Reduce Vehicle Budget' | 'Move Payment Date' | 'Delay Purchase';

export type VehicleAdvisorResult = {
  baseline: PilotTimelineAnalysis;
  scenario: PilotTimelineAnalysis;
  baselineForecast: PilotEngineResult;
  scenarioForecast: PilotEngineResult;
  recommendation: VehicleRecommendation;
  explanation: string;
  loan: { amountFinanced: number; recurringPayment: number; cashAtPurchase: number; totalInterest: number };
  recommendedPurchaseDate: string;
  recommendedPaymentDate: VehiclePaymentDay;
  recommendedDownPayment: number;
  recommendedVehicleBudget: number;
  paymentDateAnalysis: {
    bestPaymentDate: VehiclePaymentDay;
    reason: string;
    protectedCushionImpact: number;
    options: { paymentDay: VehiclePaymentDay; analysis: PilotTimelineAnalysis }[];
  };
  downPaymentAnalysis: {
    current: number;
    recommended: number;
    difference: number;
    preventsNegativeBalance: boolean;
    protectsCushion: boolean;
    preservesDebtStrategy: boolean;
    preservesGoals: boolean;
  };
  waitAnalysis: {
    options: { label: string; purchaseDate: string; endingBalanceChange: number; analysis: PilotTimelineAnalysis }[];
    strongestLabel: string;
    reason: string;
  };
  confidence: PilotEngineResult['forecastConfidence'];
  assumptions: string[];
  calculation: string;
};

const DAY = 86_400_000;
const round = (value: number) => Math.round(value * 100) / 100;
const parse = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const iso = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => iso(new Date(parse(value).getTime() + days * DAY));
const daysBetween = (later: string, earlier: string) => Math.round((parse(later).getTime() - parse(earlier).getTime()) / DAY);

function lastDay(year: number, month: number) { return new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); }
function dateForMonth(year: number, month: number, day: CalendarDay) {
  const actualDay = day === 'last' ? lastDay(year, month) : Math.min(day, lastDay(year, month));
  return new Date(Date.UTC(year, month, actualDay));
}

function monthlyDates(firstDate: string, endDate: string, preferredDay?: CalendarDay) {
  const first = parse(firstDate), end = parse(endDate);
  const day = preferredDay ?? Math.min(first.getUTCDate(), 28);
  let cursor = dateForMonth(first.getUTCFullYear(), first.getUTCMonth(), day);
  if (cursor < first) cursor = dateForMonth(first.getUTCFullYear(), first.getUTCMonth() + 1, day);
  const dates: string[] = [];
  while (cursor <= end) {
    dates.push(iso(cursor));
    cursor = dateForMonth(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, day);
  }
  return dates;
}

function recurringObligation(item: { id: string; name: string; amount: number; dueDay: number }, startDate: string, endDate: string, months = 1): PilotSourceEvent[] {
  const dates = monthlyDates(startDate, endDate, Math.min(28, Math.max(1, item.dueDay)));
  return dates.filter((_, index) => index % months === 0).map((date, index) => ({ id: `${item.id}-${index + 1}`, name: item.name, amount: -Math.max(0, item.amount), date, required: true, metadata: { sourceId: item.id } }));
}

function buildBaselineInput(finances: VehicleAdvisorFinances, endDate: string): PilotEngineInput {
  const paychecks = createRecurringTimelineEvents({ idPrefix: 'vehicle-paycheck', name: 'Paycheck', amount: Math.max(0, finances.payPerCheck), firstDate: finances.firstPaycheckDate, endDate, cadence: finances.payFrequency });
  const living = paychecks.map((paycheck, index) => ({ id: `living-reserve-${index + 1}`, name: 'Living reserve', amount: -Math.max(0, finances.livingReservePerCheck), date: paycheck.date, required: true, sequence: 10 }));
  const bills = finances.bills.flatMap(item => item.frequency === 'weekly'
    ? createRecurringTimelineEvents({ idPrefix: `bill-${item.id}`, name: item.name, amount: -Math.max(0, item.amount), firstDate: finances.startDate, endDate, cadence: 'weekly', required: true }).map(event => ({ ...event, metadata: { sourceId: item.id } }))
    : recurringObligation({ ...item, id: `bill-${item.id}` }, finances.startDate, endDate, item.frequency === 'quarterly' ? 3 : item.frequency === 'annual' ? 12 : 1));
  const debtPayments = finances.debtPayments.flatMap(item => recurringObligation({ ...item, id: `debt-${item.id}` }, finances.startDate, endDate));
  const goals = finances.plannedGoalContributions.flatMap(item => createRecurringTimelineEvents({ idPrefix: `goal-${item.id}`, name: item.name, amount: -Math.max(0, item.amount), firstDate: item.firstDate, endDate, cadence: item.cadence ?? 'monthly', required: true }).map(event => ({ ...event, metadata: { sourceId: item.id } })));
  const existingVehicle = finances.existingVehicleMonthly > 0 ? recurringObligation({ id: 'existing-vehicle', name: 'Existing vehicle obligation', amount: finances.existingVehicleMonthly, dueDay: 1 }, finances.startDate, endDate) : [];
  return { startDate: finances.startDate, endDate, currentCheckingBalance: finances.currentCheckingBalance, protectedCheckingCushion: finances.protectedCheckingCushion, paychecks, bills, debtPayments, goalContributions: goals, scheduledTransactions: [...living, ...existingVehicle], reconciliation: finances.reconciliation };
}

function financing(scenario: VehiclePurchaseScenario) {
  const salesTax = Math.max(0, scenario.price - scenario.tradeIn) * Math.max(0, scenario.taxRate) / 100;
  const amountFinanced = Math.max(0, scenario.price + salesTax - scenario.downPayment - scenario.tradeIn);
  const recurringPayment = monthlyLoanPayment(amountFinanced, scenario.apr, scenario.termMonths);
  return {
    amountFinanced,
    recurringPayment,
    cashAtPurchase: Math.max(0, scenario.downPayment + scenario.fees + scenario.registrationAnnual),
    totalInterest: Math.max(0, recurringPayment * scenario.termMonths - amountFinanced),
  };
}

export function buildVehicleScenarioEvents(scenario: VehiclePurchaseScenario, endDate: string): PilotSourceEvent[] {
  const loan = financing(scenario);
  const events: PilotSourceEvent[] = [
    { id: 'vehicle-down-payment', name: 'Vehicle down payment', amount: -Math.max(0, scenario.downPayment), date: scenario.purchaseDate, scenarioId: 'vehicle-advisor' },
    { id: 'vehicle-fees', name: 'Vehicle fees', amount: -Math.max(0, scenario.fees), date: scenario.purchaseDate, scenarioId: 'vehicle-advisor' },
    { id: 'vehicle-registration-1', name: 'Vehicle registration', amount: -Math.max(0, scenario.registrationAnnual), date: scenario.purchaseDate, scenarioId: 'vehicle-advisor' },
  ];
  const monthly = [
    ['payment', 'Vehicle payment', loan.recurringPayment],
    ['insurance', 'Vehicle insurance', scenario.insuranceMonthly],
    ['fuel', 'Vehicle fuel', scenario.fuelMonthly],
    ['maintenance', 'Vehicle maintenance reserve', scenario.maintenanceMonthly],
  ] as const;
  for (const [id, name, amount] of monthly) {
    for (const [index, eventDate] of monthlyDates(scenario.firstPaymentDate, endDate, scenario.preferredPaymentDay).entries()) {
      events.push({ id: `vehicle-${id}-${index + 1}`, name, amount: -Math.max(0, amount), date: eventDate, scenarioId: 'vehicle-advisor' });
    }
  }
  const annualDate = parse(scenario.purchaseDate);
  annualDate.setUTCFullYear(annualDate.getUTCFullYear() + 1);
  let annualIndex = 2;
  while (annualDate <= parse(endDate)) {
    events.push({ id: `vehicle-registration-${annualIndex++}`, name: 'Vehicle registration', amount: -Math.max(0, scenario.registrationAnnual), date: iso(annualDate), scenarioId: 'vehicle-advisor' });
    annualDate.setUTCFullYear(annualDate.getUTCFullYear() + 1);
  }
  return events;
}

function runVehicleForecast(baselineInput: PilotEngineInput, scenario: VehiclePurchaseScenario) {
  const input: PilotEngineInput = { ...baselineInput, scenarioTransactions: buildVehicleScenarioEvents(scenario, baselineInput.endDate) };
  const forecast = PilotEngine.simulate(input);
  return { forecast, analysis: analyzePilotTimeline(forecast, input) };
}

function shiftPurchase(scenario: VehiclePurchaseScenario, purchaseDate: string): VehiclePurchaseScenario {
  const shift = daysBetween(purchaseDate, scenario.purchaseDate);
  return { ...scenario, purchaseDate, firstPaymentDate: addDays(scenario.firstPaymentDate, shift) };
}

function strongest<T extends { analysis: PilotTimelineAnalysis }>(options: T[]) {
  return [...options].sort((left, right) => compareTimelineStrength(left.analysis, right.analysis))[0];
}

function money(value: number) { return Math.abs(Math.round(value)).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); }
function friendlyDate(value: string) { return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }); }

export function adviseVehicle(finances: VehicleAdvisorFinances, vehicle: VehiclePurchaseScenario): VehicleAdvisorResult {
  const horizon = Math.max(90, finances.horizonDays ?? 90);
  const endDate = addDays(finances.startDate, horizon);
  const baselineInput = buildBaselineInput(finances, endDate);
  const baselineForecast = PilotEngine.simulate(baselineInput);
  const baseline = analyzePilotTimeline(baselineForecast, baselineInput);
  const current = runVehicleForecast(baselineInput, vehicle);
  const paymentDays: VehiclePaymentDay[] = [1, 10, 15, 22, 'last'];
  const paymentOptions = paymentDays.map(paymentDay => ({ paymentDay, ...runVehicleForecast(baselineInput, { ...vehicle, preferredPaymentDay: paymentDay }) }));
  const bestPayment = strongest(paymentOptions);
  const paycheckDates = baselineForecast.timeline.filter(event => event.type === 'paycheck' && event.date.slice(0, 10) >= vehicle.purchaseDate).map(event => event.date.slice(0, 10));
  const purchaseCandidates = [
    { label: 'Today', purchaseDate: vehicle.purchaseDate },
    ...(paycheckDates[0] ? [{ label: 'Next paycheck', purchaseDate: paycheckDates[0] }] : []),
    ...(paycheckDates[1] ? [{ label: 'Following paycheck', purchaseDate: paycheckDates[1] }] : []),
    { label: '30 days', purchaseDate: addDays(vehicle.purchaseDate, 30) },
    { label: '60 days', purchaseDate: addDays(vehicle.purchaseDate, 60) },
  ].filter((candidate, index, all) => all.findIndex(item => item.purchaseDate === candidate.purchaseDate) === index);
  const waitOptions = purchaseCandidates.map(candidate => {
    const result = runVehicleForecast(baselineInput, shiftPurchase(vehicle, candidate.purchaseDate));
    return { ...candidate, endingBalanceChange: round(result.analysis.projectedEndingBalance - current.analysis.projectedEndingBalance), analysis: result.analysis };
  });
  const bestWait = strongest(waitOptions);

  const downCandidates = Array.from({ length: Math.floor(Math.max(0, vehicle.price) / 500) + 1 }, (_, index) => index * 500);
  if (!downCandidates.includes(vehicle.downPayment)) downCandidates.push(vehicle.downPayment);
  const downResults = downCandidates.sort((a, b) => a - b).map(downPayment => ({ downPayment, ...runVehicleForecast(baselineInput, { ...vehicle, downPayment }) }));
  const protectedDown = downResults.find(result => isTimelineProtected(result.analysis));
  const recommendedDownPayment = protectedDown?.downPayment ?? vehicle.downPayment;
  const recommendedDownResult = downResults.find(result => result.downPayment === recommendedDownPayment) ?? current;

  const priceCandidates = Array.from({ length: 20 }, (_, index) => round(vehicle.price * (1 - index * 0.05))).filter(price => price >= 0);
  const priceResults = priceCandidates.map(price => ({ price, ...runVehicleForecast(baselineInput, { ...vehicle, price }) }));
  const protectedBudget = priceResults.find(result => isTimelineProtected(result.analysis));
  const recommendedVehicleBudget = protectedBudget?.price ?? priceResults.at(-1)?.price ?? vehicle.price;

  let recommendation: VehicleRecommendation;
  if (isTimelineProtected(current.analysis)) recommendation = 'Buy Now';
  else if (isTimelineProtected(bestPayment.analysis)) recommendation = 'Move Payment Date';
  else if (bestWait.label === 'Next paycheck' && isTimelineProtected(bestWait.analysis)) recommendation = 'Wait Until Next Paycheck';
  else if (recommendedDownPayment > vehicle.downPayment && isTimelineProtected(recommendedDownResult.analysis)) recommendation = 'Increase Down Payment';
  else if (recommendedVehicleBudget < vehicle.price && protectedBudget) recommendation = 'Reduce Vehicle Budget';
  else recommendation = 'Delay Purchase';

  const firstBreach = current.analysis.belowCushionDates[0];
  const recovery = current.forecast.forecast.recoveryDate;
  const explanation = isTimelineProtected(current.analysis)
    ? `Buying on ${friendlyDate(vehicle.purchaseDate)} keeps every modeled obligation funded and checking above the protected cushion.`
    : firstBreach
      ? `Buying on ${friendlyDate(vehicle.purchaseDate)} causes a ${current.analysis.daysBelowCushion}-day protected-cushion breach beginning ${friendlyDate(firstBreach)}${recovery ? ` before recovery on ${friendlyDate(recovery)}` : ' without recovery during this forecast'}. ${bestWait.purchaseDate !== vehicle.purchaseDate ? `The strongest tested purchase date is ${friendlyDate(bestWait.purchaseDate)}.` : ''}`
      : `The proposed schedule interrupts ${current.analysis.billsAtRisk.length + current.analysis.debtStrategyInterruptions.length + current.analysis.goalDelays.length} modeled obligation${current.analysis.billsAtRisk.length + current.analysis.debtStrategyInterruptions.length + current.analysis.goalDelays.length === 1 ? '' : 's'}.`;
  const loan = financing(vehicle);

  return {
    baseline,
    scenario: current.analysis,
    baselineForecast,
    scenarioForecast: current.forecast,
    recommendation,
    explanation,
    loan: { amountFinanced: round(loan.amountFinanced), recurringPayment: round(loan.recurringPayment), cashAtPurchase: round(loan.cashAtPurchase), totalInterest: round(loan.totalInterest) },
    recommendedPurchaseDate: bestWait.purchaseDate,
    recommendedPaymentDate: bestPayment.paymentDay,
    recommendedDownPayment: round(recommendedDownPayment),
    recommendedVehicleBudget: round(recommendedVehicleBudget),
    paymentDateAnalysis: {
      bestPaymentDate: bestPayment.paymentDay,
      reason: `The ${bestPayment.paymentDay === 'last' ? 'last day of the month' : `${bestPayment.paymentDay}${bestPayment.paymentDay === 1 ? 'st' : bestPayment.paymentDay === 22 ? 'nd' : 'th'}`} produced the strongest tested timeline, with a lowest projected balance of ${money(bestPayment.analysis.lowestBalance)}.`,
      protectedCushionImpact: round(bestPayment.analysis.lowestBalance - current.analysis.lowestBalance),
      options: paymentOptions.map(option => ({ paymentDay: option.paymentDay, analysis: option.analysis })),
    },
    downPaymentAnalysis: {
      current: round(vehicle.downPayment),
      recommended: round(recommendedDownPayment),
      difference: round(recommendedDownPayment - vehicle.downPayment),
      preventsNegativeBalance: recommendedDownResult.analysis.negativeBalanceDates.length === 0,
      protectsCushion: recommendedDownResult.analysis.protectedCushionMaintained,
      preservesDebtStrategy: recommendedDownResult.analysis.debtStrategyPreserved,
      preservesGoals: recommendedDownResult.analysis.goalsPreserved,
    },
    waitAnalysis: {
      options: waitOptions,
      strongestLabel: bestWait.label,
      reason: bestWait.purchaseDate === vehicle.purchaseDate
        ? 'Buying on the entered date produced the strongest tested timeline.'
        : `Waiting until ${friendlyDate(bestWait.purchaseDate)} changes the projected ending balance by ${bestWait.endingBalanceChange >= 0 ? '+' : '-'}${money(bestWait.endingBalanceChange)} and produces the strongest tested cash-flow timeline.`,
    },
    confidence: current.forecast.forecastConfidence,
    assumptions: ['Every expected paycheck in the forecast uses its dated Pilot Engine status.', 'Bills, debt payments, goals, and vehicle costs are evaluated in chronological order.', 'Sales tax is financed; down payment, fees, and initial registration are checking-account events.', 'Insurance, fuel, maintenance, and loan payments begin on the entered first-payment schedule.', 'Optimization compares the 1st, 10th, 15th, 22nd, and last day of each month.'],
    calculation: 'DebtPilot creates temporary dated vehicle events, runs an ordinary Pilot Engine forecast, and compares the resulting timelines. Recommendations come from negative dates, protected-cushion days, obligations at risk, lowest balance, and ending balance. No monthly-income ratio or normalized monthly affordability calculation is used.',
  };
}
