import { describe, expect, it } from 'vitest';
import { getPilotBriefing, getPilotRecommendation, getRecommendationId } from './engine';
import type { PilotFinancialState } from './types';
import { rankDebts } from './rules';

const base: PilotFinancialState = {
  availableBeforeCushion: 500,
  cushionGap: 0,
  safeExtra: 500,
  monthlyIncome: 4_000,
  payPerCheck: 1_000,
  monthlyMinimums: 200,
  checking: 2_000,
  checkingCushion: 1_000,
  strategy: 'avalanche',
  debts: [],
  goals: [],
  billsDueSoon: [],
};

describe('Pilot recommendation engine', () => {
  it('prioritizes a deferred-interest deadline without treating the post-promotion APR as active', () => {
    const end = new Date();
    end.setDate(end.getDate() + 90);
    const promotionalDebt = { id: 'promo', name: 'Promo card', balance: 3_000, apr: 29, minimum: 50, promotionType: 'deferred_interest' as const, promotionalApr: 0, promotionEndDate: end.toISOString().slice(0, 10), postPromotionApr: 29, estimatedDeferredInterest: 700 };
    const result = getPilotRecommendation({ ...base, debts: [promotionalDebt], payPeriodsPerYear: 26 });
    expect(result.title).toContain('Promo card');
    expect(result.description).toContain('30 days early');
    expect(rankDebts([promotionalDebt, { id: 'active', name: 'Active card', balance: 1_000, apr: 10 }], 'avalanche')[0].id).toBe('active');
  });

  it('preserves the required-expenses recommendation', () => {
    const result = getPilotRecommendation({ ...base, availableBeforeCushion: 0, safeExtra: 0 });
    expect(result).toMatchObject({
      category: 'none',
      confidence: 92,
      estimatedBenefit: 0,
      title: 'Keep this paycheck focused on required expenses.',
      description: 'Bills, living costs, and required debt minimums use the available paycheck. No extra transfer is recommended yet.',
    });
  });

  it('restores the checking cushion before optional goals or debt', () => {
    const result = getPilotRecommendation({ ...base, availableBeforeCushion: 300, cushionGap: 800, safeExtra: 0 });
    expect(result).toMatchObject({
      category: 'cushion', confidence: 98, estimatedBenefit: 300,
      title: 'Keep $300 in checking.',
    });
  });

  it('prioritizes an early priority-one emergency fund over ordinary debt', () => {
    const result = getPilotRecommendation({
      ...base,
      debts: [{ id: 'debt', name: 'Card', balance: 2_000, apr: 18 }],
      goals: [{ id: 'goal', name: 'Emergency fund', goalType: 'emergency_fund', targetAmount: 2_000, currentAmount: 200, priority: 1 }],
    });
    expect(result).toMatchObject({
      category: 'goal', confidence: 94, estimatedBenefit: 500,
      title: 'Put $500 toward Emergency fund.',
      action: { targetId: 'goal', amount: 500 },
    });
  });

  it('preserves avalanche debt targeting and explanation', () => {
    const result = getPilotRecommendation({
      ...base,
      debts: [
        { id: 'low', name: 'Loan', balance: 1_000, apr: 8 },
        { id: 'high', name: 'Card', balance: 2_000, apr: 22 },
      ],
    });
    expect(result).toMatchObject({
      category: 'debt', confidence: 97, estimatedBenefit: 500,
      title: 'Pay $500 toward Card.',
      action: { targetId: 'high', amount: 500 },
    });
    expect(result.description).toContain('highest-APR debt at 22.00%');
  });

  it('preserves priority-goal fallback behavior', () => {
    const result = getPilotRecommendation({
      ...base,
      debts: [{ id: 'debt', name: 'Loan', balance: 2_000, apr: 5 }],
      goals: [{ id: 'goal', name: 'House fund', goalType: 'house', targetAmount: 5_000, currentAmount: 1_000, priority: 1 }],
    });
    expect(result).toMatchObject({
      category: 'goal', confidence: 88, estimatedBenefit: 500,
      title: 'Put $500 toward House fund.',
    });
  });

  it('builds the financial inbox from Pilot output and upcoming bills', () => {
    const briefing = getPilotBriefing({
      ...base,
      billsDueSoon: [{ id: 'rent', name: 'Rent', amount: 1_200, dueInDays: 2, frequency: 'monthly' }],
    });
    expect(briefing.inbox).toHaveLength(2);
    expect(briefing.inbox[1]).toMatchObject({ id: 'bill-rent', amount: 1_200, urgency: 'now' });
    expect(briefing.pulse.score).toBeGreaterThanOrEqual(0);
    expect(briefing.pulse.explanation).toHaveLength(3);
  });

  it('surfaces engine-derived recent wins', () => {
    const briefing = getPilotBriefing({ ...base, debts: [] });
    expect(briefing.recentWins).toContain('Protected checking cushion is fully covered.');
    expect(briefing.recentWins).toContain('No active debt balances are recorded.');
  });

  it('creates a stable identifier for persisted recommendation completion', () => {
    const recommendation = getPilotRecommendation({
      ...base,
      debts: [{ id: 'card', name: 'Card', balance: 2_000, apr: 22 }],
    });
    expect(getRecommendationId(recommendation)).toBe('debt:card:500:Pay $500 toward Card.');
    expect(getRecommendationId(recommendation)).toBe(getRecommendationId({ ...recommendation }));
  });
});
