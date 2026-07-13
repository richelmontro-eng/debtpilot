export type PromotionType = 'none' | 'zero_percent' | 'deferred_interest';
export type PromotionDebt = {
  balance: number;
  apr: number;
  minimum?: number;
  promotionType?: PromotionType;
  promotionalApr?: number | null;
  promotionEndDate?: string | null;
  postPromotionApr?: number | null;
  originalPromotionalBalance?: number | null;
  estimatedDeferredInterest?: number | null;
};

export type PromotionStatus = 'on_track' | 'needs_higher_payment' | 'at_risk' | 'expired' | 'none';

const dayMs = 86400000;

function validDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function getEffectiveApr(debt: PromotionDebt, now = new Date()) {
  const end = validDate(debt.promotionEndDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const active = debt.promotionType && debt.promotionType !== 'none' && end && today <= end;
  return active ? Math.max(0, debt.promotionalApr ?? 0) : Math.max(0, debt.postPromotionApr ?? debt.apr);
}

export function analyzePromotion(debt: PromotionDebt, options: { now?: Date; payPeriodsPerYear?: number; plannedMonthlyPayment?: number } = {}) {
  const now = options.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endDate = validDate(debt.promotionEndDate);
  if (!debt.promotionType || debt.promotionType === 'none' || !endDate) {
    return { status: 'none' as PromotionStatus, daysRemaining: null, paymentsRemainingBeforeDeadline: 0, paymentsRemainingBeforeSafetyTarget: 0, requiredMonthlyPayment: 0, requiredPerPaycheck: 0, projectedPayoffDate: null, preservesPromotion: true, safetyTargetDate: null, estimatedInterestAtRisk: 0, effectiveApr: getEffectiveApr(debt, now) };
  }
  const safetyTargetDate = new Date(endDate.getTime() - 30 * dayMs);
  const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / dayMs);
  const safetyDaysRemaining = Math.ceil((safetyTargetDate.getTime() - today.getTime()) / dayMs);
  const periods = Math.max(1, options.payPeriodsPerYear ?? 12);
  const paymentsRemainingBeforeDeadline = Math.max(0, Math.ceil(daysRemaining * periods / 365.25));
  const paymentsRemainingBeforeSafetyTarget = Math.max(0, Math.ceil(safetyDaysRemaining * periods / 365.25));
  const monthlyPayments = Math.max(0, Math.ceil(safetyDaysRemaining * 12 / 365.25));
  const balance = Math.max(0, debt.balance);
  const requiredMonthlyPayment = monthlyPayments > 0 ? balance / monthlyPayments : balance;
  const requiredPerPaycheck = paymentsRemainingBeforeSafetyTarget > 0 ? balance / paymentsRemainingBeforeSafetyTarget : balance;
  const plannedMonthlyPayment = Math.max(0, options.plannedMonthlyPayment ?? debt.minimum ?? 0);
  const payoffMonths = plannedMonthlyPayment > 0 ? Math.ceil(balance / plannedMonthlyPayment) : Infinity;
  const projectedPayoffDate = Number.isFinite(payoffMonths) ? addMonths(today, payoffMonths) : null;
  const preservesPromotion = Boolean(projectedPayoffDate && projectedPayoffDate <= safetyTargetDate);
  const expired = daysRemaining < 0;
  const exceedsStatedDeadline = !projectedPayoffDate || projectedPayoffDate > endDate;
  const status: PromotionStatus = expired
    ? 'expired'
    : debt.promotionType === 'deferred_interest' && exceedsStatedDeadline
      ? 'at_risk'
      : preservesPromotion
        ? 'on_track'
        : 'needs_higher_payment';
  return {
    status,
    daysRemaining: Math.max(0, daysRemaining),
    paymentsRemainingBeforeDeadline,
    paymentsRemainingBeforeSafetyTarget,
    requiredMonthlyPayment,
    requiredPerPaycheck,
    projectedPayoffDate,
    preservesPromotion,
    safetyTargetDate,
    estimatedInterestAtRisk: debt.promotionType === 'deferred_interest' && !preservesPromotion ? Math.max(0, debt.estimatedDeferredInterest ?? 0) : 0,
    effectiveApr: getEffectiveApr(debt, now),
  };
}

export function promotionStatusLabel(status: PromotionStatus) {
  return status === 'on_track' ? 'On track' : status === 'needs_higher_payment' ? 'Needs higher payment' : status === 'at_risk' ? 'At risk' : status === 'expired' ? 'Promotion expired' : 'No promotion';
}
