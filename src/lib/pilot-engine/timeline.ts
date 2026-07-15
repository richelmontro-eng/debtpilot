import { FinancialTimelineEngine, type FinancialTimelineResult } from '../financial-timeline-engine';
import type { PilotEngineInput } from './types';

export function buildFinancialTimeline(input: PilotEngineInput): FinancialTimelineResult {
  return FinancialTimelineEngine.simulate(input);
}
