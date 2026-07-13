export type FinancialEventType = 'income' | 'bill' | 'debt' | 'goal' | 'financial_health' | 'recommendation' | 'purchase_analysis';
export type FinancialEventStatus = 'projected' | 'posted' | 'completed';

export type FinancialEvent = {
  id: string;
  type: FinancialEventType;
  occurredAt: string;
  status: FinancialEventStatus;
  title: string;
  summary: string;
  amount?: number;
  direction?: 'inflow' | 'outflow' | 'neutral';
  sourceId?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type InsightKind = 'Opportunity' | 'Risk' | 'Trend' | 'Achievement' | 'Recommendation';
export type InsightSeverity = 'info' | 'positive' | 'warning' | 'critical';

export type PilotInsight = {
  id: string;
  kind: InsightKind;
  title: string;
  summary: string;
  reasoning: string[];
  confidence: number;
  severity: InsightSeverity;
  suggestedAction: { label: string; href: string };
  estimatedBenefit?: number;
  sourceEventIds: string[];
};

export type IntelligenceSnapshot = { date: string; health: number; netWorth: number; debt: number };

export type TimelineGroup = { label: 'Today' | 'Tomorrow' | 'This Week' | 'Upcoming'; events: FinancialEvent[] };
