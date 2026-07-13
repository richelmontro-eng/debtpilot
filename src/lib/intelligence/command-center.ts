import { getPilotBriefing, type CompletedRecommendation, type PilotFinancialState } from '../pilot';
import { getBriefingSummary, getMissingInformation, getSafeDashboardError, type DashboardBill, type DashboardDebt, type DashboardGoal } from '../dashboard-intelligence';
import { deriveFinancialEvents, groupTimelineEvents } from './events';
import { generatePilotInsights } from './insights';
import type { IntelligenceSnapshot } from './types';

export function buildCommandCenter(input: {
  now: Date;
  cycleDays: number;
  financialState: PilotFinancialState;
  checking: number;
  checkingCushion: number;
  billsReserve: number;
  debts: DashboardDebt[];
  bills: DashboardBill[];
  goals: DashboardGoal[];
  recommendationHistory: CompletedRecommendation[];
  snapshots?: IntelligenceSnapshot[];
}) {
  const pilot = getPilotBriefing(input.financialState);
  const events = deriveFinancialEvents({ now: input.now, cycleDays: input.cycleDays, payPerCheck: input.financialState.payPerCheck, payPeriodsPerYear: input.financialState.payPeriodsPerYear, bills: input.bills, debts: input.debts, goals: input.goals, pulse: pilot.pulse, recommendation: pilot.recommendation, recommendationHistory: input.recommendationHistory });
  return {
    pilot,
    briefing: getBriefingSummary({ pulse: pilot.pulse, safeExtra: input.financialState.safeExtra, availableBeforeCushion: input.financialState.availableBeforeCushion, cushionGap: input.financialState.cushionGap, recommendation: pilot.recommendation }),
    events,
    timeline: groupTimelineEvents(events, input.now),
    insights: generatePilotInsights({ checking: input.checking, checkingCushion: input.checkingCushion, safeExtra: input.financialState.safeExtra, billsReserve: input.billsReserve, payPerCheck: input.financialState.payPerCheck, payPeriodsPerYear: input.financialState.payPeriodsPerYear, debts: input.debts, bills: input.bills, goals: input.goals, recommendation: pilot.recommendation, events, snapshots: input.snapshots }),
    missingInformation: getMissingInformation({ payPerCheck: input.financialState.payPerCheck, checkingCushion: input.checkingCushion, debts: input.debts, bills: input.bills, goals: input.goals }),
    recommendationHistory: events.filter(event => event.type === 'recommendation' && event.status === 'completed').sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
  };
}

export { getSafeDashboardError };
