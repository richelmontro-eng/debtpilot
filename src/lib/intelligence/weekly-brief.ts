import type { FinancialEvent, IntelligenceSnapshot, PilotInsight } from './types';

export type WeeklyBrief = {
  financialWins: Array<{ title: string; summary: string }>;
  upcomingRisks: Array<{ title: string; summary: string; severity: PilotInsight['severity'] }>;
  completedRecommendations: FinancialEvent[];
  financialHealthChange: { before: number; after: number; change: number } | null;
};

export function generateWeeklyBrief(input: { events: FinancialEvent[]; insights: PilotInsight[]; snapshots: IntelligenceSnapshot[]; now: Date }): WeeklyBrief {
  const weekStart = new Date(input.now.getTime() - 7 * 86400000);
  const recent = input.events.filter(event => new Date(event.occurredAt) >= weekStart && new Date(event.occurredAt) <= input.now);
  const financialWins = [
    ...input.insights.filter(insight => insight.kind === 'Achievement').map(insight => ({ title: insight.title, summary: insight.summary })),
    ...recent.filter(event => event.type === 'goal' && event.status === 'completed').map(event => ({ title: event.title, summary: event.summary })),
  ].slice(0, 5);
  const upcomingRisks = input.insights.filter(insight => insight.kind === 'Risk' || insight.severity === 'critical').map(insight => ({ title: insight.title, summary: insight.summary, severity: insight.severity })).slice(0, 5);
  const completedRecommendations = recent.filter(event => event.type === 'recommendation' && event.status === 'completed');
  const snapshots = [...input.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const before = snapshots.at(-2);
  const after = snapshots.at(-1);
  return { financialWins, upcomingRisks, completedRecommendations, financialHealthChange: before && after ? { before: before.health, after: after.health, change: after.health - before.health } : null };
}
