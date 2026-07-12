import type { FinancialPulse, PilotCategory, PilotFinancialState, PilotPriority } from './types';

export const confidence = {
  essentials: 92,
  cushion: 98,
  emergency: 94,
  expensiveDebt: 97,
  debt: 91,
  goal: 88,
  fallbackDebt: 86,
  protected: 75,
} as const;

export function recommendationPriority(category: PilotCategory, confidenceScore: number): PilotPriority {
  if (category === 'cushion') return 'critical';
  if (confidenceScore >= 94) return 'high';
  if (confidenceScore >= 86) return 'medium';
  return 'low';
}

export function getFinancialHealth(state: PilotFinancialState) {
  const debtBurden = state.monthlyIncome ? state.monthlyMinimums / state.monthlyIncome : 1;
  const cushionScore = state.checkingCushion <= 0
    ? 10
    : Math.min(20, state.checking / state.checkingCushion * 20);
  const cashFlowScore = state.payPerCheck <= 0
    ? 0
    : Math.min(35, state.safeExtra / state.payPerCheck * 100);
  const goalScore = state.goals.length
    ? Math.min(10, state.goals.reduce((sum, goal) => sum
      + Math.min(1, goal.currentAmount / Math.max(1, goal.targetAmount)), 0) / state.goals.length * 10)
    : 0;
  return Math.max(0, Math.min(100, Math.round(35 + cushionScore + cashFlowScore + goalScore - debtBurden * 35)));
}

export function getFinancialPulse(state: PilotFinancialState): FinancialPulse {
  const score = getFinancialHealth(state);
  const label = score >= 80 ? 'Strong' : score >= 65 ? 'Stable' : score >= 45 ? 'Watch' : 'At risk';
  const explanation = [
    state.cushionGap > 0
      ? `Checking is $${Math.round(state.cushionGap).toLocaleString('en-US')} below the protected cushion.`
      : 'The protected checking cushion is currently covered.',
    state.safeExtra > 0
      ? `$${Math.round(state.safeExtra).toLocaleString('en-US')} remains after this paycheck's essentials and protections.`
      : 'No extra cash remains after this paycheck’s essentials and protections.',
    state.monthlyIncome > 0
      ? `Monthly debt minimums use ${Math.round(state.monthlyMinimums / state.monthlyIncome * 100)}% of estimated take-home income.`
      : 'Income is not yet available for debt-burden scoring.',
  ];
  return { score, label, explanation };
}
