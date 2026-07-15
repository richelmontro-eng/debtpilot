import { buildPilotForecast } from './forecast';
import { buildFinancialTimeline } from './timeline';
import type { PilotEngineInput, PilotEngineResult } from './types';

export class PilotEngine {
  static simulate(input: PilotEngineInput): PilotEngineResult {
    return buildPilotForecast(input, buildFinancialTimeline(input));
  }
}

export function simulatePilotForecast(input: PilotEngineInput) { return PilotEngine.simulate(input); }
