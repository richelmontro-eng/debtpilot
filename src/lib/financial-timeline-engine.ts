export type FinancialTimelineEventType = 'bill' | 'paycheck' | 'debt_payment' | 'goal_contribution' | 'scheduled_transaction' | 'scenario_transaction';

export type FinancialTimelineSourceEvent = {
  id: string;
  name: string;
  date: string;
  amount: number;
  required?: boolean;
  sequence?: number;
  scenarioId?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type FinancialTimelineInput = {
  startDate: string;
  endDate: string;
  currentCheckingBalance: number;
  protectedCheckingCushion: number;
  bills?: readonly FinancialTimelineSourceEvent[];
  paychecks?: readonly FinancialTimelineSourceEvent[];
  debtPayments?: readonly FinancialTimelineSourceEvent[];
  goalContributions?: readonly FinancialTimelineSourceEvent[];
  scheduledTransactions?: readonly FinancialTimelineSourceEvent[];
  scenarioTransactions?: readonly FinancialTimelineSourceEvent[];
  excludedScenarioIds?: readonly string[];
};

export type ProjectedTimelineEvent = FinancialTimelineSourceEvent & {
  type: FinancialTimelineEventType;
  balanceBefore: number;
  projectedBalance: number;
  belowCushion: boolean;
  negativeBalance: boolean;
  obligationAtRisk: boolean;
};

export type CashFlowWarning = {
  id: string;
  type: 'below_cushion' | 'negative_balance' | 'obligation_at_risk' | 'recovery';
  severity: 'warning' | 'critical' | 'info';
  date: string;
  eventId?: string;
  message: string;
};

export type FinancialTimelineSummary = {
  startDate: string;
  endDate: string;
  startingBalance: number;
  endingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  netChange: number;
  eventCount: number;
  requiredObligationsAtRisk: number;
  firstBelowCushionDate: string | null;
  firstNegativeDate: string | null;
  recoveryDate: string | null;
  recoversAfterNextPaycheck: boolean;
};

export type FinancialTimelineResult = {
  events: ProjectedTimelineEvent[];
  lowestProjectedBalance: number;
  daysBelowCushion: number;
  negativeBalanceEvents: ProjectedTimelineEvent[];
  cashFlowWarnings: CashFlowWarning[];
  summary: FinancialTimelineSummary;
};

const dayMs = 86_400_000;

function parseDate(value: string, label: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid ISO date.`);
  return date;
}

function isoDay(date: Date) { return date.toISOString().slice(0, 10); }
function finite(value: number, label: string) { if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`); return value; }

function typed(input: FinancialTimelineInput) {
  let inputOrder = 0;
  const add = (events: readonly FinancialTimelineSourceEvent[] | undefined, type: FinancialTimelineEventType) => (events ?? []).map(event => ({ ...event, type, inputOrder: inputOrder++ }));
  return [
    ...add(input.paychecks, 'paycheck'),
    ...add(input.bills, 'bill'),
    ...add(input.debtPayments, 'debt_payment'),
    ...add(input.goalContributions, 'goal_contribution'),
    ...add(input.scheduledTransactions, 'scheduled_transaction'),
    ...add(input.scenarioTransactions, 'scenario_transaction'),
  ];
}

export class FinancialTimelineEngine {
  static simulate(input: FinancialTimelineInput): FinancialTimelineResult {
    const start = parseDate(input.startDate, 'startDate');
    const end = parseDate(input.endDate, 'endDate');
    if (end < start) throw new Error('endDate must be on or after startDate.');
    const startingBalance = finite(input.currentCheckingBalance, 'currentCheckingBalance');
    const cushion = Math.max(0, finite(input.protectedCheckingCushion, 'protectedCheckingCushion'));
    const excluded = new Set(input.excludedScenarioIds ?? []);
    const source = typed(input)
      .filter(event => !event.scenarioId || !excluded.has(event.scenarioId))
      .map(event => ({ ...event, parsedDate: parseDate(event.date, `Event ${event.id} date`), amount: finite(event.amount, `Event ${event.id} amount`) }))
      .filter(event => event.parsedDate >= start && event.parsedDate <= end)
      .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime() || (a.sequence ?? a.inputOrder) - (b.sequence ?? b.inputOrder) || a.id.localeCompare(b.id));

    let balance = startingBalance;
    let lowest = startingBalance;
    const events: ProjectedTimelineEvent[] = source.map(item => {
      const { parsedDate, inputOrder, ...event } = item;
      void parsedDate; void inputOrder;
      const balanceBefore = balance;
      balance += event.amount;
      lowest = Math.min(lowest, balance);
      return { ...event, balanceBefore, projectedBalance: balance, belowCushion: balance < cushion, negativeBalance: balance < 0, obligationAtRisk: Boolean(event.required && event.amount < 0 && balance < 0) };
    });

    const dayBalances = new Map<string, number>();
    let dayBalance = startingBalance;
    let eventIndex = 0;
    for (let time = start.getTime(); time <= end.getTime(); time += dayMs) {
      const day = isoDay(new Date(time));
      while (eventIndex < events.length && isoDay(parseDate(events[eventIndex].date, `Event ${events[eventIndex].id} date`)) === day) { dayBalance = events[eventIndex].projectedBalance; eventIndex += 1; }
      dayBalances.set(day, dayBalance);
    }
    const daysBelowCushion = [...dayBalances.values()].filter(value => value < cushion).length;
    const negativeBalanceEvents = events.filter(event => event.negativeBalance);
    const firstBelow = [...dayBalances].find(([, value]) => value < cushion)?.[0] ?? null;
    const firstNegative = events.find(event => event.negativeBalance)?.date.slice(0, 10) ?? null;
    const firstShortfallIndex = events.findIndex(event => event.belowCushion);
    const nextPaycheck = firstShortfallIndex >= 0 ? events.slice(firstShortfallIndex + 1).find(event => event.type === 'paycheck') : undefined;
    const recovery = firstShortfallIndex >= 0 ? events.slice(firstShortfallIndex + 1).find(event => event.projectedBalance >= cushion) : undefined;
    const recoversAfterNextPaycheck = Boolean(nextPaycheck && nextPaycheck.projectedBalance >= cushion);
    const warnings: CashFlowWarning[] = [];
    if (firstBelow) warnings.push({ id: `below-cushion-${firstBelow}`, type: 'below_cushion', severity: 'warning', date: firstBelow, message: `Projected checking falls below the protected cushion of ${cushion.toFixed(2)}.` });
    for (const event of negativeBalanceEvents) warnings.push({ id: `negative-${event.id}`, type: 'negative_balance', severity: 'critical', date: event.date, eventId: event.id, message: `${event.name} leaves projected checking below zero.` });
    for (const event of events.filter(item => item.obligationAtRisk)) warnings.push({ id: `obligation-${event.id}`, type: 'obligation_at_risk', severity: 'critical', date: event.date, eventId: event.id, message: `${event.name} may not be covered by projected checking.` });
    if (recovery) warnings.push({ id: `recovery-${recovery.id}`, type: 'recovery', severity: 'info', date: recovery.date, eventId: recovery.id, message: `Projected checking recovers to the protected cushion after ${recovery.name}.` });

    const totalInflows = events.reduce((sum, event) => sum + Math.max(0, event.amount), 0);
    const totalOutflows = events.reduce((sum, event) => sum + Math.abs(Math.min(0, event.amount)), 0);
    return {
      events,
      lowestProjectedBalance: lowest,
      daysBelowCushion,
      negativeBalanceEvents,
      cashFlowWarnings: warnings,
      summary: {
        startDate: isoDay(start), endDate: isoDay(end), startingBalance, endingBalance: balance, totalInflows, totalOutflows,
        netChange: totalInflows - totalOutflows, eventCount: events.length, requiredObligationsAtRisk: events.filter(event => event.obligationAtRisk).length,
        firstBelowCushionDate: firstBelow, firstNegativeDate: firstNegative, recoveryDate: recovery?.date.slice(0, 10) ?? null, recoversAfterNextPaycheck,
      },
    };
  }
}

export function createRecurringTimelineEvents(input: { idPrefix: string; name: string; amount: number; firstDate: string; endDate: string; cadence: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'; required?: boolean }): FinancialTimelineSourceEvent[] {
  const first = parseDate(input.firstDate, 'firstDate');
  const end = parseDate(input.endDate, 'endDate');
  const events: FinancialTimelineSourceEvent[] = [];
  const cursor = new Date(first);
  let index = 0;
  while (cursor <= end) {
    events.push({ id: `${input.idPrefix}-${index + 1}`, name: input.name, amount: input.amount, date: isoDay(cursor), required: input.required });
    index += 1;
    if (input.cadence === 'weekly') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else if (input.cadence === 'biweekly') cursor.setUTCDate(cursor.getUTCDate() + 14);
    else if (input.cadence === 'semimonthly') {
      if (cursor.getUTCDate() < 15) cursor.setUTCDate(15);
      else { cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1); }
    } else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return events;
}
