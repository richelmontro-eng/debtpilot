import { explain } from './explain';
import { HIGH_APR, isEarlyEmergencyGoal, rankDebts, rankIncompleteGoals, VERY_HIGH_APR } from './rules';
import { confidence, getFinancialPulse, recommendationPriority } from './score';
import type { FinancialInboxItem, PilotBriefing, PilotCategory, PilotFinancialState, Recommendation } from './types';
import { analyzePromotion, getEffectiveApr } from '../promotions';

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function recommendation(input: {
  title: string;
  description: string;
  category: PilotCategory;
  confidence: number;
  amount: number;
  targetId?: string;
}): Recommendation {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    priority: recommendationPriority(input.category, input.confidence),
    confidence: input.confidence,
    estimatedBenefit: input.amount,
    reasoning: explain(input.description),
    action: { category: input.category, amount: input.amount, targetId: input.targetId },
  };
}

export function getPilotRecommendation(state: PilotFinancialState): Recommendation {
  const debtTarget = rankDebts(state.debts, state.strategy)[0];
  const incompleteGoals = rankIncompleteGoals(state.goals);
  const topGoal = incompleteGoals[0];
  const emergencyGoal = incompleteGoals.find(goal => goal.goalType === 'emergency_fund');

  if (state.availableBeforeCushion <= 0) return recommendation({
    category: 'none', amount: 0, confidence: confidence.essentials,
    title: 'Keep this paycheck focused on required expenses.',
    description: 'Bills, living costs, and required debt minimums use the available paycheck. No extra transfer is recommended yet.',
  });

  if (state.cushionGap > 0) {
    const amount = Math.min(state.availableBeforeCushion, state.cushionGap);
    return recommendation({
      category: 'cushion', amount, confidence: confidence.cushion,
      title: `Keep ${money.format(amount)} in checking.`,
      description: `Your checking balance is ${money.format(state.cushionGap)} below the protected cushion. Restoring that buffer comes before optional debt or goal payments.`,
    });
  }

  const promotionPriority = state.debts
    .map(debt => ({ debt, analysis: analyzePromotion(debt, { payPeriodsPerYear: state.payPeriodsPerYear ?? 52, plannedMonthlyPayment: debt.minimum ?? 0 }) }))
    .filter(item => item.analysis.status === 'at_risk' || item.analysis.status === 'needs_higher_payment')
    .sort((a, b) => (a.analysis.daysRemaining ?? Infinity) - (b.analysis.daysRemaining ?? Infinity))[0];
  if (state.safeExtra > 0 && promotionPriority) {
    const { debt, analysis } = promotionPriority;
    const amount = Math.min(state.safeExtra, analysis.requiredPerPaycheck, debt.balance);
    const interestRisk = analysis.estimatedInterestAtRisk;
    return recommendation({
      category: 'debt', amount, targetId: debt.id,
      confidence: analysis.status === 'at_risk' ? 99 : 96,
      title: `Pay at least ${money.format(amount)} toward ${debt.name} this paycheck.`,
      description: `${debt.name}'s ${debt.promotionType === 'deferred_interest' ? 'deferred-interest' : 'promotional-rate'} deadline is in ${analysis.daysRemaining} days. The safety plan targets payoff 30 days early${interestRisk > 0 ? ` to avoid approximately ${money.format(interestRisk)} in deferred interest` : ''}.`,
    });
  }

  const emergencyIsEarly = isEarlyEmergencyGoal(emergencyGoal, state.monthlyIncome);
  const veryHighAprDebt = debtTarget && getEffectiveApr(debtTarget) >= VERY_HIGH_APR;
  if (state.safeExtra > 0 && emergencyIsEarly && emergencyGoal && (!veryHighAprDebt || emergencyGoal.priority === 1)) {
    const amount = Math.min(state.safeExtra, emergencyGoal.targetAmount - emergencyGoal.currentAmount);
    return recommendation({
      category: 'goal', amount, confidence: confidence.emergency, targetId: emergencyGoal.id,
      title: `Put ${money.format(amount)} toward ${emergencyGoal.name}.`,
      description: 'Your emergency reserve is still in its first safety stage. Building that buffer reduces the chance that an unexpected expense creates new debt.',
    });
  }

  if (state.safeExtra > 0 && debtTarget && (getEffectiveApr(debtTarget) >= HIGH_APR || !topGoal || topGoal.priority > 1)) {
    const amount = Math.min(state.safeExtra, debtTarget.balance);
    const description = state.strategy === 'avalanche'
      ? `${debtTarget.name} is the highest-APR debt at ${getEffectiveApr(debtTarget).toFixed(2)}% based on currently active rates, so this payment is expected to reduce interest most efficiently.`
      : `${debtTarget.name} has the smallest remaining balance, creating the fastest payoff win under your snowball strategy.`;
    return recommendation({
      category: 'debt', amount, targetId: debtTarget.id,
      confidence: getEffectiveApr(debtTarget) >= VERY_HIGH_APR ? confidence.expensiveDebt : confidence.debt,
      title: `Pay ${money.format(amount)} toward ${debtTarget.name}.`,
      description,
    });
  }

  if (state.safeExtra > 0 && topGoal) {
    const amount = Math.min(state.safeExtra, topGoal.targetAmount - topGoal.currentAmount);
    return recommendation({
      category: 'goal', amount, confidence: confidence.goal, targetId: topGoal.id,
      title: `Put ${money.format(amount)} toward ${topGoal.name}.`,
      description: `${topGoal.name} is your highest-priority unfinished goal, and no higher-cost debt currently overrides it.`,
    });
  }

  if (state.safeExtra > 0 && debtTarget) {
    const amount = Math.min(state.safeExtra, debtTarget.balance);
    return recommendation({
      category: 'debt', amount, confidence: confidence.fallbackDebt, targetId: debtTarget.id,
      title: `Pay ${money.format(amount)} toward ${debtTarget.name}.`,
      description: 'Required expenses and your checking cushion are covered, so the remaining cash can accelerate debt payoff.',
    });
  }

  return recommendation({
    category: 'none', amount: 0, confidence: confidence.protected,
    title: 'Your required cash is protected.',
    description: 'Add a debt or unfinished goal to receive a next-action recommendation.',
  });
}

export function getRecommendationId(value: Recommendation) {
  return [
    value.category,
    value.action.targetId ?? 'none',
    value.action.amount,
    value.title,
  ].join(':');
}

export function getPilotBriefing(state: PilotFinancialState): PilotBriefing {
  const recommendationResult = getPilotRecommendation(state);
  const recommendationInboxItem: FinancialInboxItem = {
    id: 'pilot-recommendation',
    title: recommendationResult.title,
    description: recommendationResult.description,
    amount: recommendationResult.action.amount || undefined,
    urgency: recommendationResult.priority === 'critical' ? 'now' : 'planned',
  };
  const billInboxItems: FinancialInboxItem[] = state.billsDueSoon.map(bill => ({
      id: `bill-${bill.id}`,
      title: bill.frequency === 'weekly' ? `${bill.name} recurs this week` : `${bill.name} is due in ${bill.dueInDays} day${bill.dueInDays === 1 ? '' : 's'}`,
      description: 'Keep this amount reserved before assigning optional cash.',
      amount: bill.amount,
      urgency: bill.dueInDays <= 2 ? 'now' : 'soon',
    }));
  const inbox = [recommendationInboxItem, ...billInboxItems].slice(0, 6);

  const completedGoals = state.goals.filter(goal => goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount);
  const recentWins = [
    ...(state.cushionGap <= 0 ? ['Protected checking cushion is fully covered.'] : []),
    ...(state.safeExtra > 0 ? [`A safe extra of ${money.format(state.safeExtra)} is available after essentials.`] : []),
    ...completedGoals.map(goal => `${goal.name} has reached its target.`),
    ...(!state.debts.some(debt => debt.balance > 0) ? ['No active debt balances are recorded.'] : []),
  ].slice(0, 4);

  return {
    recommendation: recommendationResult,
    pulse: getFinancialPulse(state),
    inbox,
    recentWins: recentWins.length ? recentWins : ['Your plan is current; the next win is completing Pilot’s recommendation.'],
  };
}
