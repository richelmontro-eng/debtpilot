import { buildPilotForecast } from './forecast';
import { buildFinancialTimeline } from './timeline';
import { reconcilePaychecks } from './reconciliation';
import type { PilotEngineInput, PilotEngineResult } from './types';

export class PilotEngine {
  static simulate(input: PilotEngineInput): PilotEngineResult {
    const reconciled = reconcilePaychecks(input.paychecks ?? [], input.currentCheckingBalance, input.reconciliation);
    const effectiveInput = { ...input, currentCheckingBalance: reconciled.startingBalance, paychecks: reconciled.paychecks };
    return buildPilotForecast(effectiveInput, buildFinancialTimeline(effectiveInput), reconciled);
  }
}

export function simulatePilotForecast(input: PilotEngineInput) { return PilotEngine.simulate(input); }
