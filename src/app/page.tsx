'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowRight, Bot, CircleDollarSign, CreditCard, Plus, ReceiptText, Sparkles, Target, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Debt = { name: string; balance: number; apr: number; minimum: number };
type Bill = { name: string; amount: number; dueDay: number; frequency: string };
type Goal = { name: string; goalType: string; target: number; current: number; priority: number };
type Snapshot = { netWorth: number; totalDebt: number; health: number };
type Transaction = { type: string; amount: number; postedAt: string | null };
type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

type Profile = {
  display_name?: string | null;
  pay_frequency?: PayFrequency;
  weekly_take_home?: number;
  checking_balance?: number;
  savings_balance?: number;
  checking_cushion?: number;
  weekly_living_reserve?: number;
  preferred_strategy?: string;
  investment_balance?: number;
  other_assets?: number;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const schedules: Record<PayFrequency, { label: string; periods: number; days: number }> = {
  weekly: { label: 'Weekly', periods: 52, days: 7 },
  biweekly: { label: 'Every 2 weeks', periods: 26, days: 14 },
  semimonthly: { label: 'Twice monthly', periods: 24, days: 15 },
  monthly: { label: 'Monthly', periods: 12, days: 30 },
};

function daysUntilDue(dueDay: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let due = new Date(today.getFullYear(), today.getMonth(), Math.min(dueDay, endOfMonth));
  if (due < start) {
    const nextEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
    due = new Date(today.getFullYear(), today.getMonth() + 1, Math.min(dueDay, nextEnd));
  }
  return Math.ceil((due.getTime() - start.getTime()) / 86400000);
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [profile, setProfile] = useState<Profile>({});
  const [debts, setDebts] = useState<Debt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setNotice('Supabase is not configured.'); setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const [p, d, b, g, s, t] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('name,balance,apr,minimum_payment').eq('user_id', user.id),
        supabase.from('bills').select('name,amount,due_day,frequency').eq('user_id', user.id),
        supabase.from('goals').select('name,goal_type,target_amount,current_amount,priority').eq('user_id', user.id),
        supabase.from('financial_snapshots').select('net_worth,total_debt,financial_health').eq('user_id', user.id).order('snapshot_date', { ascending: true }),
        supabase.from('transactions').select('transaction_type,amount,posted_at').eq('user_id', user.id).order('transaction_date', { ascending: false }).limit(20),
      ]);
      const error = p.error || d.error || b.error || g.error || s.error || t.error;
      if (error) setNotice(`Load failed: ${error.message}`);
      setProfile((p.data ?? {}) as Profile);
      setDebts((d.data ?? []).map(row => ({ name: row.name, balance: Number(row.balance), apr: Number(row.apr), minimum: Number(row.minimum_payment) })));
      setBills((b.data ?? []).map(row => ({ name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' })));
      setGoals((g.data ?? []).map(row => ({ name: row.name, goalType: row.goal_type, target: Number(row.target_amount), current: Number(row.current_amount), priority: Number(row.priority) })));
      setSnapshots((s.data ?? []).map(row => ({ netWorth: Number(row.net_worth), totalDebt: Number(row.total_debt), health: Number(row.financial_health) })));
      setTransactions((t.data ?? []).map(row => ({ type: row.transaction_type, amount: Number(row.amount), postedAt: row.posted_at })));
      setLoading(false);
    })();
  }, [router]);

  const frequency = schedules[profile.pay_frequency ?? 'weekly'] ?? schedules.weekly;
  const pay = Number(profile.weekly_take_home ?? 0);
  const checking = Number(profile.checking_balance ?? 0);
  const savings = Number(profile.savings_balance ?? 0);
  const cushion = Number(profile.checking_cushion ?? 0);
  const livingReserve = Number(profile.weekly_living_reserve ?? 0);
  const monthlyIncome = pay * frequency.periods / 12;
  const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const minimumsPerCheck = debts.reduce((sum, debt) => sum + debt.minimum, 0) * 12 / frequency.periods;
  const billsDueSoon = bills.filter(bill => bill.frequency === 'weekly' || daysUntilDue(bill.dueDay) <= frequency.days).sort((a, b) => daysUntilDue(a.dueDay) - daysUntilDue(b.dueDay));
  const billsReserve = billsDueSoon.reduce((sum, bill) => sum + bill.amount, 0);
  const available = Math.max(0, pay - livingReserve - minimumsPerCheck - billsReserve);
  const safeExtra = Math.max(0, available - Math.max(0, cushion - checking));
  const totalAssets = checking + savings + Number(profile.investment_balance ?? 0) + Number(profile.other_assets ?? 0);
  const netWorth = totalAssets - totalDebt;
  const latest = snapshots.at(-1);
  const previous = snapshots.length > 1 ? snapshots.at(-2) : undefined;
  const health = latest?.health ?? Math.max(0, Math.min(100, Math.round(55 + (checking >= cushion ? 15 : -15) + (safeExtra > 0 ? 15 : 0) - (monthlyIncome ? totalDebt / (monthlyIncome * 12) * 15 : 15))));
  const netWorthChange = latest && previous ? latest.netWorth - previous.netWorth : 0;
  const debtChange = latest && previous ? latest.totalDebt - previous.totalDebt : 0;
  const strategy = profile.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche';
  const targetDebt = [...debts].filter(debt => debt.balance > 0).sort((a, b) => strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance)[0];
  const unfinishedGoals = [...goals].filter(goal => goal.current < goal.target).sort((a, b) => a.priority - b.priority || (a.target - a.current) - (b.target - b.current));
  const topGoal = unfinishedGoals[0];
  const emergency = unfinishedGoals.find(goal => goal.goalType === 'emergency_fund');

  const recommendation = useMemo(() => {
    const gap = Math.max(0, cushion - checking);
    if (gap > 0) return { title: `Restore ${money.format(Math.min(available, gap))} to checking`, reason: `Your checking balance is ${money.format(gap)} below the protected cushion.`, confidence: 98 };
    if (safeExtra <= 0) return { title: 'Protect this paycheck for essentials', reason: 'Bills, living costs, and minimum payments currently use the available paycheck.', confidence: 94 };
    if (emergency && emergency.current < Math.min(emergency.target, Math.max(1000, monthlyIncome))) return { title: `Add ${money.format(Math.min(safeExtra, emergency.target - emergency.current))} to ${emergency.name}`, reason: 'A stronger emergency reserve reduces the chance that an unexpected cost creates new debt.', confidence: 93 };
    if (targetDebt) return { title: `Pay ${money.format(Math.min(safeExtra, targetDebt.balance))} toward ${targetDebt.name}`, reason: strategy === 'avalanche' ? `${targetDebt.name} has the highest APR at ${targetDebt.apr.toFixed(2)}%.` : `${targetDebt.name} has the smallest remaining balance.`, confidence: targetDebt.apr >= 20 ? 97 : 91 };
    if (topGoal) return { title: `Add ${money.format(Math.min(safeExtra, topGoal.target - topGoal.current))} to ${topGoal.name}`, reason: 'This is your highest-priority unfinished goal.', confidence: 88 };
    return { title: 'Your required cash is protected', reason: 'Add a debt or goal to unlock a more specific next action.', confidence: 78 };
  }, [available, checking, cushion, emergency, monthlyIncome, safeExtra, strategy, targetDebt, topGoal]);

  const pulse = checking < cushion || available <= 0 ? 'Needs attention' : safeExtra > pay * 0.1 ? 'Strong' : 'Stable';
  const pulseStyle = pulse === 'Strong' ? 'border-emerald-400/30 bg-emerald-400/10' : pulse === 'Stable' ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-amber-400/30 bg-amber-400/10';
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const timeline = [...billsDueSoon.map(bill => ({ label: bill.name, days: bill.frequency === 'weekly' ? 0 : daysUntilDue(bill.dueDay), amount: -bill.amount })), { label: 'Next paycheck', days: frequency.days, amount: pay }].sort((a, b) => a.days - b.days).slice(0, 6);
  let projected = checking;

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Building your command center…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Sparkles size={16}/> Financial command center</div><h1 className="text-4xl font-semibold">{greeting}{profile.display_name ? `, ${profile.display_name}` : ''}.</h1><p className="mt-2 text-slate-500">{dateLabel}</p><p className="mt-3 max-w-3xl text-slate-400">Here is how you are doing, what changed, and the strongest next move.</p></header>
    {notice && <p role="status" className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{notice}</p>}
    <section className={`rounded-3xl border p-6 ${pulseStyle}`}><div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em]">Financial pulse</p><h2 className="mt-2 text-4xl font-semibold">{pulse}</h2><p className="mt-3 max-w-xl text-sm leading-6 opacity-80">{pulse === 'Strong' ? 'Your essentials and safety buffer are covered, with room to make progress.' : pulse === 'Stable' ? 'Your plan is balanced. Stay focused on the recommended next action.' : 'Protect required expenses and rebuild your cash buffer before optional moves.'}</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><PulseStat label="Health" value={`${health}/100`}/><PulseStat label="Net worth" value={money.format(netWorth)}/><PulseStat label="Checking" value={money.format(checking)}/><PulseStat label="Safe extra" value={money.format(safeExtra)}/></div></div></section>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><Card title="Today’s priorities"><Priority tone={checking < cushion ? 'high' : 'good'} title={checking < cushion ? 'Restore your checking cushion' : 'Checking cushion protected'} detail={checking < cushion ? `${money.format(cushion - checking)} is needed to restore your preferred buffer.` : `${money.format(Math.max(0, checking - cushion))} remains above your protected minimum.`}/>{billsDueSoon[0] && <Priority tone={daysUntilDue(billsDueSoon[0].dueDay) <= 1 ? 'high' : 'medium'} title={`${billsDueSoon[0].name} is coming up`} detail={`${money.format(billsDueSoon[0].amount)} due ${billsDueSoon[0].frequency === 'weekly' ? 'this week' : `in ${daysUntilDue(billsDueSoon[0].dueDay)} day(s)`}.`}/>} {topGoal && <Priority tone="good" title={`${topGoal.name} is ${Math.round(topGoal.current / Math.max(1, topGoal.target) * 100)}% complete`} detail={`${money.format(topGoal.target - topGoal.current)} remains.`}/>}</Card><div className="rounded-3xl border border-cyan-400/30 bg-cyan-400/10 p-6"><div className="flex items-center gap-2 text-cyan-300"><Bot size={18}/><p className="text-xs font-semibold uppercase tracking-[0.2em]">Recommended today</p></div><h2 className="mt-4 text-3xl font-semibold">{recommendation.title}</h2><p className="mt-4 text-sm leading-6 text-slate-300">{recommendation.reason}</p><div className="mt-5 flex items-center justify-between rounded-2xl border border-cyan-400/20 bg-slate-950/30 p-4"><div><p className="text-xs text-cyan-300">Confidence</p><p className="mt-1 text-2xl font-semibold">{recommendation.confidence}%</p></div><Link href="/pilot" className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-200">Why this? <ArrowRight size={16}/></Link></div></div></section>
    <section className="mt-6 grid gap-6 xl:grid-cols-2"><Card title="Upcoming cash timeline"><div className="space-y-3">{timeline.map((item, index) => { projected += item.amount; return <div key={`${item.label}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div><p className="font-medium">{item.label}</p><p className="mt-1 text-xs text-slate-500">{item.days === 0 ? 'Today' : `In ${item.days} day(s)`}</p></div><div className="text-right"><p className={`font-semibold ${item.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{item.amount >= 0 ? '+' : '-'}{money.format(Math.abs(item.amount))}</p><p className="mt-1 text-xs text-slate-500">Projected {money.format(projected)}</p></div></div>; })}{!timeline.length && <Empty text="Add bills and paycheck details to build your upcoming timeline."/>}</div></Card><Card title="What changed"><Win icon={<TrendingUp/>} title={latest && previous ? `Net worth ${netWorthChange >= 0 ? 'increased' : 'decreased'} ${money.format(Math.abs(netWorthChange))}` : 'Save two snapshots to measure net-worth changes'} positive={netWorthChange >= 0}/><Win icon={<CreditCard/>} title={latest && previous ? `Debt ${debtChange <= 0 ? 'decreased' : 'increased'} ${money.format(Math.abs(debtChange))}` : `${money.format(totalDebt)} remains across your debts`} positive={debtChange <= 0}/><Win icon={<ReceiptText/>} title={`${transactions.filter(tx => tx.postedAt).length} recent transactions have been posted`} positive/></Card></section>
    <section className="mt-6"><Card title="Progress center"><div className="grid gap-5 md:grid-cols-3"><Progress label={emergency?.name ?? 'Emergency fund'} current={emergency?.current ?? savings} target={emergency?.target ?? Math.max(1000, monthlyIncome)}/><Progress label={topGoal?.name ?? 'Top goal'} current={topGoal?.current ?? 0} target={topGoal?.target ?? 1}/><div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5"><p className="text-sm text-slate-500">Debt remaining</p><p className="mt-2 text-3xl font-semibold">{money.format(totalDebt)}</p><Link href="/payoff" className="mt-4 inline-flex items-center gap-2 text-sm text-cyan-300">View payoff plan <ArrowRight size={15}/></Link></div></div></Card></section>
    <section className="mt-6"><Card title="Quick actions"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Quick href="/transactions" icon={<Plus/>} label="Add transaction"/><Quick href="/transactions" icon={<CircleDollarSign/>} label="Record paycheck"/><Quick href="/payoff" icon={<CreditCard/>} label="Pay debt"/><Quick href="/goals" icon={<Target/>} label="Update goal"/><Quick href="/what-if" icon={<Activity/>} label="Run scenario"/><Quick href="/pilot" icon={<Bot/>} label="Ask Pilot"/></div></Card></section>
    <section className="mt-6 grid gap-6 md:grid-cols-2"><Card title="Plan settings"><MetricLine label="Pay schedule" value={frequency.label}/><MetricLine label="Net pay per check" value={money.format(pay)}/><MetricLine label="Living reserve" value={money.format(livingReserve)}/><MetricLine label="Protected cushion" value={money.format(cushion)}/><Link href="/settings" className="mt-5 inline-flex items-center gap-2 text-sm text-cyan-300">Change settings <ArrowRight size={16}/></Link></Card><Card title="Financial snapshot"><MetricLine label="Total assets" value={money.format(totalAssets)}/><MetricLine label="Total debt" value={money.format(totalDebt)}/><MetricLine label="Net worth" value={money.format(netWorth)}/><MetricLine label="Monthly income" value={money.format(monthlyIncome)}/><Link href="/insights" className="mt-5 inline-flex items-center gap-2 text-sm text-cyan-300">View full insights <ArrowRight size={16}/></Link></Card></section>
    <p className="mt-6 text-xs leading-5 text-slate-500">Planning estimates only. Confirm account balances, statement timing, and due dates before moving money.</p>
  </div></main>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="mb-5 text-2xl font-semibold">{title}</h2>{children}</div>; }
function PulseStat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4"><p className="text-xs opacity-70">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>; }
function Priority({ tone, title, detail }: { tone: 'high' | 'medium' | 'good'; title: string; detail: string }) { const styles = tone === 'high' ? 'border-rose-400/20 bg-rose-400/10' : tone === 'medium' ? 'border-amber-400/20 bg-amber-400/10' : 'border-emerald-400/20 bg-emerald-400/10'; return <div className={`mb-3 rounded-2xl border p-4 last:mb-0 ${styles}`}><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-slate-400">{detail}</p></div>; }
function Win({ icon, title, positive }: { icon: React.ReactNode; title: string; positive: boolean }) { return <div className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 last:mb-0"><span className={positive ? 'text-emerald-300' : 'text-amber-300'}>{icon}</span><p className="text-sm">{title}</p></div>; }
function Progress({ label, current, target }: { label: string; current: number; target: number }) { const percent = Math.max(0, Math.min(100, current / Math.max(1, target) * 100)); return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5"><div className="flex items-center justify-between"><p className="font-medium">{label}</p><p className="text-sm text-cyan-300">{Math.round(percent)}%</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${percent}%` }}/></div><p className="mt-3 text-xs text-slate-500">{money.format(current)} of {money.format(target)}</p></div>; }
function Quick({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) { return <Link href={href} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"><span>{icon}</span>{label}</Link>; }
function MetricLine({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-slate-800 py-3 last:border-0"><p className="text-sm text-slate-500">{label}</p><p className="font-semibold">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">{text}</p>; }
