import type { PersistedDebt } from './debt-persistence';
import { simulatePayoff } from './payoff';
import { analyzePromotion, getEffectiveApr, promotionStatusLabel } from './promotions';
import { rankDebts } from './pilot/rules';

export type DebtStrategy = 'avalanche' | 'snowball';
export type DebtSection = 'Needs Attention' | 'Promotional Interest' | 'Active Payoff' | 'Paid Off';

export type DebtWorkspaceItem = {
  debt: PersistedDebt;
  section: DebtSection;
  rank: number;
  priority: 'Urgent' | 'High' | 'Standard' | 'Complete';
  effectiveApr: number;
  recommendedPayment: number;
  payoffDate: string | null;
  minimumPayoffDate: string | null;
  estimatedInterest: number;
  minimumInterest: number;
  interestBenefit: number;
  monthsBenefit: number;
  promotion: ReturnType<typeof analyzePromotion>;
  explanation: string[];
};

export type DebtWorkspaceModel = {
  totalDebt: number;
  totalMinimums: number;
  estimatedMonthlyInterest: number;
  debtFreeDate: string | null;
  strategy: DebtStrategy;
  pilotNote: string;
  sections: Record<DebtSection, DebtWorkspaceItem[]>;
};

const sectionOrder: DebtSection[] = ['Needs Attention', 'Promotional Interest', 'Active Payoff', 'Paid Off'];

export function buildDebtWorkspace(debts: PersistedDebt[], strategy: DebtStrategy, now = new Date(), payPeriodsPerYear = 52): DebtWorkspaceModel {
  const active = debts.filter(debt => debt.balance > 0);
  const ranked = rankDebts(active, strategy);
  const ranks = new Map(ranked.map((debt, index) => [debt.id, index + 1]));
  const overall = simulatePayoff(active, 0, strategy);

  const items = debts.map((debt): DebtWorkspaceItem => {
    const rank = ranks.get(debt.id) ?? active.length + 1;
    const promotionAtMinimum = analyzePromotion(debt, { now, payPeriodsPerYear, plannedMonthlyPayment: debt.minimum });
    const missingCoreData = debt.balance > 0 && (debt.apr <= 0 || debt.minimum <= 0);
    const promotionNeedsAttention = promotionAtMinimum.status === 'at_risk' || promotionAtMinimum.status === 'expired' || promotionAtMinimum.status === 'needs_higher_payment';
    const targetExtra = rank === 1 && debt.balance > 0 ? Math.max(25, Math.min(250, debt.balance * 0.01)) : 0;
    const recommendedPayment = debt.balance <= 0 ? 0 : Math.max(debt.minimum + targetExtra, promotionAtMinimum.requiredMonthlyPayment || 0);
    const promotion = analyzePromotion(debt, { now, payPeriodsPerYear, plannedMonthlyPayment: recommendedPayment });
    const minimumPlan = simulatePayoff([debt], 0, strategy);
    const recommendedPlan = simulatePayoff([{ ...debt, minimum: recommendedPayment }], 0, strategy);
    const section: DebtSection = debt.balance <= 0 ? 'Paid Off' : missingCoreData || promotionNeedsAttention ? 'Needs Attention' : debt.promotionType !== 'none' ? 'Promotional Interest' : 'Active Payoff';
    const strategyReason = strategy === 'avalanche'
      ? `Your avalanche strategy ranks active balances by their current effective APR; this debt is #${rank}.`
      : `Your snowball strategy ranks active balances by remaining balance; this debt is #${rank}.`;
    const promotionReason = debt.promotionType === 'none'
      ? 'No promotional deadline changes this debt’s priority.'
      : `${promotionStatusLabel(promotionAtMinimum.status)}: the promotion ${promotionAtMinimum.preservesPromotion ? 'is projected to be preserved' : 'needs a higher payment to protect the deadline'}.`;
    const interestBenefit = minimumPlan.paidOff && recommendedPlan.paidOff ? Math.max(0, minimumPlan.totalInterest - recommendedPlan.totalInterest) : 0;
    const monthsBenefit = minimumPlan.paidOff && recommendedPlan.paidOff ? Math.max(0, minimumPlan.months - recommendedPlan.months) : 0;

    return {
      debt,
      section,
      rank,
      priority: debt.balance <= 0 ? 'Complete' : missingCoreData || promotionAtMinimum.status === 'at_risk' || promotionAtMinimum.status === 'expired' ? 'Urgent' : rank === 1 || promotionNeedsAttention ? 'High' : 'Standard',
      effectiveApr: getEffectiveApr(debt, now),
      recommendedPayment,
      payoffDate: recommendedPlan.debtFreeDate,
      minimumPayoffDate: minimumPlan.debtFreeDate,
      estimatedInterest: recommendedPlan.totalInterest,
      minimumInterest: minimumPlan.totalInterest,
      interestBenefit,
      monthsBenefit,
      promotion,
      explanation: [
        missingCoreData ? 'Add the missing APR or minimum payment so the payoff projection can be completed.' : strategyReason,
        promotionReason,
        interestBenefit > 0 || monthsBenefit > 0
          ? `The recommended payment is projected to save about $${Math.round(interestBenefit).toLocaleString()} and ${monthsBenefit} month${monthsBenefit === 1 ? '' : 's'} versus minimum payments.`
          : 'The recommendation protects required payments and keeps the saved strategy order intact.',
      ],
    };
  });

  const sections = Object.fromEntries(sectionOrder.map(section => [section, items.filter(item => item.section === section).sort((a, b) => a.rank - b.rank)])) as Record<DebtSection, DebtWorkspaceItem[]>;
  const attention = sections['Needs Attention'][0];
  const priority = items.filter(item => item.debt.balance > 0).sort((a, b) => a.rank - b.rank)[0];
  const pilotNote = attention
    ? `${attention.debt.name} needs attention: ${attention.explanation[0]}`
    : priority
      ? `Focus your next extra payment on ${priority.debt.name}. ${priority.explanation[0]}`
      : 'You have no active debt balances. Keep protecting the progress you have made.';

  return {
    totalDebt: debts.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0),
    totalMinimums: active.reduce((sum, debt) => sum + Math.max(0, debt.minimum), 0),
    estimatedMonthlyInterest: active.reduce((sum, debt) => sum + debt.balance * getEffectiveApr(debt, now) / 1200, 0),
    debtFreeDate: overall.debtFreeDate,
    strategy,
    pilotNote,
    sections,
  };
}
