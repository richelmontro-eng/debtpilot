import { getPilotBriefing, type PilotBriefing, type PilotFinancialState } from './pilot';
import { simulatePayoff, type PayoffDebt } from './payoff';
import { monthlyLoanPayment } from './vehicle';

export type PurchaseMethod = 'cash' | 'finance';
export type PurchaseScenario = {
  itemName: string;
  purchasePrice: number;
  method: PurchaseMethod;
  downPayment: number;
  monthlyPayment: number;
  interestRate: number;
  loanLength: number;
  purchaseDate: string;
};

export type PurchaseFinancialState = {
  payPerCheck: number;
  periodsPerYear: number;
  checking: number;
  savings: number;
  checkingCushion: number;
  livingPerCheck: number;
  monthlyBills: number;
  strategy: 'avalanche' | 'snowball';
  debts: PayoffDebt[];
  goals: Array<{ id: string; name: string; goalType: string; targetAmount: number; currentAmount: number; priority: number }>;
};

export type PurchaseDecision = 'Proceed' | 'Wait' | 'Reconsider';
export type GoalDelay = { label: 'Vehicle' | 'Vacation' | 'House' | 'Emergency Fund'; months: number | null; status: string };

export type PurchaseReport = {
  decision: PurchaseDecision;
  confidence: number;
  expectedBenefit: string;
  timeHorizon: string;
  why: string[];
  benefits: string[];
  risks: string[];
  nextBestAlternative: string;
  monthlyPayment: number;
  cashDue: number;
  monthlySurplusBefore: number;
  monthlySurplusAfter: number;
  checkingBefore: number;
  checkingAfter: number;
  emergencyBefore: number;
  emergencyAfter: number;
  healthBefore: number;
  healthAfter: number;
  debtFreeBefore: string | null;
  debtFreeAfter: string | null;
  goalDelays: GoalDelay[];
  pilotBefore: PilotBriefing;
  pilotAfter: PilotBriefing;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function finite(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function pilotState(finances: PurchaseFinancialState, checking: number, debts: PayoffDebt[]): PilotFinancialState {
  const monthlyIncome = finite(finances.payPerCheck) * finances.periodsPerYear / 12;
  const monthlyMinimums = debts.reduce((sum, debt) => sum + finite(debt.minimum), 0);
  const billsPerCheck = finite(finances.monthlyBills) * 12 / finances.periodsPerYear;
  const minimumsPerCheck = monthlyMinimums * 12 / finances.periodsPerYear;
  const availableBeforeCushion = Math.max(0, finances.payPerCheck - finances.livingPerCheck - billsPerCheck - minimumsPerCheck);
  const cushionGap = Math.max(0, finances.checkingCushion - checking);
  return {
    availableBeforeCushion,
    cushionGap,
    safeExtra: Math.max(0, availableBeforeCushion - cushionGap),
    monthlyIncome,
    payPerCheck: finances.payPerCheck,
    monthlyMinimums,
    checking,
    checkingCushion: finances.checkingCushion,
    strategy: finances.strategy,
    debts: debts.map(debt => ({ id: debt.id, name: debt.name, balance: debt.balance, apr: debt.apr })),
    goals: finances.goals,
    billsDueSoon: [],
  };
}

function goalDelay(label: GoalDelay['label'], goals: PurchaseFinancialState['goals'], monthlyBefore: number, monthlyAfter: number, recoveryMonths: number): GoalDelay {
  const patterns: Record<GoalDelay['label'], RegExp> = {
    Vehicle: /vehicle|car/i,
    Vacation: /vacation|travel/i,
    House: /house|home|down.?payment/i,
    'Emergency Fund': /emergency/i,
  };
  const goal = goals.find(item => label === 'Emergency Fund' ? item.goalType === 'emergency_fund' || patterns[label].test(item.name) : patterns[label].test(item.name));
  if (!goal) return { label, months: null, status: 'No matching goal saved' };
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  if (remaining === 0) return { label, months: 0, status: 'Goal already funded' };
  if (monthlyAfter <= 0) return { label, months: null, status: 'No monthly capacity after purchase' };
  const beforeMonths = monthlyBefore > 0 ? Math.ceil(remaining / monthlyBefore) : Infinity;
  const afterMonths = Math.ceil(remaining / monthlyAfter) + recoveryMonths;
  const delay = Number.isFinite(beforeMonths) ? Math.max(0, afterMonths - beforeMonths) : 0;
  return { label, months: delay, status: delay ? `${delay} month${delay === 1 ? '' : 's'} later` : 'No projected delay' };
}

export function evaluatePurchase(scenario: PurchaseScenario, finances: PurchaseFinancialState): PurchaseReport {
  const price = finite(scenario.purchasePrice);
  const downPayment = scenario.method === 'cash' ? price : Math.min(price, finite(scenario.downPayment));
  const financed = scenario.method === 'finance' ? Math.max(0, price - downPayment) : 0;
  const calculatedPayment = financed > 0 ? monthlyLoanPayment(financed, finite(scenario.interestRate), Math.max(1, Math.round(finite(scenario.loanLength)))) : 0;
  const payment = scenario.method === 'finance' ? finite(scenario.monthlyPayment) || calculatedPayment : 0;
  const checkingAfter = finances.checking - downPayment;
  const purchaseDebt: PayoffDebt | null = financed > 0 ? { id: 'purchase', name: scenario.itemName || 'Purchase financing', balance: financed, apr: finite(scenario.interestRate), minimum: payment } : null;
  const afterDebts = purchaseDebt ? [...finances.debts, purchaseDebt] : finances.debts;
  const beforePilotState = pilotState(finances, finances.checking, finances.debts);
  const afterPilotState = pilotState(finances, checkingAfter, afterDebts);
  const pilotBefore = getPilotBriefing(beforePilotState);
  const pilotAfter = getPilotBriefing(afterPilotState);
  const monthlyIncome = finances.payPerCheck * finances.periodsPerYear / 12;
  const monthlyLiving = finances.livingPerCheck * finances.periodsPerYear / 12;
  const existingMinimums = finances.debts.reduce((sum, debt) => sum + finite(debt.minimum), 0);
  const monthlySurplusBefore = monthlyIncome - finances.monthlyBills - monthlyLiving - existingMinimums;
  const monthlySurplusAfter = monthlySurplusBefore - payment;
  const baselinePayoff = simulatePayoff(finances.debts, Math.max(0, monthlySurplusBefore), finances.strategy);
  const scenarioPayoff = simulatePayoff(afterDebts, Math.max(0, monthlySurplusAfter), finances.strategy);
  const healthDrop = pilotBefore.pulse.score - pilotAfter.pulse.score;
  const cushionGap = Math.max(0, finances.checkingCushion - checkingAfter);
  const emergency = finances.goals.find(goal => goal.goalType === 'emergency_fund');
  const emergencyBefore = emergency?.currentAmount ?? finances.savings;
  const recoveryMonths = scenario.method === 'cash' && monthlySurplusBefore > 0 ? Math.ceil(downPayment / monthlySurplusBefore) : 0;

  let decision: PurchaseDecision = 'Proceed';
  if (checkingAfter < 0 || monthlySurplusAfter < 0 || healthDrop >= 15) decision = 'Reconsider';
  else if (cushionGap > 0 || healthDrop >= 7 || payment > monthlyIncome * 0.15) decision = 'Wait';

  const risks = [
    ...(cushionGap > 0 ? [`Checking would be ${money.format(cushionGap)} below the protected cushion.`] : []),
    ...(payment > 0 ? [`The purchase adds ${money.format(payment)} to monthly required payments.`] : []),
    ...(healthDrop > 0 ? [`Financial health is projected to fall ${healthDrop} point${healthDrop === 1 ? '' : 's'}.`] : []),
    ...(!scenarioPayoff.paidOff ? ['The resulting debt plan does not pay off within the projection window.'] : []),
  ];
  const benefits = [
    ...(cushionGap === 0 ? ['The protected checking cushion remains covered.'] : []),
    ...(monthlySurplusAfter >= 0 ? [`Monthly cash flow remains positive by ${money.format(monthlySurplusAfter)}.`] : []),
    ...(scenario.method === 'cash' ? ['No new monthly debt payment is created.'] : ['Financing preserves more cash at the purchase date than paying the full price in cash.']),
  ];
  const confidence = Math.max(70, Math.min(99, 92 + (finances.goals.length ? 2 : 0) + (finances.debts.length ? 2 : 0) - (price <= 0 ? 20 : 0)));
  const nextBestAlternative = decision === 'Proceed'
    ? 'Compare the final seller or lender terms with this scenario before committing.'
    : cushionGap > 0
      ? `Wait until the purchase leaves at least ${money.format(finances.checkingCushion)} in checking, or reduce the upfront cost by ${money.format(cushionGap)}.`
      : payment > 0
        ? `Lower the price, increase the down payment, or target a payment below ${money.format(Math.max(0, monthlySurplusBefore * 0.15))} per month.`
        : 'Delay the purchase and direct the same amount toward the current Pilot recommendation first.';

  return {
    decision,
    confidence,
    expectedBenefit: decision === 'Proceed' ? 'Purchase fits recorded protections' : decision === 'Wait' ? 'Waiting preserves flexibility' : 'Avoids a projected cash-flow setback',
    timeHorizon: scenario.purchaseDate ? `At purchase on ${new Date(`${scenario.purchaseDate}T00:00:00`).toLocaleDateString()}` : 'At purchase',
    why: [
      `Pilot financial health moves from ${pilotBefore.pulse.score} to ${pilotAfter.pulse.score}.`,
      `Checking moves from ${money.format(finances.checking)} to ${money.format(checkingAfter)}.`,
      `Monthly surplus moves from ${money.format(monthlySurplusBefore)} to ${money.format(monthlySurplusAfter)}.`,
      `The post-purchase Pilot action is: ${pilotAfter.recommendation.title}`,
    ],
    benefits,
    risks: risks.length ? risks : ['No material risk threshold was triggered by the saved data.'],
    nextBestAlternative,
    monthlyPayment: payment,
    cashDue: downPayment,
    monthlySurplusBefore,
    monthlySurplusAfter,
    checkingBefore: finances.checking,
    checkingAfter,
    emergencyBefore,
    emergencyAfter: emergencyBefore,
    healthBefore: pilotBefore.pulse.score,
    healthAfter: pilotAfter.pulse.score,
    debtFreeBefore: baselinePayoff.debtFreeDate,
    debtFreeAfter: scenarioPayoff.debtFreeDate,
    goalDelays: (['Vehicle', 'Vacation', 'House', 'Emergency Fund'] as const).map(label => goalDelay(label, finances.goals, Math.max(0, monthlySurplusBefore), Math.max(0, monthlySurplusAfter), recoveryMonths)),
    pilotBefore,
    pilotAfter,
  };
}
