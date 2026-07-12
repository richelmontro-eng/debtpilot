'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowRight, Bot, CalendarDays, CheckCircle2, CircleDollarSign, CreditCard, Gauge, Info, Plus, ReceiptText, Save, Sparkles, Target, Trash2, TrendingUp, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Debt = { id: string; name: string; balance: number; apr: number; minimum: number };
type Bill = { id: string; name: string; amount: number; dueDay: number; frequency: string };
type Goal = { id: string; name: string; goalType: string; targetAmount: number; currentAmount: number; priority: number };
type Snapshot = { snapshotDate: string; netWorth: number; totalDebt: number; health: number };
type Transaction = { id: string; date: string; type: string; description: string; amount: number; postedAt: string | null };
type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

type Recommendation = {
  type: 'cushion' | 'goal' | 'debt' | 'none';
  title: string;
  reason: string;
  amount: number;
  confidence: number;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const paySchedule: Record<PayFrequency, { label: string; periods: number; cycleDays: number }> = {
  weekly: { label: 'Weekly', periods: 52, cycleDays: 7 },
  biweekly: { label: 'Every 2 weeks', periods: 26, cycleDays: 14 },
  semimonthly: { label: 'Twice monthly', periods: 24, cycleDays: 15 },
  monthly: { label: 'Monthly', periods: 12, cycleDays: 30 },
};

function daysUntilDue(dueDay: number) {
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastDayThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), Math.min(dueDay, lastDayThisMonth));
  if (thisMonth >= startToday) return Math.ceil((thisMonth.getTime() - startToday.getTime()) / 86400000);
  const lastDayNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, Math.min(dueDay, lastDayNextMonth));
  return Math.ceil((nextMonth.getTime() - startToday.getTime()) / 86400000);
}

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [payFrequency, setPayFrequency] = useState<PayFrequency>('weekly');
  const [payPerCheck, setPayPerCheck] = useState(0);
  const [checking, setChecking] = useState(0);
  const [savings, setSavings] = useState(0);
  const [investments, setInvestments] = useState(0);
  const [otherAssets, setOtherAssets] = useState(0);
  const [livingReserve, setLivingReserve] = useState(0);
  const [checkingCushion, setCheckingCushion] = useState(0);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [debts, setDebts] = useState<Debt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setNotice('Supabase environment variables are missing.'); setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setUserId(user.id);
      const [profileResult, debtResult, billResult, goalResult, snapshotResult, transactionResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('bills').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('goals').select('*').eq('user_id', user.id).order('priority').order('created_at'),
        supabase.from('financial_snapshots').select('snapshot_date, net_worth, total_debt, financial_health').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(2),
        supabase.from('transactions').select('id, transaction_date, transaction_type, description, amount, posted_at').eq('user_id', user.id).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
      ]);
      const loadError = profileResult.error || debtResult.error || billResult.error || goalResult.error || snapshotResult.error || transactionResult.error;
      if (loadError) setNotice(`Load failed: ${loadError.message}`);
      const profile = profileResult.data;
      if (profile) {
        const savedFrequency = profile.pay_frequency as PayFrequency;
        setDisplayName(profile.display_name ?? '');
        setPayFrequency(paySchedule[savedFrequency] ? savedFrequency : 'weekly');
        setPayPerCheck(Number(profile.weekly_take_home));
        setChecking(Number(profile.checking_balance));
        setSavings(Number(profile.savings_balance));
        setInvestments(Number(profile.investment_balance ?? 0));
        setOtherAssets(Number(profile.other_assets ?? 0));
        setLivingReserve(Number(profile.weekly_living_reserve));
        setCheckingCushion(Number(profile.checking_cushion));
        setStrategy(profile.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche');
      }
      setDebts((debtResult.data ?? []).map(row => ({ id: row.id, name: row.name, balance: Number(row.balance), apr: Number(row.apr), minimum: Number(row.minimum_payment) })));
      setBills((billResult.data ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' })));
      setGoals((goalResult.data ?? []).map(row => ({ id: row.id, name: row.name, goalType: row.goal_type, targetAmount: Number(row.target_amount), currentAmount: Number(row.current_amount), priority: Number(row.priority) })));
      setSnapshots((snapshotResult.data ?? []).map(row => ({ snapshotDate: row.snapshot_date, netWorth: Number(row.net_worth), totalDebt: Number(row.total_debt), health: Number(row.financial_health) })));
      setTransactions((transactionResult.data ?? []).map(row => ({ id: row.id, date: row.transaction_date, type: row.transaction_type, description: row.description, amount: Number(row.amount), postedAt: row.posted_at })));
      setLoading(false);
    })();
  }, [router]);

  const schedule = paySchedule[payFrequency];
  const billsDueSoon = useMemo(() => bills.filter(bill => bill.frequency === 'weekly' || daysUntilDue(bill.dueDay) <= schedule.cycleDays), [bills, schedule.cycleDays]);
  const billsReserve = billsDueSoon.reduce((sum, bill) => sum + bill.amount, 0);
  const monthlyMinimums = debts.reduce((sum, debt) => sum + debt.minimum, 0);
  const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const minimumReservePerCheck = monthlyMinimums * 12 / schedule.periods;
  const availableBeforeCushion = Math.max(0, payPerCheck - livingReserve - billsReserve - minimumReservePerCheck);
  const cushionGap = Math.max(0, checkingCushion - checking);
  const safeExtra = Math.max(0, availableBeforeCushion - cushionGap);
  const rankedDebts = [...debts].filter(debt => debt.balance > 0).sort((a, b) => strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance);
  const debtTarget = rankedDebts[0];
  const incompleteGoals = [...goals].filter(goal => goal.targetAmount > goal.currentAmount).sort((a, b) => a.priority - b.priority || (a.targetAmount - a.currentAmount) - (b.targetAmount - b.currentAmount));
  const topGoal = incompleteGoals[0];
  const emergencyGoal = incompleteGoals.find(goal => goal.goalType === 'emergency_fund');
  const annualIncome = payPerCheck * schedule.periods;
  const monthlyIncome = annualIncome / 12;
  const totalAssets = checking + savings + investments + otherAssets;
  const netWorth = totalAssets - totalDebt;

  const recommendation: Recommendation = useMemo(() => {
    if (availableBeforeCushion <= 0) return { type: 'none', amount: 0, confidence: 92, title: 'Keep this paycheck focused on required expenses.', reason: 'Bills, living costs, and minimum debt payments use the available paycheck. No extra transfer is recommended yet.' };
    if (cushionGap > 0) return { type: 'cushion', amount: Math.min(availableBeforeCushion, cushionGap), confidence: 98, title: `Keep ${money.format(Math.min(availableBeforeCushion, cushionGap))} in checking.`, reason: `Checking is ${money.format(cushionGap)} below your protected cushion, so restoring that buffer comes first.` };
    const emergencyIsEarly = emergencyGoal && emergencyGoal.currentAmount < Math.min(emergencyGoal.targetAmount, Math.max(1000, monthlyIncome));
    const veryHighAprDebt = debtTarget && debtTarget.apr >= 20;
    if (safeExtra > 0 && emergencyIsEarly && (!veryHighAprDebt || emergencyGoal.priority === 1)) return { type: 'goal', amount: Math.min(safeExtra, emergencyGoal.targetAmount - emergencyGoal.currentAmount), confidence: 94, title: `Put ${money.format(Math.min(safeExtra, emergencyGoal.targetAmount - emergencyGoal.currentAmount))} toward ${emergencyGoal.name}.`, reason: 'Your emergency reserve is still in its first safety stage, so building it lowers the risk of creating new debt.' };
    if (safeExtra > 0 && debtTarget && (debtTarget.apr >= 10 || !topGoal || topGoal.priority > 1)) return { type: 'debt', amount: Math.min(safeExtra, debtTarget.balance), confidence: debtTarget.apr >= 20 ? 97 : 91, title: `Pay ${money.format(Math.min(safeExtra, debtTarget.balance))} toward ${debtTarget.name}.`, reason: strategy === 'avalanche' ? `${debtTarget.name} is your highest-APR balance at ${debtTarget.apr.toFixed(2)}%, making it the most efficient target.` : `${debtTarget.name} has the smallest balance, creating the quickest payoff win.` };
    if (safeExtra > 0 && topGoal) return { type: 'goal', amount: Math.min(safeExtra, topGoal.targetAmount - topGoal.currentAmount), confidence: 88, title: `Put ${money.format(Math.min(safeExtra, topGoal.targetAmount - topGoal.currentAmount))} toward ${topGoal.name}.`, reason: `${topGoal.name} is your highest-priority unfinished goal.` };
    if (safeExtra > 0 && debtTarget) return { type: 'debt', amount: Math.min(safeExtra, debtTarget.balance), confidence: 86, title: `Pay ${money.format(Math.min(safeExtra, debtTarget.balance))} toward ${debtTarget.name}.`, reason: 'Required expenses and your checking cushion are covered, so the remaining cash can accelerate payoff.' };
    return { type: 'none', amount: 0, confidence: 75, title: 'Your required cash is protected.', reason: 'Add a debt or unfinished goal to receive a next-action recommendation.' };
  }, [availableBeforeCushion, cushionGap, safeExtra, emergencyGoal, monthlyIncome, debtTarget, topGoal, strategy]);

  const health = useMemo(() => {
    const debtBurden = monthlyIncome ? monthlyMinimums / monthlyIncome : 1;
    const cushionScore = checkingCushion <= 0 ? 10 : Math.min(20, checking / checkingCushion * 20);
    const cashFlowScore = payPerCheck <= 0 ? 0 : Math.min(35, safeExtra / payPerCheck * 100);
    const goalScore = goals.length ? Math.min(10, goals.reduce((sum, goal) => sum + Math.min(1, goal.currentAmount / Math.max(1, goal.targetAmount)), 0) / goals.length * 10) : 0;
    return Math.max(0, Math.min(100, Math.round(35 + cushionScore + cashFlowScore + goalScore - debtBurden * 35)));
  }, [payPerCheck, monthlyIncome, monthlyMinimums, checking, checkingCushion, safeExtra, goals]);

  const latestSnapshot = snapshots[0];
  const previousSnapshot = snapshots[1];
  const netWorthChange = latestSnapshot && previousSnapshot ? latestSnapshot.netWorth - previousSnapshot.netWorth : 0;
  const debtChange = latestSnapshot && previousSnapshot ? latestSnapshot.totalDebt - previousSnapshot.totalDebt : 0;
  const pulse = checking < checkingCushion || availableBeforeCushion <= 0 ? 'Needs attention' : health >= 75 ? 'Strong' : 'Stable';
  const pulseStyle = pulse === 'Strong' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : pulse === 'Stable' ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200' : 'border-amber-400/30 bg-amber-400/10 text-amber-200';

  const timeline = useMemo(() => {
    const items = billsDueSoon.map(bill => ({ label: bill.name, days: bill.frequency === 'weekly' ? 0 : daysUntilDue(bill.dueDay), amount: -bill.amount, kind: 'bill' }));
    items.push({ label: 'Next paycheck', days: schedule.cycleDays, amount: payPerCheck, kind: 'income' });
    return items.sort((a, b) => a.days - b.days).slice(0, 6);
  }, [billsDueSoon, schedule.cycleDays, payPerCheck]);

  let projectedBalance = checking;

  function updateDebt(id: string, field: keyof Debt, value: string) { setDebts(items => items.map(item => item.id === id ? { ...item, [field]: field === 'name' ? value : Number(value) } : item)); }
  function updateBill(id: string, field: keyof Bill, value: string) { setBills(items => items.map(item => item.id === id ? { ...item, [field]: field === 'name' || field === 'frequency' ? value : Number(value) } : item)); }
  function addDebt() { setDebts(items => [...items, { id: `new-${crypto.randomUUID()}`, name: 'New debt', balance: 0, apr: 0, minimum: 0 }]); }
  function addBill() { setBills(items => [...items, { id: `new-${crypto.randomUUID()}`, name: 'New bill', amount: 0, dueDay: 1, frequency: 'monthly' }]); }

  async function save() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true); setNotice('Saving…');
    const { error: profileError } = await supabase.from('profiles').upsert({ user_id: userId, weekly_take_home: payPerCheck, checking_balance: checking, savings_balance: savings, weekly_living_reserve: livingReserve, checking_cushion: checkingCushion, preferred_strategy: strategy, updated_at: new Date().toISOString() });
    const { error: deleteDebtError } = await supabase.from('debts').delete().eq('user_id', userId);
    const { error: debtError } = debts.length ? await supabase.from('debts').insert(debts.map(debt => ({ user_id: userId, name: debt.name, balance: debt.balance, apr: debt.apr, minimum_payment: debt.minimum }))) : { error: null };
    const { error: deleteBillError } = await supabase.from('bills').delete().eq('user_id', userId);
    const { error: billError } = bills.length ? await supabase.from('bills').insert(bills.map(bill => ({ user_id: userId, name: bill.name, amount: bill.amount, due_day: Math.min(31, Math.max(1, bill.dueDay)), frequency: bill.frequency }))) : { error: null };
    const error = profileError || deleteDebtError || debtError || deleteBillError || billError;
    setNotice(error ? `Save failed: ${error.message}` : 'Saved successfully. Your command center is up to date.');
    setSaving(false);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Building your financial command center…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Sparkles size={16}/> Financial command center</div><h1 className="text-4xl font-semibold">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}{displayName ? `, ${displayName}` : ''}.</h1><p className="mt-3 text-slate-400">Here is where you stand, what changed, and the strongest next move.</p></div>
      <button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={18}/>{saving ? 'Saving…' : 'Save plan'}</button>
    </header>

    {notice && <p role="status" className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{notice}</p>}

    <section className={`rounded-3xl border p-6 ${pulseStyle}`}><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em]">Financial pulse</p><h2 className="mt-2 text-4xl font-semibold">{pulse}</h2><p className="mt-3 max-w-2xl text-sm leading-6 opacity-80">{pulse === 'Strong' ? 'Your required expenses are covered, your checking cushion is protected, and you have room to make progress.' : pulse === 'Stable' ? 'Your plan is currently balanced. Keep the next paycheck focused on the recommended priority.' : 'Your current plan needs attention before making optional payments or purchases.'}</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><PulseStat label="Health" value={`${health}/100`}/><PulseStat label="Net worth" value={money.format(netWorth)}/><PulseStat label="Checking" value={money.format(checking)}/><PulseStat label="Safe extra" value={money.format(safeExtra)}/></div></div></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <Card title="Today’s priorities">
        <Priority tone={checking < checkingCushion ? 'high' : 'good'} title={checking < checkingCushion ? 'Restore your checking cushion' : 'Checking cushion protected'} detail={checking < checkingCushion ? `${money.format(checkingCushion - checking)} is needed to restore your preferred buffer.` : `${money.format(checking - checkingCushion)} remains above your protected minimum.`}/>
        {billsDueSoon[0] && <Priority tone={daysUntilDue(billsDueSoon[0].dueDay) <= 1 ? 'high' : 'medium'} title={`${billsDueSoon[0].name} is coming up`} detail={`${money.format(billsDueSoon[0].amount)} due ${billsDueSoon[0].frequency === 'weekly' ? 'this week' : `in ${daysUntilDue(billsDueSoon[0].dueDay)} day(s)`}.`}/>} 
        {topGoal && <Priority tone="good" title={`${topGoal.name} is ${Math.round(topGoal.currentAmount / Math.max(1, topGoal.targetAmount) * 100)}% complete`} detail={`${money.format(topGoal.targetAmount - topGoal.currentAmount)} remains.`}/>} 
      </Card>

      <div className="rounded-3xl border border-cyan-400/30 bg-cyan-400/10 p-6">
        <div className="flex items-center gap-2 text-cyan-300"><Bot size={18}/><p className="text-xs font-semibold uppercase tracking-[0.2em]">Pilot recommendation</p></div><h2 className="mt-4 text-3xl font-semibold">{recommendation.title}</h2><p className="mt-4 text-sm leading-6 text-slate-300">{recommendation.reason}</p><div className="mt-5 flex items-center justify-between rounded-2xl border border-cyan-400/20 bg-slate-950/30 p-4"><div><p className="text-xs text-cyan-300">Confidence</p><p className="mt-1 text-2xl font-semibold">{recommendation.confidence}%</p></div><Link href="/pilot" className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-200">Why this? <ArrowRight size={16}/></Link></div>
      </div>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card title="Upcoming financial timeline"><div className="space-y-3">{timeline.map((item, index) => { projectedBalance += item.amount; return <div key={`${item.label}-${index}`} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div><p className="font-medium">{item.label}</p><p className="mt-1 text-xs text-slate-500">{item.days === 0 ? 'Today' : `In ${item.days} day(s)`}</p></div><div className="text-right"><p className={`font-semibold ${item.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{item.amount >= 0 ? '+' : '-'}{money.format(Math.abs(item.amount))}</p><p className="mt-1 text-xs text-slate-500">Projected {money.format(projectedBalance)}</p></div></div>; })}</div></Card>
      <Card title="Financial wins"><Win icon={<TrendingUp/>} title={netWorthChange ? `Net worth ${netWorthChange >= 0 ? 'increased' : 'decreased'} ${money.format(Math.abs(netWorthChange))}` : 'Save another snapshot to measure net-worth progress'} positive={netWorthChange >= 0}/><Win icon={<CreditCard/>} title={debtChange ? `Debt ${debtChange <= 0 ? 'decreased' : 'increased'} ${money.format(Math.abs(debtChange))}` : `${money.format(totalDebt)} remaining across all debts`} positive={debtChange <= 0}/><Win icon={<ReceiptText/>} title={`${transactions.filter(transaction => transaction.postedAt).length} of your latest transactions are posted`} positive/></Card>
    </section>

    <section className="mt-6"><Card title="Progress center"><div className="grid gap-5 md:grid-cols-3"><Progress label="Debt freedom" current={0} target={Math.max(1, totalDebt)} inverse/><Progress label={emergencyGoal?.name ?? 'Emergency fund'} current={emergencyGoal?.currentAmount ?? savings} target={emergencyGoal?.targetAmount ?? Math.max(1000, monthlyIncome)}/><Progress label={topGoal?.name ?? 'Top goal'} current={topGoal?.currentAmount ?? 0} target={topGoal?.targetAmount ?? 1}/></div></Card></section>

    <section className="mt-6"><Card title="Quick actions"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Quick href="/transactions" icon={<Plus/>} label="Add transaction"/><Quick href="/transactions" icon={<CircleDollarSign/>} label="Record paycheck"/><Quick href="/payoff" icon={<CreditCard/>} label="Pay debt"/><Quick href="/goals" icon={<Target/>} label="Update goal"/><Quick href="/what-if" icon={<Activity/>} label="Run scenario"/><Quick href="/pilot" icon={<Bot/>} label="Ask Pilot"/></div></Card></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-3">
      <Card title="Paycheck planner" className="xl:col-span-2"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><HelpLabel label="Pay schedule" help="Your long-term pay frequency is managed in Settings and used throughout DebtPilot."/><p className="mt-2 text-xl font-semibold">{schedule.label}</p><Link href="/settings" className="mt-2 inline-flex text-xs text-cyan-300">Change in Settings</Link></div><NumberField label="Net pay per check" value={payPerCheck} onChange={setPayPerCheck}/><NumberField label="Living reserve per check" value={livingReserve} onChange={setLivingReserve}/><NumberField label="Checking balance" value={checking} onChange={setChecking}/><NumberField label="Protected checking cushion" value={checkingCushion} onChange={setCheckingCushion}/><NumberField label="Savings balance" value={savings} onChange={setSavings}/><label className="block text-xs text-slate-400"><HelpLabel label="Debt strategy" help="Avalanche targets the highest APR. Snowball targets the smallest balance."/><select className="field mt-1 w-full" value={strategy} onChange={event => setStrategy(event.target.value as 'avalanche' | 'snowball')}><option value="avalanche">Avalanche</option><option value="snowball">Snowball</option></select></label></div><div className="mt-6 grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 sm:grid-cols-4"><Stat label={`${schedule.label} paycheck`} value={money.format(payPerCheck)}/><Stat label="Bills reserved" value={money.format(billsReserve)}/><Stat label="Living + minimums" value={money.format(livingReserve + minimumReservePerCheck)}/><Stat label="After cushion" value={money.format(safeExtra)}/></div></Card>
      <Card title="Financial snapshot"><MetricLine label="Total assets" value={money.format(totalAssets)}/><MetricLine label="Total debt" value={money.format(totalDebt)}/><MetricLine label="Net worth" value={money.format(netWorth)}/><MetricLine label="Monthly income" value={money.format(monthlyIncome)}/><Link href="/insights" className="mt-5 inline-flex items-center gap-2 text-sm text-cyan-300">View full insights <ArrowRight size={16}/></Link></Card>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card title="Bills"><button onClick={addBill} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300"><Plus size={16}/>Add bill</button><div className="space-y-3">{bills.length === 0 && <Empty text="Add recurring bills so DebtPilot can reserve them before recommending extra payments."/>}{bills.map(bill => <div key={bill.id} className="grid gap-3 rounded-2xl border border-slate-800 p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end"><TextField label="Bill" value={bill.name} onChange={value => updateBill(bill.id, 'name', value)}/><NumberField label="Amount" value={bill.amount} onChange={value => updateBill(bill.id, 'amount', String(value))}/><NumberField label="Due day" value={bill.dueDay} onChange={value => updateBill(bill.id, 'dueDay', String(value))}/><label className="block text-xs text-slate-400">Frequency<select className="field mt-1 w-full" value={bill.frequency} onChange={event => updateBill(bill.id, 'frequency', event.target.value)}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label><button aria-label={`Remove ${bill.name}`} onClick={() => setBills(items => items.filter(item => item.id !== bill.id))} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button></div>)}</div></Card>
      <Card title="Debt accounts"><button onClick={addDebt} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300"><Plus size={16}/>Add debt</button><div className="space-y-3">{debts.length === 0 && <Empty text="Add each credit card or loan with its balance, APR, and monthly minimum."/>}{debts.map(debt => <div key={debt.id} className="grid gap-3 rounded-2xl border border-slate-800 p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end"><TextField label="Account" value={debt.name} onChange={value => updateDebt(debt.id, 'name', value)}/><NumberField label="Balance" value={debt.balance} onChange={value => updateDebt(debt.id, 'balance', String(value))}/><NumberField label="APR %" value={debt.apr} onChange={value => updateDebt(debt.id, 'apr', String(value))} step="0.01"/><NumberField label="Monthly minimum" value={debt.minimum} onChange={value => updateDebt(debt.id, 'minimum', String(value))}/><button aria-label={`Remove ${debt.name}`} onClick={() => setDebts(items => items.filter(item => item.id !== debt.id))} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button></div>)}</div></Card>
    </section>

    <p className="mt-6 text-xs leading-5 text-slate-500">Planning estimates only. Confirm statement timing, bill due dates, lender minimums, and available balances before moving money.</p>
  </div></main>;
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) { return <div className={`rounded-3xl border border-slate-800 bg-slate-900 p-6 ${className}`}><h2 className="mb-5 text-2xl font-semibold">{title}</h2>{children}</div>; }
function PulseStat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-3"><p className="text-xs opacity-70">{label}</p><p className="mt-1 font-semibold">{value}</p></div>; }
function Priority({ tone, title, detail }: { tone: 'high' | 'medium' | 'good'; title: string; detail: string }) { const style = tone === 'high' ? 'border-rose-400/20 bg-rose-400/10' : tone === 'medium' ? 'border-amber-400/20 bg-amber-400/10' : 'border-emerald-400/20 bg-emerald-400/10'; return <div className={`mb-3 rounded-2xl border p-4 last:mb-0 ${style}`}><div className="flex gap-3"><CheckCircle2 className="mt-0.5 shrink-0" size={19}/><div><p className="font-medium">{title}</p><p className="mt-1 text-sm text-slate-400">{detail}</p></div></div></div>; }
function Win({ icon, title, positive }: { icon: React.ReactNode; title: string; positive: boolean }) { return <div className={`mb-3 flex items-center gap-3 rounded-2xl border p-4 last:mb-0 ${positive ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-amber-400/20 bg-amber-400/10'}`}><span className="text-cyan-300">{icon}</span><p className="font-medium">{title}</p></div>; }
function Progress({ label, current, target, inverse = false }: { label: string; current: number; target: number; inverse?: boolean }) { const pct = inverse ? (target <= 0 ? 100 : 0) : Math.min(100, current / Math.max(1, target) * 100); return <div><div className="flex items-center justify-between"><p className="font-medium">{label}</p><p className="text-sm text-slate-500">{Math.round(pct)}%</p></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${pct}%` }}/></div></div></div>; }
function Quick({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) { return <Link href={href} className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-center text-sm text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-300"><span>{icon}</span>{label}</Link>; }
function MetricLine({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-slate-800 py-3 last:border-0"><span className="text-sm text-slate-500">{label}</span><span className="font-semibold">{value}</span></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm leading-6 text-slate-500">{text}</p>; }
function HelpLabel({ label, help }: { label: string; help: string }) { return <span className="flex items-center gap-1.5"><span>{label}</span><span className="group relative inline-flex"><button type="button" aria-label={`About ${label}`} className="rounded-full text-slate-500 transition hover:text-cyan-300 focus:text-cyan-300"><Info size={14}/></button><span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-xs leading-5 text-slate-300 shadow-xl group-hover:block group-focus-within:block">{help}</span></span></span>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" value={value} onChange={event => onChange(event.target.value)}/></label>; }
function NumberField({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (value: number) => void; step?: string }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="number" step={step} value={value} onChange={event => onChange(Number(event.target.value))}/></label>; }
