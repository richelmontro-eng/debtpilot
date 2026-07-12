export type ForecastBill = { id: string; name: string; amount: number; dueDay: number; frequency: string };
export type ForecastFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type ForecastEvent = { date: Date; label: string; amount: number; type: 'income' | 'bill'; balance: number };

function atMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function payDates(frequency: ForecastFrequency, start: Date, end: Date) {
  const dates: Date[] = [];
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const days = frequency === 'weekly' ? 7 : 14;
    for (let date = addDays(start, days); date <= end; date = addDays(date, days)) dates.push(date);
    return dates;
  }

  if (frequency === 'monthly') {
    const anchorDay = start.getDate();
    for (let offset = 1; ; offset += 1) {
      const lastDay = new Date(start.getFullYear(), start.getMonth() + offset + 1, 0).getDate();
      const date = new Date(start.getFullYear(), start.getMonth() + offset, Math.min(anchorDay, lastDay));
      if (date > end) break;
      dates.push(date);
    }
    return dates;
  }

  // Semimonthly pay occurs twice per calendar month and must not drift like a 15-day cycle.
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (const day of [15, lastDay]) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), day);
      if (date > start && date <= end) dates.push(date);
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return dates;
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
  startDate?: Date;
}) {
  const start = atMidnight(input.startDate ?? new Date());
  const end = addDays(start, input.days ?? 90);
  const raw: Omit<ForecastEvent, 'balance'>[] = [];

  for (const date of payDates(input.payFrequency, start, end)) {
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
