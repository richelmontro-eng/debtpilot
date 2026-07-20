import type { PilotEngineInput, PilotEngineResult } from './types';

export type CashFlowChartPoint = {
  date: string;
  balance: number;
  protectedCushion: number;
};

export type PilotTimelineAnalysis = {
  lowestBalance: number;
  lowestBalanceDate: string;
  projectedEndingBalance: number;
  daysBelowCushion: number;
  belowCushionDates: string[];
  negativeBalanceDates: string[];
  billsAtRisk: { id: string; name: string; date: string }[];
  debtStrategyInterruptions: { id: string; name: string; date: string }[];
  goalDelays: { id: string; name: string; date: string }[];
  billsProtected: boolean;
  debtStrategyPreserved: boolean;
  goalsPreserved: boolean;
  protectedCushionMaintained: boolean;
  chart: CashFlowChartPoint[];
};

const dayMs = 86_400_000;
const iso = (value: Date) => value.toISOString().slice(0, 10);
const parse = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`);
const round = (value: number) => Math.round(value * 100) / 100;

export function analyzePilotTimeline(result: PilotEngineResult, input: Pick<PilotEngineInput, 'startDate' | 'endDate' | 'protectedCheckingCushion'>): PilotTimelineAnalysis {
  const effectiveStart = result.reconciliation.effectiveStartingBalance;
  const chart: CashFlowChartPoint[] = [];
  let current = effectiveStart;
  let eventIndex = 0;
  for (let cursor = parse(input.startDate); cursor <= parse(input.endDate); cursor = new Date(cursor.getTime() + dayMs)) {
    const day = iso(cursor);
    while (eventIndex < result.timeline.length && result.timeline[eventIndex].date.slice(0, 10) === day) current = result.timeline[eventIndex++].projectedBalance;
    chart.push({ date: day, balance: round(current), protectedCushion: input.protectedCheckingCushion });
  }
  const lowest = chart.reduce((best, point) => point.balance < best.balance ? point : best, chart[0] ?? { date: input.startDate, balance: effectiveStart, protectedCushion: input.protectedCheckingCushion });
  const atRisk = (type: 'bill' | 'debt_payment' | 'goal_contribution') => result.timeline
    .filter(event => event.type === type && event.obligationAtRisk)
    .map(event => ({ id: String(event.metadata?.sourceId ?? event.id), name: event.name, date: event.date.slice(0, 10) }));
  const billsAtRisk = atRisk('bill');
  const debtStrategyInterruptions = atRisk('debt_payment');
  const goalDelays = atRisk('goal_contribution');
  const belowCushionDates = chart.filter(point => point.balance < input.protectedCheckingCushion).map(point => point.date);
  const negativeBalanceDates = chart.filter(point => point.balance < 0).map(point => point.date);
  return {
    lowestBalance: round(lowest.balance),
    lowestBalanceDate: lowest.date,
    projectedEndingBalance: round(result.forecast.endingBalance),
    daysBelowCushion: belowCushionDates.length,
    belowCushionDates,
    negativeBalanceDates,
    billsAtRisk,
    debtStrategyInterruptions,
    goalDelays,
    billsProtected: billsAtRisk.length === 0,
    debtStrategyPreserved: debtStrategyInterruptions.length === 0,
    goalsPreserved: goalDelays.length === 0,
    protectedCushionMaintained: belowCushionDates.length === 0,
    chart,
  };
}

export function compareTimelineStrength(left: PilotTimelineAnalysis, right: PilotTimelineAnalysis) {
  const vector = (analysis: PilotTimelineAnalysis) => [
    analysis.negativeBalanceDates.length,
    analysis.billsAtRisk.length + analysis.debtStrategyInterruptions.length + analysis.goalDelays.length,
    analysis.daysBelowCushion,
    -analysis.lowestBalance,
    -analysis.projectedEndingBalance,
  ];
  const a = vector(left), b = vector(right);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

export function isTimelineProtected(analysis: PilotTimelineAnalysis) {
  return analysis.negativeBalanceDates.length === 0
    && analysis.protectedCushionMaintained
    && analysis.billsProtected
    && analysis.debtStrategyPreserved
    && analysis.goalsPreserved;
}
