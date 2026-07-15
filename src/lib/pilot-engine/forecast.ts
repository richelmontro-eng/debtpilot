import type { FinancialTimelineResult } from '../financial-timeline-engine';
import type { PilotConfidence, PilotEngineInput, PilotEngineResult, PilotRecommendation } from './types';

function recommendations(input: PilotEngineInput, result: FinancialTimelineResult): PilotRecommendation[] {
  const obligation = result.events.find(event => event.obligationAtRisk);
  if (obligation) return [{ id: `cover-${obligation.id}`, priority: 'critical', action: 'cover_shortfall', date: obligation.date.slice(0, 10), eventId: obligation.id, message: `Protect enough checking to cover ${obligation.name}.`, reasoning: 'The projected balance is negative immediately after this required obligation.' }];
  if (result.daysBelowCushion > 0) return [{ id: 'protect-cushion', priority: 'high', action: 'protect_cushion', date: result.summary.firstBelowCushionDate, message: `Keep at least ${input.protectedCheckingCushion.toFixed(2)} in checking through the forecast.`, reasoning: `The projection spends ${result.daysBelowCushion} day${result.daysBelowCushion === 1 ? '' : 's'} below the protected cushion.` }];
  return [{ id: 'maintain-plan', priority: 'low', action: 'maintain_plan', date: null, message: 'The supplied schedule remains above the protected checking cushion.', reasoning: 'Every simulated event remains funded within the projection window.' }];
}

function confidence(input: PilotEngineInput, result: FinancialTimelineResult): PilotConfidence {
  const hasEvents = result.events.length > 0;
  const coversWindow = Boolean(input.startDate && input.endDate);
  return { score: hasEvents && coversWindow ? 100 : 85, level: hasEvents && coversWindow ? 'high' : 'medium', basis: ['All calculations use only supplied dated events.', 'Scenario events are temporary and do not mutate saved inputs.', hasEvents ? `${result.events.length} dated event${result.events.length === 1 ? '' : 's'} supplied.` : 'No dated events were supplied for this window.'] };
}

export function buildPilotForecast(input: PilotEngineInput, result: FinancialTimelineResult): PilotEngineResult {
  return {
    forecast: { ...result.summary, lowestBalance: result.lowestProjectedBalance, daysBelowCushion: result.daysBelowCushion, hasNegativeBalance: result.negativeBalanceEvents.length > 0, recovers: result.summary.recoveryDate !== null },
    timeline: result.events,
    warnings: result.cashFlowWarnings,
    recommendations: recommendations(input, result),
    statistics: { eventCount: result.events.length, incomeEventCount: result.events.filter(event => event.amount > 0).length, outflowEventCount: result.events.filter(event => event.amount < 0).length, requiredEventCount: result.events.filter(event => event.required).length, requiredObligationsAtRisk: result.summary.requiredObligationsAtRisk, totalInflows: result.summary.totalInflows, totalOutflows: result.summary.totalOutflows, netChange: result.summary.netChange },
    confidence: confidence(input, result),
  };
}
