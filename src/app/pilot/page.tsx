'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bot, CalendarClock, CheckCircle2, CircleDollarSign, ShieldAlert, Sparkles, Target, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
type Debt = { id: string; name: string; balance: number; apr: number; minimum: number };
type Bill = { id: string; name: string; amount: number; dueDay: number; frequency: string };
type Goal = { id: string; name: string; goalType: string; target: number; current: number; priority: number };
type Snapshot = { date: string; assets: number; debt: number; netWorth: number; health: number };
type Profile = { display_name?: string | null; pay_frequency?: string | null; weekly_take_home?: number | string | null; checking_balance?: number | string | null; savings_balance?: number | string | null; checking_cushion?: number | string | null; weekly_living_reserve?: number | string | null; preferred_strategy?: string | null };

type Focus = {
  title: string;
  amount?: number;
  reason: string;
  href: string;
  action: string;
  confidence: number;
};

const paySchedules: Record<PayFrequency, { periods: number; cycleDays: number; label: string }> = {
  weekly: { periods: 52, cycleDays: 7, label: 'weekly' },
  biweekly: { periods: 26, cycleDays: 14, label: 'biweekly' },
  semimonthly: { periods: 24, cycleDays: 15, label: 'semi-monthly' },
  monthly: { periods: 12, cycleDays: 30, label: 'monthly' },
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function daysUntilDue(dueDay: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let due = new Date(today.getFullYear(), today.getMonth(), Math.min(dueDay, lastThisMonth));
  if (due < start) {
    const lastNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
    due = new Date(today.getFullYear(), today.getMonth() + 1, Math.min(dueDay, lastNextMonth));
  }
  return Math.ceil((due.getTime() - start.getTime()) / 86400000);
}

export default function PilotPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setMessage('Supabase is not configured.');
      setLoading(false);
      return;
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.assign('/login');
        return;
      }

      const [{ data: p, error: pe }, { data: d, error: de }, { data: b, error: be }, { data: g, error: ge }, { data: s, error: se }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('*').eq('user_id', user.id),
        supabase.from('bills').select('*').eq('user_id', user.id),
        supabase.from('goals').select('*').eq('user_id', user.id),
        supabase.from('financial_snapshots').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: true }),
      ]);

      const error = pe || de || be || ge || se;
      if (error) setMessage(`Load failed: ${error.message}`);
      setProfile(p);
      setDebts((d ?? []).map(row => ({ id: row.id, name: row.name, balance: Number(row.balance), apr: Number(row.apr), minimum: Number(row.minimum_payment) })));
      setBills((b ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' })));
      setGoals((g ?? []).map(row => ({ id: row.id, name: row.name, goalType: row.goal_type, target: Number(row.target_amount), current: Number(row.current_amount), priority: Number(row.priority) })));
      setSnapshots((s ?? []).map(row => ({ date: row.snapshot_date, assets: Number(row.total_assets), debt: Number(row.total_debt), netWorth: Number(row.net_worth), health: Number(row.financial_health) })));
      setLoading(false);
    })();
  }, []);

  const review = useMemo(() => {
    const savedFrequency = profile?.pay_frequency as PayFrequency | undefined;
    const frequency = savedFrequency && paySchedules[savedFrequency] ? savedFrequency : 'weekly';
    const schedule = paySchedules[frequency];
    const payPerCheck = Number(profile?.weekly_take_home ?? 0);
    const checking = Number(profile?.checking_balance ?? 0);
    const savings = Number(profile?.savings_balance ?? 0);
    const cushion = Number(profile?.checking_cushion ?? 0);
    const livingPerCheck = Number(profile?.weekly_living_reserve ?? 0);
    const strategy = profile?.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche';
    const monthlyIncome = payPerCheck * schedule.periods / 12;
    const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
    const monthlyMinimums = debts.reduce((sum, debt) => sum + debt.minimum, 0);
    const minimumReserve = monthlyMinimums * 12 / schedule.periods;
    const dueSoon = bills
      .filter(bill => bill.frequency === 'weekly' || daysUntilDue(bill.dueDay) <= schedule.cycleDays)
      .sort((a, b) => daysUntilDue(a.dueDay) - daysUntilDue(b.dueDay));
    const billReserve = dueSoon.reduce((sum, bill) => sum + bill.amount, 0);
    const cushionShortfall = Math.max(0, cushion - checking);
    const safeExtra = Math.max(0, payPerCheck - livingPerCheck - minimumReserve - billReserve - cushionShortfall);
    const unfinishedGoals = goals.filter(goal => goal.current < goal.target).sort((a, b) => a.priority - b.priority || (a.target - a.current) - (b.target - b.current));
    const emergency = unfinishedGoals.find(goal => goal.goalType === 'emergency_fund');
    const rankedDebts = [...debts].filter(debt => debt.balance > 0).sort((a, b) => strategy === 'snowball' ? a.balance - b.balance || b.apr - a.apr : b.apr - a.apr || a.balance - b.balance);
    const debtTarget = rankedDebts[0];
    const topGoal = unfinishedGoals[0];

    let focus: Focus;
    if (cushionShortfall > 0) {
      focus = {
        title: 'Restore your checking cushion',
        amount: Math.min(payPerCheck, cushionShortfall),
        reason: `Your available checking balance is ${money.format(cushionShortfall)} below the protected minimum you selected.`,
        href: '/',
        action: 'Review paycheck plan',
        confidence: 98,
      };
    } else if (emergency && emergency.priority === 1 && emergency.current < Math.min(1000, emergency.target) && safeExtra > 0) {
      focus = {
        title: `Build ${emergency.name}`,
        amount: Math.min(safeExtra, Math.min(1000, emergency.target) - emergency.current),
        reason: 'A high-priority starter emergency reserve reduces the chance that an unexpected expense returns to a credit card.',
        href: '/goals',
        action: 'Open goals',
        confidence: 95,
      };
    } else if (debtTarget && safeExtra > 0) {
      focus = {
        title: `Pay extra toward ${debtTarget.name}`,
        amount: safeExtra,
        reason: strategy === 'snowball'
          ? `${debtTarget.name} has the smallest remaining balance under your snowball strategy.`
          : `${debtTarget.name} has the highest APR at ${debtTarget.apr.toFixed(2)}% under your avalanche strategy.`,
        href: '/payoff',
        action: 'Open payoff planner',
        confidence: dueSoon.length ? 94 : 90,
      };
    } else if (topGoal && safeExtra > 0) {
      focus = {
        title: `Contribute to ${topGoal.name}`,
        amount: Math.min(safeExtra, topGoal.target - topGoal.current),
        reason: 'Required bills, living money, minimum payments, and your checking cushion are already protected.',
        href: '/goals',
        action: 'Open goals',
        confidence: 88,
      };
    } else {
      focus = {
        title: 'Protect cash and review the next cycle',
        reason: 'No safe extra amount is currently available after the obligations and protections in your saved plan.',
        href: '/forecast',
        action: 'Review cash flow',
        confidence: 96,
      };
    }

    const latest = snapshots.at(-1);
    const previous = snapshots.length > 1 ? snapshots.at(-2) : undefined;
    const changes = latest && previous ? {
      netWorth: latest.netWorth - previous.netWorth,
      debt: latest.debt - previous.debt,
      health: latest.health - previous.health,
    } : null;

    const monthlyBills = bills.reduce((sum, bill) => {
      if (bill.frequency === 'weekly') return sum + bill.amount * 52 / 12;
      if (bill.frequency === 'quarterly') return sum + bill.amount / 3;
      if (bill.frequency === 'annual') return sum + bill.amount / 12;
      return sum + bill.amount;
    }, 0);
    const monthlyLiving = livingPerCheck * schedule.periods / 12;
    const monthlySurplus = monthlyIncome - monthlyBills - monthlyMinimums - monthlyLiving;
    const emergencyMonths = (checking + savings) / Math.max(1, monthlyBills + monthlyMinimums + monthlyLiving);

    return { schedule, checking, cushion, totalDebt, dueSoon, billReserve, safeExtra, focus, changes, monthlySurplus, emergencyMonths, topGoal, monthlyIncome };
  }, [profile, debts, bills, goals, snapshots]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Pilot is reviewing your finances…</main>;

  const greeting = profile?.display_name ? `${profile.display_name}, here is your weekly review.` : 'Here is your weekly financial review.';

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Bot size={16}/> Pilot advisor</div>
      <h1 className="text-4xl font-semibold">{greeting}</h1>
      <p className="mt-3 max-w-3xl text-slate-400">Pilot turns the calculations already inside DebtPilot into a prioritized, explainable action plan. It does not invent balances, payments, or projections.</p>
    </header>

    {message && <p className="mb-6 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{message}</p>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<CircleDollarSign/>} label="Safe extra this check" value={money.format(review.safeExtra)} accent/>
      <Metric icon={<CalendarClock/>} label={`Bills before next ${review.schedule.label} check`} value={money.format(review.billReserve)}/>
      <Metric icon={<TrendingUp/>} label="Monthly surplus" value={money.format(review.monthlySurplus)}/>
      <Metric icon={<ShieldAlert/>} label="Cash reserve" value={`${review.emergencyMonths.toFixed(1)} months`}/>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-3xl border border-cyan-400/25 bg-cyan-400/10 p-6">
        <div className="flex items-center gap-2 text-cyan-300"><Sparkles size={19}/><p className="text-xs font-semibold uppercase tracking-[0.2em]">This week’s focus</p></div>
        <h2 className="mt-4 text-3xl font-semibold">{review.focus.title}</h2>
        {review.focus.amount !== undefined && <p className="mt-3 text-5xl font-semibold text-cyan-300">{money.format(review.focus.amount)}</p>}
        <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300">{review.focus.reason}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs uppercase tracking-widest text-slate-500">Recommendation confidence</p><p className="mt-1 text-2xl font-semibold">{review.focus.confidence}%</p></div>
          <Link href={review.focus.href} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950">{review.focus.action}<ArrowRight size={17}/></Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Progress since your prior snapshot</h2>
        <div className="mt-5 space-y-4">
          {review.changes ? <>
            <ReviewLine positive={review.changes.netWorth >= 0} text={`Net worth ${review.changes.netWorth >= 0 ? 'increased' : 'decreased'} by ${money.format(Math.abs(review.changes.netWorth))}.`}/>
            <ReviewLine positive={review.changes.debt <= 0} text={`Debt ${review.changes.debt <= 0 ? 'decreased' : 'increased'} by ${money.format(Math.abs(review.changes.debt))}.`}/>
            <ReviewLine positive={review.changes.health >= 0} text={`Financial health moved ${review.changes.health >= 0 ? 'up' : 'down'} ${Math.abs(review.changes.health)} point${Math.abs(review.changes.health) === 1 ? '' : 's'}.`}/>
          </> : <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm leading-6 text-slate-500">Save snapshots on at least two different dates to unlock progress comparisons.</p>}
        </div>
      </div>
    </section>

    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Upcoming obligations</h2>
        <div className="mt-5 space-y-3">
          {review.dueSoon.length ? review.dueSoon.slice(0, 6).map(bill => <div key={bill.id} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><div><p className="font-medium">{bill.name}</p><p className="mt-1 text-xs text-slate-500">{bill.frequency === 'weekly' ? 'Recurring this week' : `Due in ${daysUntilDue(bill.dueDay)} day(s)`}</p></div><p className="font-semibold">{money.format(bill.amount)}</p></div>) : <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No saved bills fall before the next paycheck.</p>}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Pilot observations</h2>
        <div className="mt-5 space-y-4">
          <ReviewLine positive={review.checking >= review.cushion} text={review.checking >= review.cushion ? 'Your protected checking cushion is funded.' : `Checking is ${money.format(review.cushion - review.checking)} below your protected cushion.`}/>
          <ReviewLine positive={review.monthlySurplus >= 0} text={review.monthlySurplus >= 0 ? `Your saved plan leaves an estimated ${money.format(review.monthlySurplus)} monthly surplus.` : `Your current saved plan is short by approximately ${money.format(Math.abs(review.monthlySurplus))} per month.`}/>
          <ReviewLine positive={review.emergencyMonths >= 1} text={`Checking plus savings cover approximately ${review.emergencyMonths.toFixed(1)} months of modeled expenses.`}/>
          <ReviewLine positive={review.totalDebt === 0} text={review.totalDebt === 0 ? 'No outstanding debt balances are saved.' : `Your saved debt balances total ${money.format(review.totalDebt)}.`}/>
          {review.topGoal && <ReviewLine positive={false} text={`${money.format(review.topGoal.target - review.topGoal.current)} remains on your highest-priority unfinished goal: ${review.topGoal.name}.`}/>} 
        </div>
      </div>
    </section>

    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-semibold">Explore the recommendation</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <QuickLink href="/what-if" title="Test a change" text="Model a raise, bonus, new expense, missed paycheck, or extra debt payment without changing your saved plan."/>
        <QuickLink href="/vehicles" title="Evaluate a vehicle" text="Measure payment, ownership cost, emergency-fund impact, and readiness using your saved finances."/>
        <QuickLink href="/insights" title="Save a snapshot" text="Capture today’s net worth, debt, and health so Pilot can compare your progress over time."/>
      </div>
    </section>

    <p className="mt-6 text-xs leading-5 text-slate-500">Pilot v1 is a deterministic coaching layer built from your saved data and DebtPilot’s calculation engines. It is educational planning support, not individualized professional financial advice.</p>
  </div></main>;
}

function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
}

function ReviewLine({ positive, text }: { positive: boolean; text: string }) {
  return <div className="flex gap-3 text-sm leading-6 text-slate-300"><CheckCircle2 className={`mt-0.5 shrink-0 ${positive ? 'text-emerald-300' : 'text-amber-300'}`} size={18}/><p>{text}</p></div>;
}

function QuickLink({ href, title, text }: { href: string; title: string; text: string }) {
  return <Link href={href} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition hover:border-cyan-400/30"><div className="flex items-center gap-2 text-cyan-300"><Target size={17}/><h3 className="font-semibold">{title}</h3></div><p className="mt-3 text-sm leading-6 text-slate-400">{text}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-cyan-300">Open<ArrowRight size={15}/></span></Link>;
}
