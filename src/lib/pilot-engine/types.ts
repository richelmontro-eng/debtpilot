import type { CashFlowWarning, FinancialTimelineInput, FinancialTimelineSummary, ProjectedTimelineEvent } from '../financial-timeline-engine';

export type PilotEngineInput = FinancialTimelineInput;
export type PilotTimelineEvent = ProjectedTimelineEvent;
export type PilotWarning = CashFlowWarning;

export type PilotRecommendation = {
  id: string;
  priority: 'critical' | 'high' | 'low';
  action: 'cover_shortfall' | 'protect_cushion' | 'maintain_plan';
  date: string | null;
  eventId?: string;
  message: string;
  reasoning: string;
};

export type PilotForecast = FinancialTimelineSummary & {
  lowestBalance: number;
  daysBelowCushion: number;
  hasNegativeBalance: boolean;
  recovers: boolean;
};

export type PilotStatistics = {
  eventCount: number;
  incomeEventCount: number;
  outflowEventCount: number;
  requiredEventCount: number;
  requiredObligationsAtRisk: number;
  totalInflows: number;
  totalOutflows: number;
  netChange: number;
};

export type PilotConfidence = {
  score: number;
  level: 'high' | 'medium';
  basis: string[];
};

export type PilotEngineResult = {
  forecast: PilotForecast;
  timeline: PilotTimelineEvent[];
  warnings: PilotWarning[];
  recommendations: PilotRecommendation[];
  statistics: PilotStatistics;
  confidence: PilotConfidence;
};
