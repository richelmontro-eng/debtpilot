import type { FinancialPulse, Recommendation } from './pilot';

export type DashboardDebt = { id: string; name: string; balance: number; apr: number; minimum: number; promotionType?: 'none' | 'zero_percent' | 'deferred_interest'; promotionalApr?: number; promotionEndDate?: string | null; postPromotionApr?: number; originalPromotionalBalance?: number; estimatedDeferredInterest?: number };
export type DashboardBill = { id: string; name: string; amount: number; dueDay: number | null; frequency: string };
export type DashboardGoal = { id: string; name: string; goalType: string; targetAmount: number; currentAmount: number; priority: number };

export type MissingInformationItem = { id: string; label: string; detail: string; href: string };
export type DeterministicInsight = { id: string; title: string; detail: string; tone: 'positive' | 'neutral' | 'warning' };

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function getBriefingSummary(input: {
  pulse: FinancialPulse;
  safeExtra: number;
  availableBeforeCushion: number;
  cushionGap: number;
  recommendation: Recommendation;
}) {
  const cashMessage = input.availableBeforeCushion <= 0
    ? 'This pay cycle has no unassigned cash after essentials.'
    : input.cushionGap > 0
      ? `${money.format(input.cushionGap)} must remain available to restore your checking cushion.`
      : `${money.format(input.safeExtra)} is safe to direct after essentials and your checking cushion.`;
  return {
    cashRisk: input.availableBeforeCushion <= 0 || input.cushionGap > 0,
    cashMessage,
    summary: `${input.pulse.label} financial health. ${cashMessage} ${input.recommendation.title}`,
  };
}

export function getMissingInformation(input: {
  payPerCheck: number;
  checkingCushion: number;
  debts: DashboardDebt[];
  bills: DashboardBill[];
  goals: DashboardGoal[];
}): MissingInformationItem[] {
  return [
    ...(input.payPerCheck <= 0 ? [{ id: 'income', label: 'Net pay per check', detail: 'Add income so Pilot can calculate a safe plan.', href: '/settings' }] : []),
    ...(input.checkingCushion <= 0 ? [{ id: 'cushion', label: 'Protected checking cushion', detail: 'Set the cash floor Pilot must protect.', href: '/settings' }] : []),
    ...(input.debts.length === 0 ? [{ id: 'debts', label: 'Debt accounts', detail: 'Add balances, APRs, and minimums to unlock payoff guidance.', href: '#debts' }] : []),
    ...(input.bills.length === 0 ? [{ id: 'bills', label: 'Recurring bills', detail: 'Add bills so the timeline can reserve upcoming obligations.', href: '#bills' }] : []),
    ...(input.bills.some(bill => !bill.dueDay || bill.dueDay < 1 || bill.dueDay > 31) ? [{ id: 'due-dates', label: 'Complete bill due dates', detail: 'Add valid due days so the timeline can place every bill correctly.', href: '#bills' }] : []),
    ...(!input.goals.some(goal => goal.goalType === 'emergency_fund') ? [{ id: 'emergency', label: 'Emergency-fund target', detail: 'Add a target so Pilot can balance resilience with payoff progress.', href: '/goals' }] : []),
    ...(input.goals.length === 0 ? [{ id: 'goals', label: 'Financial goals', detail: 'Add goals so safe extra cash follows your priorities.', href: '/goals' }] : []),
  ];
}

export function getDeterministicInsights(input: {
  checking: number;
  checkingCushion: number;
  safeExtra: number;
  billsReserve: number;
  payPerCheck: number;
  debts: DashboardDebt[];
  goals: DashboardGoal[];
}): DeterministicInsight[] {
  const emergency = input.goals.find(goal => goal.goalType === 'emergency_fund');
  const activeDebts = input.debts.filter(debt => debt.balance > 0);
  const incompleteGoals = input.goals.filter(goal => goal.targetAmount > goal.currentAmount);
  const cushionGap = Math.max(0, input.checkingCushion - input.checking);
  const insights: DeterministicInsight[] = [
    cushionGap > 0
      ? { id: 'cushion', title: 'Checking cushion needs attention', detail: `${money.format(cushionGap)} is needed to restore your protected balance.`, tone: 'warning' }
      : { id: 'cushion', title: 'Checking cushion is protected', detail: `${money.format(input.checkingCushion)} remains protected before optional transfers.`, tone: 'positive' },
    input.billsReserve > input.payPerCheck
      ? { id: 'bills', title: 'Bills are concentrated this pay cycle', detail: `${money.format(input.billsReserve)} is due against a ${money.format(input.payPerCheck)} paycheck.`, tone: 'warning' }
      : { id: 'bills', title: 'Upcoming bills fit within this paycheck', detail: `${money.format(input.billsReserve)} is reserved before optional cash is assigned.`, tone: 'neutral' },
  ];
  if (emergency?.targetAmount) {
    const progress = Math.min(100, Math.round(emergency.currentAmount / emergency.targetAmount * 100));
    insights.push({ id: 'emergency', title: `Emergency fund is ${progress}% funded`, detail: `${money.format(emergency.currentAmount)} of ${money.format(emergency.targetAmount)} is saved.`, tone: progress >= 100 ? 'positive' : 'neutral' });
  }
  if (activeDebts.length) {
    const total = activeDebts.reduce((sum, debt) => sum + debt.balance, 0);
    const highest = [...activeDebts].sort((a, b) => b.apr - a.apr)[0];
    insights.push({ id: 'debt', title: `${money.format(total)} remains across ${activeDebts.length} debt${activeDebts.length === 1 ? '' : 's'}`, detail: `${highest.name} has the highest recorded APR at ${highest.apr.toFixed(2)}%.`, tone: highest.apr >= 20 ? 'warning' : 'neutral' });
  }
  if (incompleteGoals.length) {
    const top = [...incompleteGoals].sort((a, b) => a.priority - b.priority)[0];
    const progress = top.targetAmount > 0 ? Math.min(100, Math.round(top.currentAmount / top.targetAmount * 100)) : 0;
    insights.push({ id: 'goal', title: `${top.name} is ${progress}% complete`, detail: `${money.format(Math.max(0, top.targetAmount - top.currentAmount))} remains on your highest-priority unfinished goal.`, tone: 'neutral' });
  } else {
    insights.push(input.safeExtra > 0
      ? { id: 'cash', title: `${money.format(input.safeExtra)} is safely available`, detail: 'Essentials and the checking cushion are covered.', tone: 'positive' }
      : { id: 'cash', title: 'No safe extra cash is available yet', detail: 'Pilot is keeping this pay cycle focused on recorded obligations and protections.', tone: 'neutral' });
  }
  return insights.slice(0, 5);
}

export function getSafeDashboardError() {
  return 'We could not refresh every part of your financial briefing. Your saved information is still available; try again in a moment.';
}
