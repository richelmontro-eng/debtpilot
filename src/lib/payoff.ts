export type PayoffDebt = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimum: number;
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
  const debts = sourceDebts
    .filter(debt => debt.balance > 0)
    .map(debt => ({ ...debt, balance: Math.max(0, debt.balance), minimum: Math.max(0, debt.minimum), apr: Math.max(0, debt.apr) }));

  if (!debts.length) {
    return { months: 0, totalInterest: 0, debtFreeDate: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), paidOff: true };
  }

  let totalInterest = 0;
  let month = 0;

  while (month < maxMonths && debts.some(debt => debt.balance > 0.005)) {
    month += 1;

    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      const interest = debt.balance * (debt.apr / 100 / 12);
      debt.balance += interest;
      totalInterest += interest;
    }

    let paymentPool = debts.reduce((sum, debt) => sum + (debt.balance > 0 ? debt.minimum : 0), 0) + Math.max(0, monthlyExtra);

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

    const requiredInterest = debts.reduce((sum, debt) => sum + debt.balance * (debt.apr / 100 / 12), 0);
    const totalPlannedPayment = debts.reduce((sum, debt) => sum + (debt.balance > 0 ? debt.minimum : 0), 0) + Math.max(0, monthlyExtra);
    if (totalPlannedPayment <= requiredInterest && debts.some(debt => debt.balance > 0)) {
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
