import { describe, expect, it } from 'vitest';
import { getBriefingSummary, getDeterministicInsights, getGroupedTimeline, getMissingInformation, getSafeDashboardError } from './dashboard-intelligence';
import type { FinancialPulse, Recommendation } from './pilot';

const pulse: FinancialPulse = { score: 72, label: 'Stable', explanation: [] };
const recommendation: Recommendation = { title: 'Keep $100 in checking.', description: 'Restore the buffer.', category: 'cushion', priority: 'high', confidence: 98, estimatedBenefit: 100, reasoning: ['Buffer is low.'], action: { category: 'cushion', amount: 100 } };

describe('financial briefing intelligence', () => {
  it('describes safe cash and cash-risk states', () => {
    expect(getBriefingSummary({ pulse, safeExtra: 250, availableBeforeCushion: 250, cushionGap: 0, recommendation }).cashMessage).toContain('$250');
    const risk = getBriefingSummary({ pulse, safeExtra: 0, availableBeforeCushion: 0, cushionGap: 0, recommendation });
    expect(risk.cashRisk).toBe(true);
    expect(risk.summary).toContain('no unassigned cash');
  });

  it('detects high-value missing information', () => {
    const items = getMissingInformation({ payPerCheck: 0, checkingCushion: 0, debts: [], bills: [{ id: 'b', name: 'Rent', amount: 1000, dueDay: 0, frequency: 'monthly' }], goals: [] });
    expect(items.map(item => item.id)).toEqual(expect.arrayContaining(['income', 'cushion', 'debts', 'due-dates', 'emergency', 'goals']));
    expect(getMissingInformation({ payPerCheck: 1000, checkingCushion: 200, debts: [{ id: 'd', name: 'Card', balance: 10, apr: 1, minimum: 1 }], bills: [{ id: 'b', name: 'Rent', amount: 500, dueDay: 1, frequency: 'monthly' }], goals: [{ id: 'g', name: 'Emergency', goalType: 'emergency_fund', targetAmount: 1000, currentAmount: 100, priority: 1 }] })).toEqual([]);
  });

  it('generates deterministic saved-data insights', () => {
    const input = { checking: 100, checkingCushion: 500, safeExtra: 0, billsReserve: 900, payPerCheck: 800, debts: [{ id: 'd', name: 'Card', balance: 2000, apr: 24, minimum: 50 }], goals: [{ id: 'g', name: 'Emergency', goalType: 'emergency_fund', targetAmount: 1000, currentAmount: 250, priority: 1 }] };
    expect(getDeterministicInsights(input)).toEqual(getDeterministicInsights(input));
    expect(getDeterministicInsights(input).map(item => item.id)).toEqual(['cushion', 'bills', 'emergency', 'debt', 'goal']);
  });

  it('sorts and groups bills, paychecks, and goal events', () => {
    const groups = getGroupedTimeline({ now: new Date('2026-07-12T12:00:00'), cycleDays: 7, payPerCheck: 1200, bills: [{ id: 'weekly', name: 'Groceries', amount: 100, dueDay: 12, frequency: 'weekly' }, { id: 'tomorrow', name: 'Phone', amount: 80, dueDay: 13, frequency: 'monthly' }], goals: [{ id: 'done', name: 'Starter fund', goalType: 'emergency_fund', targetAmount: 500, currentAmount: 500, priority: 1 }], recommendation });
    expect(groups.map(group => group.label)).toEqual(['Today', 'Tomorrow', 'This Week']);
    expect(groups.flatMap(group => group.items).map(item => item.label)).toEqual(expect.arrayContaining(['Groceries', 'Phone', 'Expected paycheck', 'Starter fund target reached']));
    expect(groups.flatMap(group => group.items).every((item, index, all) => index === 0 || new Date(all[index - 1].date) <= new Date(item.date))).toBe(true);
  });

  it('suppresses technical error details', () => {
    const message = getSafeDashboardError();
    expect(message).not.toMatch(/supabase|postgres|jwt|cookie|framework|PGRST/i);
    expect(message).toContain('try again');
  });
});
