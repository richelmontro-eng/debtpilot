import type { CompletedRecommendation, FinancialPulse, Recommendation } from '../pilot';
import type { DashboardBill, DashboardDebt, DashboardGoal } from '../dashboard-intelligence';
import type { FinancialEvent, TimelineGroup } from './types';
import { analyzePromotion } from '../promotions';

const dayMs = 86400000;

function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function addDays(date: Date, days: number) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days); }

function nextMonthlyDue(now: Date, dueDay: number) {
  const today = startOfDay(now);
  const lastThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let due = new Date(now.getFullYear(), now.getMonth(), Math.min(dueDay, lastThisMonth));
  if (due < today) {
    const lastNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
    due = new Date(now.getFullYear(), now.getMonth() + 1, Math.min(dueDay, lastNextMonth));
  }
  return due;
}

export function deriveFinancialEvents(input: {
  now: Date;
  cycleDays: number;
  payPerCheck: number;
  payPeriodsPerYear?: number;
  bills: DashboardBill[];
  debts: DashboardDebt[];
  goals: DashboardGoal[];
  pulse: FinancialPulse;
  recommendation: Recommendation;
  recommendationHistory?: CompletedRecommendation[];
  purchaseAnalyses?: Array<{ id: string; itemName: string; decision: string; purchasePrice: number; analyzedAt: string }>;
  billOccurrences?: Array<{ id:string; billId:string; name:string; paidAt:string|null; paidAmount:number|null; status:string }>;
  goalContributions?: Array<{ id: string; goalId: string; name: string; amount: number; contributedOn: string; createdAt: string }>;
}): FinancialEvent[] {
  const events: FinancialEvent[] = [];
  if (input.payPerCheck > 0) {
    const date = addDays(input.now, input.cycleDays);
    events.push({ id: 'income-next-paycheck', type: 'income', occurredAt: date.toISOString(), status: 'projected', title: 'Expected paycheck', summary: 'Expected from the saved pay schedule.', amount: input.payPerCheck, direction: 'inflow' });
  }
  for (const bill of input.bills) {
    if (!bill.dueDay || bill.dueDay < 1 || bill.dueDay > 31) continue;
    const date = bill.frequency === 'weekly' ? startOfDay(input.now) : nextMonthlyDue(input.now, bill.dueDay);
    events.push({ id: `bill-${bill.id}`, type: 'bill', occurredAt: date.toISOString(), status: 'projected', title: bill.name, summary: 'Expected bill from the saved schedule.', amount: bill.amount, direction: 'outflow', sourceId: bill.id });
  }
  for (const occurrence of input.billOccurrences ?? []) {
    if (occurrence.status !== 'paid' || !occurrence.paidAt) continue;
    events.push({ id: `bill-paid-${occurrence.id}`, type: 'bill', occurredAt: occurrence.paidAt, status: 'completed', title: `${occurrence.name} paid`, summary: 'Bill payment recorded.', amount: occurrence.paidAmount ?? undefined, direction: 'outflow', sourceId: occurrence.billId });
  }
  for (const debt of input.debts.filter(item => item.balance > 0)) {
    const promotion = analyzePromotion(debt, { now: input.now, payPeriodsPerYear: input.payPeriodsPerYear ?? 12, plannedMonthlyPayment: debt.minimum });
    const promotional = promotion.status !== 'none';
    events.push({ id: `debt-${debt.id}`, type: 'debt', occurredAt: startOfDay(input.now).toISOString(), status: 'posted', title: promotional ? `${debt.name} promotion status` : `${debt.name} balance`, summary: promotional ? `${debt.promotionType === 'deferred_interest' ? 'Deferred-interest' : '0% promotional APR'} promotion expires in ${promotion.daysRemaining} days.` : `${debt.apr.toFixed(2)}% APR with a recorded monthly minimum.`, amount: debt.balance, direction: 'neutral', sourceId: debt.id, metadata: promotional ? { promotionStatus: promotion.status, daysRemaining: promotion.daysRemaining, requiredPerPaycheck: promotion.requiredPerPaycheck, interestAtRisk: promotion.estimatedInterestAtRisk } : undefined });
  }
  for (const goal of input.goals.filter(item => item.targetAmount > 0 && item.currentAmount >= item.targetAmount)) {
    events.push({ id: `goal-${goal.id}`, type: 'goal', occurredAt: startOfDay(input.now).toISOString(), status: 'completed', title: `${goal.name} target reached`, summary: 'Saved goal progress reached the target.', amount: goal.currentAmount, direction: 'neutral', sourceId: goal.id });
  }
  for (const contribution of input.goalContributions ?? []) {
    events.push({ id: `goal-contribution-${contribution.id}`, type: 'goal', occurredAt: contribution.createdAt || `${contribution.contributedOn}T12:00:00`, status: 'posted', title: `${contribution.name} contribution`, summary: 'Goal progress increased.', amount: contribution.amount, direction: 'outflow', sourceId: contribution.goalId });
  }
  events.push({ id: 'health-current', type: 'financial_health', occurredAt: startOfDay(input.now).toISOString(), status: 'posted', title: `Financial health: ${input.pulse.label}`, summary: `Current deterministic health score is ${input.pulse.score}/100.`, direction: 'neutral', metadata: { score: input.pulse.score } });
  events.push({ id: 'recommendation-current', type: 'recommendation', occurredAt: startOfDay(input.now).toISOString(), status: 'projected', title: input.recommendation.title, summary: input.recommendation.description, amount: input.recommendation.action.amount || undefined, direction: input.recommendation.action.amount ? 'outflow' : 'neutral', metadata: { confidence: input.recommendation.confidence, category: input.recommendation.category } });
  for (const item of input.recommendationHistory ?? []) {
    events.push({ id: `recommendation-completed-${item.id}`, type: 'recommendation', occurredAt: item.completedAt, status: 'completed', title: item.title, summary: 'Pilot recommendation marked complete.', amount: item.estimatedBenefit || undefined, direction: 'neutral', sourceId: item.id, metadata: { confidence: item.confidence, category: item.category } });
  }
  for (const item of input.purchaseAnalyses ?? []) {
    events.push({ id: `purchase-${item.id}`, type: 'purchase_analysis', occurredAt: item.analyzedAt, status: 'posted', title: `${item.itemName}: ${item.decision}`, summary: 'Before You Buy analysis completed.', amount: item.purchasePrice, direction: 'neutral', sourceId: item.id, metadata: { decision: item.decision } });
  }
  return events.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() || a.id.localeCompare(b.id));
}

function groupFor(now: Date, date: Date): TimelineGroup['label'] {
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / dayMs);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return 'This Week';
  return 'Upcoming';
}

export function groupTimelineEvents(events: FinancialEvent[], now: Date): TimelineGroup[] {
  const timelineTypes = new Set(['income', 'bill', 'goal', 'recommendation', 'purchase_analysis']);
  const ordered = events.filter(event => timelineTypes.has(event.type)).sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() || a.title.localeCompare(b.title));
  return (['Today', 'Tomorrow', 'This Week', 'Upcoming'] as const)
    .map(label => ({ label, events: ordered.filter(event => groupFor(now, new Date(event.occurredAt)) === label) }))
    .filter(group => group.events.length);
}
