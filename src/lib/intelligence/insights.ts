import type { Recommendation } from '../pilot';
import { getDeterministicInsights, type DashboardBill, type DashboardDebt, type DashboardGoal } from '../dashboard-intelligence';
import type { FinancialEvent, IntelligenceSnapshot, PilotInsight } from './types';

export function generatePilotInsights(input: {
  checking: number;
  checkingCushion: number;
  safeExtra: number;
  billsReserve: number;
  payPerCheck: number;
  debts: DashboardDebt[];
  bills: DashboardBill[];
  goals: DashboardGoal[];
  recommendation: Recommendation;
  events: FinancialEvent[];
  snapshots?: IntelligenceSnapshot[];
}): PilotInsight[] {
  const base: PilotInsight[] = getDeterministicInsights(input).map(item => ({
    id: item.id,
    kind: (item.id === 'cushion' && item.tone === 'warning' || item.id === 'bills' && item.tone === 'warning' ? 'Risk' : item.tone === 'positive' ? 'Achievement' : 'Opportunity') as PilotInsight['kind'],
    title: item.title,
    summary: item.detail,
    reasoning: [item.detail],
    confidence: 94,
    severity: (item.tone === 'warning' ? 'warning' : item.tone === 'positive' ? 'positive' : 'info') as PilotInsight['severity'],
    suggestedAction: item.id === 'goal' || item.id === 'emergency' ? { label: 'Review goals', href: '/goals' } : item.id === 'debt' ? { label: 'Review payoff plan', href: '/payoff' } : { label: 'Review dashboard plan', href: '/' },
    sourceEventIds: input.events.filter(event => event.type === (item.id === 'bills' ? 'bill' : item.id === 'debt' ? 'debt' : item.id === 'goal' || item.id === 'emergency' ? 'goal' : 'financial_health')).map(event => event.id),
  }));
  const snapshots = input.snapshots ?? [];
  if (snapshots.length > 1) {
    const previous = snapshots.at(-2)!;
    const latest = snapshots.at(-1)!;
    const delta = latest.health - previous.health;
    base.push({ id: 'health-trend', kind: 'Trend', title: `Financial health ${delta >= 0 ? 'improved' : 'declined'} ${Math.abs(delta)} point${Math.abs(delta) === 1 ? '' : 's'}`, summary: `The score moved from ${previous.health} to ${latest.health}.`, reasoning: ['This compares the two latest saved financial snapshots.'], confidence: 99, severity: delta >= 0 ? 'positive' : 'warning', suggestedAction: { label: 'Review health history', href: '/insights' }, sourceEventIds: ['health-current'] });
  }
  base.push({ id: 'pilot-recommendation', kind: 'Recommendation', title: input.recommendation.title, summary: input.recommendation.description, reasoning: input.recommendation.reasoning, confidence: input.recommendation.confidence, severity: input.recommendation.priority === 'critical' ? 'critical' : 'info', suggestedAction: { label: 'Review recommendation', href: '/' }, estimatedBenefit: input.recommendation.estimatedBenefit || undefined, sourceEventIds: ['recommendation-current'] });
  return base.slice(0, 5);
}
