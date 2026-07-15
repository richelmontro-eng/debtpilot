export { createRecurringTimelineEvents } from '../financial-timeline-engine';
export type { FinancialTimelineEventType as PilotEventType, FinancialTimelineSourceEvent as PilotSourceEvent } from '../financial-timeline-engine';

import { createRecurringTimelineEvents, type FinancialTimelineSourceEvent } from '../financial-timeline-engine';

export function createScenarioPaymentSeries(input: { scenarioId: string; name: string; amount: number; firstDate: string; endDate: string; cadence: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' }): FinancialTimelineSourceEvent[] {
  return createRecurringTimelineEvents({ idPrefix: `scenario-${input.scenarioId}`, name: input.name, amount: input.amount, firstDate: input.firstDate, endDate: input.endDate, cadence: input.cadence }).map(event => ({ ...event, scenarioId: input.scenarioId }));
}
