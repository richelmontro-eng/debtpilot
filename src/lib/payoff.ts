import { getEffectiveApr, type PromotionDebt, type PromotionType } from './promotions';

export type PayoffDebt = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimum: number;
  promotionType?: PromotionType;
  promotionalApr?: number | null;
  promotionEndDate?: string | null;
  postPromotionApr?: number | null;
  originalPromotionalBalance?: number | null;
  estimatedDeferredInterest?: number | null;
};

export type PayoffResult = {
  months: number;
  totalInterest: number;
  debtFreeDate: string | null;
  paidOff: boolean;
};

export function simulatePayoff(
  sourceDebts: PayoffDebt[],
  monthlyExtra: number,
  strategy: 'avalanche' | 'snowball',
  maxMonths = 600,
): PayoffResult {
  const safeExtra = Number.isFinite(monthlyExtra) ? Math.max(0, monthlyExtra) : 0;
  const debts = sourceDebts
    .filter(debt => Number.isFinite(debt.balance) && debt.balance > 0)
    .map(debt => ({
      ...debt,
      balance: Math.max(0, debt.balance),
      minimum: Number.isFinite(debt.minimum) ? Math.max(0, debt.minimum) : 0,
      apr: Number.isFinite(debt.apr) ? Math.max(0, debt.apr) : 0,
      deferredApplied: false,
    }));

  if (!debts.length) {
    return { months: 0, totalInterest: 0, debtFreeDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), paidOff: true };
  }

  let totalInterest = 0;
  let month = 0;

  while (month < maxMonths && debts.some(debt => debt.balance > 0.005)) {
    month += 1;
    const simulationDate = new Date();
    simulationDate.setMonth(simulationDate.getMonth() + month - 1);

    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      const endDate = debt.promotionEndDate ? new Date(`${debt.promotionEndDate}T00:00:00`) : null;
      if (debt.promotionType === 'deferred_interest' && endDate && simulationDate > endDate && !debt.deferredApplied) {
        const deferredInterest = Math.max(0, debt.estimatedDeferredInterest ?? 0);
        debt.balance += deferredInterest;
        totalInterest += deferredInterest;
        debt.deferredApplied = true;
      }
      const interest = debt.balance * (getEffectiveApr(debt as PromotionDebt, simulationDate) / 100 / 12);
      debt.balance += interest;
      totalInterest += interest;
    }

    let paymentPool = debts.reduce((sum, debt) => sum + (debt.balance > 0 ? debt.minimum : 0), 0) + safeExtra;

    for (const debt of debts) {
      if (debt.balance <= 0 || paymentPool <= 0) continue;
      const payment = Math.min(debt.balance, debt.minimum, paymentPool);
      debt.balance -= payment;
      paymentPool -= payment;
    }

    const ranked = debts
      .filter(debt => debt.balance > 0)
      .sort((a, b) => strategy === 'avalanche' ? b.apr - a.apr || a.balance - b.balance : a.balance - b.balance || b.apr - a.apr);

    for (const debt of ranked) {
      if (paymentPool <= 0) break;
      const payment = Math.min(debt.balance, paymentPool);
      debt.balance -= payment;
      paymentPool -= payment;
    }

    const nextDate = new Date(simulationDate);
    nextDate.setMonth(nextDate.getMonth() + 1);
    const nextMonthInterest = debts.reduce((sum, debt) => sum + debt.balance * (getEffectiveApr(debt as PromotionDebt, nextDate) / 100 / 12), 0);
    const nextMonthPayment = debts.reduce((sum, debt) => sum + (debt.balance > 0 ? debt.minimum : 0), 0) + safeExtra;
    if (nextMonthPayment <= nextMonthInterest && debts.some(debt => debt.balance > 0)) {
      return { months: month, totalInterest, debtFreeDate: null, paidOff: false };
    }
  }

  const paidOff = debts.every(debt => debt.balance <= 0.005);
  const date = new Date();
  date.setMonth(date.getMonth() + month);

  return {
    months: month,
    totalInterest,
    debtFreeDate: paidOff ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null,
    paidOff,
  };
}
