import { describe, expect, it } from 'vitest';
import { buildCommandCenter, deriveFinancialEvents, generatePilotInsights, generateWeeklyBrief, groupTimelineEvents } from '.';

const recommendation = { title: 'Keep $100 in checking.', description: 'Restore the buffer.', category: 'cushion' as const, priority: 'critical' as const, confidence: 98, estimatedBenefit: 100, reasoning: ['The cushion is short.'], action: { category: 'cushion' as const, amount: 100 } };
const pulse = { score: 60, label: 'Watch' as const, explanation: ['Cushion is short.'] };

describe('Pilot intelligence platform', () => {
  it('derives every supported source into one financial event format', () => {
    const events = deriveFinancialEvents({ now: new Date('2026-07-12T12:00:00'), cycleDays: 7, payPerCheck: 1000, bills: [{ id: 'b', name: 'Rent', amount: 500, dueDay: 13, frequency: 'monthly' }], debts: [{ id: 'd', name: 'Card', balance: 1000, apr: 20, minimum: 50 }], goals: [{ id: 'g', name: 'Emergency', goalType: 'emergency_fund', targetAmount: 500, currentAmount: 500, priority: 1 }], pulse, recommendation, recommendationHistory: [{ id: 'r', recommendationId: 'x', title: 'Done', category: 'debt', confidence: 90, estimatedBenefit: 50, reasoning: [], completedAt: '2026-07-11T12:00:00Z' }], purchaseAnalyses: [{ id: 'p', itemName: 'Laptop', decision: 'Proceed', purchasePrice: 900, analyzedAt: '2026-07-12T10:00:00Z' }] });
    expect(new Set(events.map(event => event.type))).toEqual(new Set(['income', 'bill', 'debt', 'goal', 'financial_health', 'recommendation', 'purchase_analysis']));
    expect(events.every(event => event.id && event.occurredAt && event.status && event.title && event.summary)).toBe(true);
  });

  it('groups shared events chronologically for the timeline', () => {
    const events = deriveFinancialEvents({ now: new Date('2026-07-12T12:00:00'), cycleDays: 7, payPerCheck: 1000, bills: [{ id: 'b', name: 'Phone', amount: 50, dueDay: 13, frequency: 'monthly' }], debts: [], goals: [], pulse, recommendation });
    expect(groupTimelineEvents(events, new Date('2026-07-12T12:00:00')).map(group => group.label)).toEqual(['Today', 'Tomorrow', 'This Week']);
  });

  it('adds paid bill occurrences to the completed timeline', () => {
    const events = deriveFinancialEvents({
      now: new Date('2026-07-12T12:00:00'),
      cycleDays: 7,
      payPerCheck: 1000,
      bills: [],
      debts: [],
      goals: [],
      pulse,
      recommendation,
      billOccurrences: [{ id: 'occurrence-1', billId: 'bill-1', name: 'Internet', paidAmount: 85, status: 'paid', paidAt: '2026-07-12T09:30:00Z' }],
    });

    expect(events).toContainEqual(expect.objectContaining({
      id: 'bill-paid-occurrence-1',
      type: 'bill',
      status: 'completed',
      title: 'Internet paid',
      amount: 85,
    }));
  });

  it('adds goal contributions to the timeline', () => {
    const events = deriveFinancialEvents({ now: new Date('2026-07-12T12:00:00'), cycleDays: 7, payPerCheck: 1000, bills: [], debts: [], goals: [], pulse, recommendation, goalContributions: [{ id: 'contribution-1', goalId: 'goal-1', name: 'Emergency Fund', amount: 125, contributedOn: '2026-07-12', createdAt: '2026-07-12T10:00:00Z' }] });
    expect(events).toContainEqual(expect.objectContaining({ id: 'goal-contribution-contribution-1', type: 'goal', title: 'Emergency Fund contribution', amount: 125, status: 'posted' }));
  });

  it('creates complete deterministic insight records', () => {
    const events = deriveFinancialEvents({ now: new Date(), cycleDays: 7, payPerCheck: 1000, bills: [], debts: [], goals: [], pulse, recommendation });
    const insights = generatePilotInsights({ checking: 0, checkingCushion: 100, safeExtra: 0, billsReserve: 0, payPerCheck: 1000, debts: [], bills: [], goals: [], recommendation, events });
    expect(insights.every(insight => insight.title && insight.summary && insight.reasoning.length && insight.confidence && insight.severity && insight.suggestedAction.label)).toBe(true);
    expect(insights.every(insight => insight.suggestedAction.href !== '/')).toBe(true);
    expect(insights.find(insight => insight.id === 'pilot-recommendation')?.suggestedAction.href).toBe('/#pilot-recommendation');
    expect(insights.some(insight => insight.kind === 'Recommendation')).toBe(true);
  });

  it('builds one command-center model and an internal weekly brief', () => {
    const financialState = { availableBeforeCushion: 300, cushionGap: 0, safeExtra: 300, monthlyIncome: 4000, payPerCheck: 1000, monthlyMinimums: 0, checking: 1000, checkingCushion: 500, strategy: 'avalanche' as const, debts: [], goals: [], billsDueSoon: [] };
    const model = buildCommandCenter({ now: new Date('2026-07-12T12:00:00'), cycleDays: 7, financialState, checking: 1000, checkingCushion: 500, billsReserve: 0, debts: [], bills: [], goals: [], recommendationHistory: [], snapshots: [{ date: '2026-07-01', health: 60, netWorth: 1000, debt: 0 }, { date: '2026-07-08', health: 70, netWorth: 1200, debt: 0 }] });
    expect(model.timeline.length).toBeGreaterThan(0);
    expect(model.insights.length).toBeGreaterThanOrEqual(3);
    const weekly = generateWeeklyBrief({ events: model.events, insights: model.insights, snapshots: [{ date: '2026-07-01', health: 60, netWorth: 1000, debt: 0 }, { date: '2026-07-08', health: 70, netWorth: 1200, debt: 0 }], now: new Date('2026-07-12T12:00:00') });
    expect(weekly.financialHealthChange).toEqual({ before: 60, after: 70, change: 10 });
  });
});
