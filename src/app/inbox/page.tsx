'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDollarSign, Inbox, Target } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Debt = { id: string; name: string; balance: number; apr: number; minimum: number };
type Bill = { id: string; name: string; amount: number; dueDay: number; frequency: string };
type Goal = { id: string; name: string; goalType: string; target: number; current: number; priority: number };
type Priority = 'high' | 'medium' | 'low';
type Task = { id: string; priority: Priority; title: string; detail: string; amount?: number; href: string; action: string; icon: 'risk' | 'money' | 'goal' | 'done' };

type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
const schedule: Record<PayFrequency, { periods: number; days: number }> = {
  weekly: { periods: 52, days: 7 },
  biweekly: { periods: 26, days: 14 },
  semimonthly: { periods: 24, days: 15 },
  monthly: { periods: 12, days: 30 },
};
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function daysUntilDue(dueDay: number) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastThis = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let due = new Date(today.getFullYear(), today.getMonth(), Math.min(dueDay, lastThis));
  if (due < start) {
    const lastNext = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
    due = new Date(today.getFullYear(), today.getMonth() + 1, Math.min(dueDay, lastNext));
  }
  return Math.ceil((due.getTime() - start.getTime()) / 86400000);
}

export default function FinancialInboxPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reviewed, setReviewed] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('Supabase is not configured.'); setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      const [{ data: p, error: pe }, { data: d, error: de }, { data: b, error: be }, { data: g, error: ge }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('*').eq('user_id', user.id),
        supabase.from('bills').select('*').eq('user_id', user.id),
        supabase.from('goals').select('*').eq('user_id', user.id),
      ]);
      const error = pe || de || be || ge;
      if (error) setMessage(`Load failed: ${error.message}`);
      setProfile(p);
      setDebts((d ?? []).map(row => ({ id: row.id, name: row.name, balance: Number(row.balance), apr: Number(row.apr), minimum: Number(row.minimum_payment) })));
      setBills((b ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' })));
      setGoals((g ?? []).map(row => ({ id: row.id, name: row.name, goalType: row.goal_type, target: Number(row.target_amount), current: Number(row.current_amount), priority: Number(row.priority) })));
      setLoading(false);
    })();
  }, []);

  const tasks = useMemo(() => {
    if (!profile) return [] as Task[];
    const frequency = (schedule[profile.pay_frequency as PayFrequency] ? profile.pay_frequency : 'weekly') as PayFrequency;
    const cycle = schedule[frequency];
    const pay = Number(profile.weekly_take_home ?? 0);
    const checking = Number(profile.checking_balance ?? 0);
    const cushion = Number(profile.checking_cushion ?? 0);
    const living = Number(profile.weekly_living_reserve ?? 0);
    const dueSoon = bills.filter(b => b.frequency === 'weekly' || daysUntilDue(b.dueDay) <= cycle.days);
    const billReserve = dueSoon.reduce((sum, b) => sum + b.amount, 0);
    const monthlyMinimums = debts.reduce((sum, d) => sum + d.minimum, 0);
    const minimumReserve = monthlyMinimums * 12 / cycle.periods;
    const available = Math.max(0, pay - living - billReserve - minimumReserve - Math.max(0, cushion - checking));
    const items: Task[] = [];

    if (checking < cushion) {
      items.push({ id: 'cushion', priority: 'high', title: 'Restore your checking cushion', detail: `Checking is ${money.format(cushion - checking)} below your protected minimum. Preserve cash before making optional payments.`, amount: cushion - checking, href: '/', action: 'Review paycheck plan', icon: 'risk' });
    }

    dueSoon.sort((a, b) => daysUntilDue(a.dueDay) - daysUntilDue(b.dueDay)).slice(0, 4).forEach(bill => {
      const days = bill.frequency === 'weekly' ? 0 : daysUntilDue(bill.dueDay);
      items.push({ id: `bill-${bill.id}`, priority: days <= 2 ? 'high' : 'medium', title: `${bill.name} is due ${days === 0 ? 'now' : `in ${days} day${days === 1 ? '' : 's'}`}`, detail: 'Confirm this bill is funded before assigning money to goals or extra debt payments.', amount: bill.amount, href: '/', action: 'Review bills', icon: 'money' });
    });

    const emergency = goals.find(g => g.goalType === 'emergency_fund' && g.current < g.target);
    const highestApr = [...debts].filter(d => d.balance > 0).sort((a, b) => b.apr - a.apr)[0];
    const topGoal = [...goals].filter(g => g.current < g.target).sort((a, b) => a.priority - b.priority || (b.target - b.current) - (a.target - a.current))[0];

    if (available > 0 && emergency && emergency.priority === 1 && emergency.current < Math.min(emergency.target, 1000)) {
      const amount = Math.min(available, Math.min(emergency.target, 1000) - emergency.current);
      items.push({ id: `goal-${emergency.id}`, priority: 'high', title: `Build ${emergency.name}`, detail: 'Your high-priority starter emergency fund is below its first safety milestone.', amount, href: '/goals', action: 'Review goal', icon: 'goal' });
    } else if (available > 0 && highestApr) {
      items.push({ id: `debt-${highestApr.id}`, priority: highestApr.apr >= 20 ? 'high' : 'medium', title: `Make an extra payment to ${highestApr.name}`, detail: `${highestApr.apr.toFixed(2)}% APR makes this the strongest interest-saving opportunity after required cash is protected.`, amount: available, href: '/payoff', action: 'Open payoff planner', icon: 'money' });
    } else if (available > 0 && topGoal) {
      items.push({ id: `goal-${topGoal.id}`, priority: topGoal.priority === 1 ? 'medium' : 'low', title: `Fund ${topGoal.name}`, detail: `${money.format(topGoal.target - topGoal.current)} remains to reach this goal.`, amount: Math.min(available, topGoal.target - topGoal.current), href: '/goals', action: 'Review goal', icon: 'goal' });
    }

    if (!debts.length) items.push({ id: 'add-debts', priority: 'medium', title: 'Add your debt accounts', detail: 'Balances, APRs, and minimums are needed for payoff recommendations.', href: '/', action: 'Add debts', icon: 'risk' });
    if (!bills.length) items.push({ id: 'add-bills', priority: 'medium', title: 'Add recurring bills', detail: 'DebtPilot needs due dates to protect cash before your next paycheck.', href: '/', action: 'Add bills', icon: 'risk' });
    if (!goals.length) items.push({ id: 'add-goals', priority: 'low', title: 'Create your first financial goal', detail: 'Goals let recommendations balance debt reduction with savings priorities.', href: '/goals', action: 'Create goal', icon: 'goal' });

    if (!items.length) items.push({ id: 'clear', priority: 'low', title: 'No urgent actions found', detail: 'Your current bills, cushion, debt minimums, and saved goals appear covered for this paycheck cycle.', href: '/forecast', action: 'Review forecast', icon: 'done' });
    return items.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - ({ high: 0, medium: 1, low: 2 }[b.priority]));
  }, [profile, debts, bills, goals]);

  const visible = tasks.filter(task => !reviewed.includes(task.id));
  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Building your financial inbox…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-5xl px-5 py-8">
    <header className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Inbox size={16}/> Financial Inbox</div><h1 className="text-4xl font-semibold">Your next financial actions, in order.</h1><p className="mt-3 max-w-3xl text-slate-400">DebtPilot checks upcoming bills, cash protection, debts, and goals to surface the items that deserve attention first.</p></header>
    {message && <p className="mb-6 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{message}</p>}
    <section className="grid gap-4 sm:grid-cols-3"><Summary label="High priority" value={visible.filter(t => t.priority === 'high').length}/><Summary label="Medium priority" value={visible.filter(t => t.priority === 'medium').length}/><Summary label="Reviewed this visit" value={reviewed.length}/></section>
    <section className="mt-6 space-y-4">{visible.map(task => <TaskCard key={task.id} task={task} onReviewed={() => setReviewed(items => [...items, task.id])}/>)}{visible.length === 0 && <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center"><CheckCircle2 className="mx-auto text-cyan-300" size={36}/><h2 className="mt-4 text-2xl font-semibold">Inbox reviewed</h2><p className="mt-2 text-slate-400">Refresh the page whenever your balances, bills, debts, or goals change.</p></div>}</section>
    <p className="mt-6 text-xs leading-5 text-slate-500">Marking an item reviewed only hides it for this visit. Persistent completion tracking will be added with the future transaction and activity system.</p>
  </div></main>;
}

function Summary({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>; }
function TaskCard({ task, onReviewed }: { task: Task; onReviewed: () => void }) {
  const styles = task.priority === 'high' ? 'border-rose-400/25' : task.priority === 'medium' ? 'border-amber-400/25' : 'border-slate-800';
  const Icon = task.icon === 'risk' ? AlertTriangle : task.icon === 'goal' ? Target : task.icon === 'done' ? CheckCircle2 : CircleDollarSign;
  return <article className={`rounded-3xl border bg-slate-900 p-6 ${styles}`}><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-4"><div className="rounded-2xl border border-slate-700 bg-slate-950 p-3"><Icon className="text-cyan-300" size={22}/></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{task.priority} priority</p><h2 className="mt-2 text-xl font-semibold">{task.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{task.detail}</p>{task.amount !== undefined && <p className="mt-3 text-2xl font-semibold text-cyan-300">{money.format(task.amount)}</p>}</div></div><div className="flex shrink-0 gap-2"><button onClick={onReviewed} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Mark reviewed</button><Link href={task.href} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">{task.action}<ArrowRight size={15}/></Link></div></div></article>;
}
