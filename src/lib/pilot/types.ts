export type PilotCategory = 'cushion' | 'goal' | 'debt' | 'none';
export type PilotPriority = 'critical' | 'high' | 'medium' | 'low';
export type DebtStrategy = 'avalanche' | 'snowball';

export type PilotDebt = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minimum?: number;
  promotionType?: 'none' | 'zero_percent' | 'deferred_interest';
  promotionalApr?: number;
  promotionEndDate?: string | null;
  postPromotionApr?: number;
  originalPromotionalBalance?: number;
  estimatedDeferredInterest?: number;
};

export type PilotGoal = {
  id: string;
  name: string;
  goalType: string;
  targetAmount: number;
  currentAmount: number;
  priority: number;
};

export type PilotBill = {
  id: string;
  name: string;
  amount: number;
  dueInDays: number;
  frequency: string;
};

export type PilotFinancialState = {
  availableBeforeCushion: number;
  cushionGap: number;
  safeExtra: number;
  monthlyIncome: number;
  payPerCheck: number;
  monthlyMinimums: number;
  checking: number;
  checkingCushion: number;
  strategy: DebtStrategy;
  debts: PilotDebt[];
  goals: PilotGoal[];
  billsDueSoon: PilotBill[];
  payPeriodsPerYear?: number;
};

export type RecommendationAction = {
  category: PilotCategory;
  amount: number;
  targetId?: string;
};

export type Recommendation = {
  title: string;
  description: string;
  category: PilotCategory;
  priority: PilotPriority;
  confidence: number;
  estimatedBenefit: number;
  reasoning: string[];
  action: RecommendationAction;
};

export type FinancialPulse = {
  score: number;
  label: 'Strong' | 'Stable' | 'Watch' | 'At risk';
  explanation: string[];
};

export type FinancialInboxItem = {
  id: string;
  title: string;
  description: string;
  amount?: number;
  urgency: 'now' | 'soon' | 'planned';
};

export type PilotBriefing = {
  recommendation: Recommendation;
  pulse: FinancialPulse;
  inbox: FinancialInboxItem[];
  recentWins: string[];
};

export type CompletedRecommendation = {
  id: string;
  recommendationId: string;
  title: string;
  category: PilotCategory;
  confidence: number;
  estimatedBenefit: number;
  reasoning: string[];
  completedAt: string;
};
