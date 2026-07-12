import type { DebtStrategy, PilotDebt, PilotGoal } from './types';

export const VERY_HIGH_APR = 20;
export const HIGH_APR = 10;

export function rankDebts(debts: PilotDebt[], strategy: DebtStrategy) {
  return [...debts]
    .filter(debt => debt.balance > 0)
    .sort((a, b) => strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance);
}

export function rankIncompleteGoals(goals: PilotGoal[]) {
  return [...goals]
    .filter(goal => goal.targetAmount > goal.currentAmount)
    .sort((a, b) => a.priority - b.priority
      || (a.targetAmount - a.currentAmount) - (b.targetAmount - b.currentAmount));
}

export function isEarlyEmergencyGoal(goal: PilotGoal | undefined, monthlyIncome: number) {
  return Boolean(goal
    && goal.currentAmount < Math.min(goal.targetAmount, Math.max(1000, monthlyIncome)));
}
