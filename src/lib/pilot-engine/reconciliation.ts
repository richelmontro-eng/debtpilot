import type { FinancialTimelineSourceEvent } from '../financial-timeline-engine';

export type PaycheckStatus = 'expected' | 'received' | 'received_different_amount' | 'delayed' | 'missed';

export type PaycheckReconciliation = {
  id: string;
  expectedDate: string;
  expectedAmount: number;
  status: PaycheckStatus;
  actualAmount?: number | null;
  confirmedAt?: string | null;
  note?: string | null;
};

export type BalanceReconciliation = {
  id: string;
  calculatedBalance: number;
  confirmedBalance: number;
  variance: number;
  confirmedAt: string;
};

export type PilotReconciliationContext = {
  asOfDate: string;
  paycheckEvents?: readonly PaycheckReconciliation[];
  latestBalance?: BalanceReconciliation | null;
};

export type ReconciliationSummary = {
  effectiveStartingBalance: number;
  startingBalanceSource: 'profile' | 'confirmed';
  startingBalanceConfirmedAt: string | null;
  expectedIncomeTotal: number;
  confirmedIncomeTotal: number;
  overdueUnconfirmedIncome: number;
  unconfirmedPastEvents: number;
  reliesOnExpectedIncome: boolean;
  reconciliationVariance: number | null;
  eventsRequiringReconciliation: PaycheckReconciliation[];
  disclosures: string[];
};

export type ReconciliationConfidence = {
  score: number;
  level: 'high' | 'medium' | 'low';
  reasons: string[];
  lastBalanceConfirmationDate: string | null;
  unconfirmedPastEvents: number;
};

const dayMs = 86_400_000;
const isoDay = (value: string) => value.slice(0, 10);
const daysBetween = (later: string, earlier: string) => Math.max(0, Math.floor((Date.parse(`${isoDay(later)}T00:00:00Z`) - Date.parse(`${isoDay(earlier)}T00:00:00Z`)) / dayMs));

export function confirmPaycheck(event: PaycheckReconciliation, status: PaycheckStatus, actualAmount?: number, confirmedAt = new Date().toISOString(), note?: string): PaycheckReconciliation {
  const amount = status === 'received' ? event.expectedAmount : status === 'received_different_amount' ? Math.max(0, actualAmount ?? 0) : null;
  return { ...event, status, actualAmount: amount, confirmedAt: status === 'expected' ? null : confirmedAt, note: note?.trim() || null };
}

export function expectedPaycheckDrafts(input: { userId: string; firstDate: string; endDate: string; expectedAmount: number; cadence: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' }) {
  const cursor = new Date(`${isoDay(input.firstDate)}T00:00:00Z`);
  const end = new Date(`${isoDay(input.endDate)}T00:00:00Z`);
  const drafts: { user_id: string; expected_date: string; expected_amount: number; status: 'expected' }[] = [];
  while (cursor <= end) {
    drafts.push({ user_id: input.userId, expected_date: cursor.toISOString().slice(0, 10), expected_amount: Math.max(0, input.expectedAmount), status: 'expected' });
    if (input.cadence === 'weekly') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else if (input.cadence === 'biweekly') cursor.setUTCDate(cursor.getUTCDate() + 14);
    else if (input.cadence === 'semimonthly') {
      if (cursor.getUTCDate() < 15) cursor.setUTCDate(15);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    } else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return drafts;
}

export function reconcileCheckingBalance(calculatedBalance: number, confirmedBalance: number, confirmedAt = new Date().toISOString()): BalanceReconciliation {
  return {
    id: `balance-${confirmedAt}`,
    calculatedBalance,
    confirmedBalance,
    variance: Math.round((confirmedBalance - calculatedBalance) * 100) / 100,
    confirmedAt,
  };
}

export function shouldRequestBalanceConfirmation(input: {
  asOfDate: string;
  lastConfirmedAt?: string | null;
  paycheckEvents?: readonly PaycheckReconciliation[];
  majorRecommendation?: boolean;
  manualCheckIn?: boolean;
  reasonableIntervalDays?: number;
}) {
  if (input.manualCheckIn || input.majorRecommendation) return true;
  const interval = input.reasonableIntervalDays ?? 7;
  if (!input.lastConfirmedAt || daysBetween(input.asOfDate, input.lastConfirmedAt) >= interval) return true;
  return (input.paycheckEvents ?? []).some(event => isoDay(event.expectedDate) <= isoDay(input.asOfDate) && ['expected', 'delayed', 'missed', 'received_different_amount'].includes(event.status));
}

export function reconcilePaychecks(
  paychecks: readonly FinancialTimelineSourceEvent[],
  currentStartingBalance: number,
  context?: PilotReconciliationContext,
): { paychecks: FinancialTimelineSourceEvent[]; startingBalance: number; summary: ReconciliationSummary; confidence: ReconciliationConfidence } {
  const asOfDate = isoDay(context?.asOfDate ?? new Date().toISOString());
  const records = context?.paycheckEvents ?? [];
  const byDate = new Map(records.map(record => [isoDay(record.expectedDate), record]));
  let expectedIncomeTotal = 0;
  let confirmedIncomeTotal = 0;
  let overdueUnconfirmedIncome = 0;
  const disclosures: string[] = [];
  const requiring = records.filter(record => isoDay(record.expectedDate) <= asOfDate && (record.status === 'expected' || record.status === 'delayed'));

  const resolved = paychecks.map(paycheck => {
    const record = byDate.get(isoDay(paycheck.date));
    const expectedAmount = Math.max(0, record?.expectedAmount ?? paycheck.amount);
    expectedIncomeTotal += expectedAmount;
    if (!record || record.status === 'expected' || record.status === 'delayed') {
      if (isoDay(paycheck.date) <= asOfDate) {
        overdueUnconfirmedIncome += expectedAmount;
        disclosures.push(`Your ${isoDay(paycheck.date)} paycheck of ${expectedAmount.toFixed(2)} has not been confirmed. This forecast may change.`);
      }
      return { ...paycheck, amount: expectedAmount, metadata: { ...paycheck.metadata, paycheckStatus: record?.status ?? 'expected', incomeConfirmation: 'expected' } };
    }
    if (record.status === 'missed') {
      disclosures.push(`Your ${isoDay(record.expectedDate)} paycheck was marked missed and is not included as income.`);
      return { ...paycheck, amount: 0, metadata: { ...paycheck.metadata, paycheckStatus: record.status, incomeConfirmation: 'confirmed' } };
    }
    const actualAmount = record.status === 'received' ? expectedAmount : Math.max(0, record.actualAmount ?? 0);
    confirmedIncomeTotal += actualAmount;
    if (record.status === 'received_different_amount') disclosures.push(`Your ${isoDay(record.expectedDate)} paycheck is using the confirmed amount of ${actualAmount.toFixed(2)}.`);
    return { ...paycheck, amount: actualAmount, metadata: { ...paycheck.metadata, paycheckStatus: record.status, incomeConfirmation: 'confirmed' } };
  });

  const latestBalance = context?.latestBalance ?? null;
  const age = latestBalance ? daysBetween(asOfDate, latestBalance.confirmedAt) : null;
  let score = 100;
  const reasons: string[] = [];
  if (age === null) { score -= 25; reasons.push('Your checking balance has not been confirmed yet.'); }
  else if (age > 30) { score -= 30; reasons.push(`Your checking balance was last confirmed ${age} days ago.`); }
  else if (age > 7) { score -= 15; reasons.push(`Your checking balance was last confirmed ${age} days ago.`); }
  else reasons.push(`Your checking balance was confirmed ${age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}.`);
  const overdue = requiring.filter(event => event.status === 'expected').length;
  const delayed = records.filter(event => event.status === 'delayed').length;
  const missed = records.filter(event => event.status === 'missed').length;
  const mismatched = records.filter(event => event.status === 'received_different_amount').length;
  if (overdue) { score -= Math.min(40, overdue * 20); reasons.push(`${overdue} expected paycheck${overdue === 1 ? ' has' : 's have'} not been confirmed.`); }
  if (delayed) { score -= Math.min(30, delayed * 15); reasons.push(`${delayed} paycheck${delayed === 1 ? ' is' : 's are'} delayed.`); }
  if (missed) { score -= Math.min(30, missed * 20); reasons.push(`${missed} paycheck${missed === 1 ? ' was' : 's were'} marked missed.`); }
  if (mismatched) { score -= Math.min(20, mismatched * 10); reasons.push(`${mismatched} paycheck amount${mismatched === 1 ? ' differed' : 's differed'} from the expected amount.`); }
  if (expectedIncomeTotal > confirmedIncomeTotal && expectedIncomeTotal > 0) { score -= 10; reasons.push('This forecast relies on expected income.'); }
  score = Math.max(0, score);

  return {
    paychecks: resolved,
    startingBalance: latestBalance?.confirmedBalance ?? currentStartingBalance,
    summary: {
      effectiveStartingBalance: latestBalance?.confirmedBalance ?? currentStartingBalance,
      startingBalanceSource: latestBalance ? 'confirmed' : 'profile',
      startingBalanceConfirmedAt: latestBalance?.confirmedAt ?? null,
      expectedIncomeTotal,
      confirmedIncomeTotal,
      overdueUnconfirmedIncome,
      unconfirmedPastEvents: requiring.length,
      reliesOnExpectedIncome: expectedIncomeTotal > confirmedIncomeTotal,
      reconciliationVariance: latestBalance?.variance ?? null,
      eventsRequiringReconciliation: requiring,
      disclosures,
    },
    confidence: {
      score,
      level: score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low',
      reasons,
      lastBalanceConfirmationDate: latestBalance?.confirmedAt ?? null,
      unconfirmedPastEvents: requiring.length,
    },
  };
}
