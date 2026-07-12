export type ForecastBill = { id: string; name: string; amount: number; dueDay: number; frequency: string };
export type ForecastFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type ForecastEvent = { date: Date; label: string; amount: number; type: 'income' | 'bill'; balance: number };

const cycleDays: Record<ForecastFrequency, number> = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 };

function atMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function billDates(bill: ForecastBill, start: Date, end: Date) {
  const dates: Date[] = [];
  if (bill.frequency === 'weekly') {
    for (let date = addDays(start, 7); date <= end; date = addDays(date, 7)) dates.push(date);
    return dates;
  }

  const monthStep = bill.frequency === 'quarterly' ? 3 : bill.frequency === 'annual' ? 12 : 1;
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(Math.max(1, bill.dueDay), lastDay));
    if (date >= start && date <= end) dates.push(date);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + monthStep, 1);
  }
  return dates;
}

export function buildForecast(input: {
  startingBalance: number;
  payPerCheck: number;
  payFrequency: ForecastFrequency;
  bills: ForecastBill[];
  days?: number;
}) {
  const start = atMidnight(new Date());
  const end = addDays(start, input.days ?? 90);
  const raw: Omit<ForecastEvent, 'balance'>[] = [];

  for (let date = addDays(start, cycleDays[input.payFrequency]); date <= end; date = addDays(date, cycleDays[input.payFrequency])) {
    raw.push({ date, label: 'Paycheck', amount: input.payPerCheck, type: 'income' });
  }

  for (const bill of input.bills) {
    for (const date of billDates(bill, start, end)) raw.push({ date, label: bill.name, amount: -Math.abs(bill.amount), type: 'bill' });
  }

  raw.sort((a, b) => a.date.getTime() - b.date.getTime() || b.amount - a.amount);
  let balance = input.startingBalance;
  const events: ForecastEvent[] = raw.map(event => {
    balance += event.amount;
    return { ...event, balance };
  });

  const lowest = events.reduce((result, event) => event.balance < result.balance ? event : result, { date: start, label: 'Starting balance', amount: 0, type: 'income' as const, balance: input.startingBalance });
  return { events, endingBalance: balance, lowestBalance: lowest.balance, lowestDate: lowest.date };
}
