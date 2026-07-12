'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, CreditCard, Gauge, Info, LogOut, Plus, Save, Target, Trash2, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Debt = { id: string; name: string; balance: number; apr: number; minimum: number };
type Bill = { id: string; name: string; amount: number; dueDay: number; frequency: string };
type Goal = { id: string; name: string; goalType: string; targetAmount: number; currentAmount: number; priority: number };
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
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [payFrequency, setPayFrequency] = useState<PayFrequency>('weekly');
  const [payPerCheck, setPayPerCheck] = useState(0);
  const [checking, setChecking] = useState(0);
  const [savings, setSavings] = useState(0);
  const [livingReserve, setLivingReserve] = useState(0);
  const [checkingCushion, setCheckingCushion] = useState(0);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [debts, setDebts] = useState<Debt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setNotice('Supabase environment variables are missing.');
      setLoading(false);
      return;
    }
    (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) setNotice(`Load failed: ${userError.message}`);
      if (!user) {
        router.replace('/login');
        return;
      }
      setUserId(user.id);
      const [profileResult, debtResult, billResult, goalResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('bills').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('goals').select('*').eq('user_id', user.id).order('priority').order('created_at'),
      ]);
      const loadError = profileResult.error || debtResult.error || billResult.error || goalResult.error;
      if (loadError) setNotice(`Load failed: ${loadError.message}`);
      const profile = profileResult.data;
      if (profile) {
        const savedFrequency = profile.pay_frequency as PayFrequency;
        setPayFrequency(paySchedule[savedFrequency] ? savedFrequency : 'weekly');
        setPayPerCheck(Number(profile.weekly_take_home));
        setChecking(Number(profile.checking_balance));
        setSavings(Number(profile.savings_balance));
        setLivingReserve(Number(profile.weekly_living_reserve));
        setCheckingCushion(Number(profile.checking_cushion));
        setStrategy(profile.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche');
      }
      setDebts((debtResult.data ?? []).map(row => ({ id: row.id, name: row.name, balance: Number(row.balance), apr: Number(row.apr), minimum: Number(row.minimum_payment) })));
      setBills((billResult.data ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' })));
      setGoals((goalResult.data ?? []).map(row => ({ id: row.id, name: row.name, goalType: row.goal_type, targetAmount: Number(row.target_amount), currentAmount: Number(row.current_amount), priority: Number(row.priority) })));
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

  const recommendation: Recommendation = useMemo(() => {
    if (availableBeforeCushion <= 0) return {
      type: 'none', amount: 0, confidence: 92,
      title: 'Keep this paycheck focused on required expenses.',
      reason: 'Bills, living costs, and required debt minimums use the available paycheck. No extra transfer is recommended yet.',
    };
    if (cushionGap > 0) return {
      type: 'cushion', amount: Math.min(availableBeforeCushion, cushionGap), confidence: 98,
      title: `Keep ${money.format(Math.min(availableBeforeCushion, cushionGap))} in checking.`,
      reason: `Your checking balance is ${money.format(cushionGap)} below the protected cushion. Restoring that buffer comes before optional debt or goal payments.`,
    };
    const emergencyIsEarly = emergencyGoal && emergencyGoal.currentAmount < Math.min(emergencyGoal.targetAmount, Math.max(1000, monthlyIncome));
    const veryHighAprDebt = debtTarget && debtTarget.apr >= 20;
    if (safeExtra > 0 && emergencyIsEarly && (!veryHighAprDebt || emergencyGoal.priority === 1)) return {
      type: 'goal', amount: Math.min(safeExtra, emergencyGoal.targetAmount - emergencyGoal.currentAmount), confidence: 94,
      title: `Put ${money.format(Math.min(safeExtra, emergencyGoal.targetAmount - emergencyGoal.currentAmount))} toward ${emergencyGoal.name}.`,
      reason: 'Your emergency reserve is still in its first safety stage. Building that buffer reduces the chance that an unexpected expense creates new debt.',
    };
    if (safeExtra > 0 && debtTarget && (debtTarget.apr >= 10 || !topGoal || topGoal.priority > 1)) return {
      type: 'debt', amount: Math.min(safeExtra, debtTarget.balance), confidence: debtTarget.apr >= 20 ? 97 : 91,
      title: `Pay ${money.format(Math.min(safeExtra, debtTarget.balance))} toward ${debtTarget.name}.`,
      reason: strategy === 'avalanche'
        ? `${debtTarget.name} is the highest-APR debt at ${debtTarget.apr.toFixed(2)}%, so this payment is expected to reduce interest most efficiently.`
        : `${debtTarget.name} has the smallest remaining balance, creating the fastest payoff win under your snowball strategy.`,
    };
    if (safeExtra > 0 && topGoal) return {
      type: 'goal', amount: Math.min(safeExtra, topGoal.targetAmount - topGoal.currentAmount), confidence: 88,
      title: `Put ${money.format(Math.min(safeExtra, topGoal.targetAmount - topGoal.currentAmount))} toward ${topGoal.name}.`,
      reason: `${topGoal.name} is your highest-priority unfinished goal, and no higher-cost debt currently overrides it.`,
    };
    if (safeExtra > 0 && debtTarget) return {
      type: 'debt', amount: Math.min(safeExtra, debtTarget.balance), confidence: 86,
      title: `Pay ${money.format(Math.min(safeExtra, debtTarget.balance))} toward ${debtTarget.name}.`,
      reason: 'Required expenses and your checking cushion are covered, so the remaining cash can accelerate debt payoff.',
    };
    return { type: 'none', amount: 0, confidence: 75, title: 'Your required cash is protected.', reason: 'Add a debt or unfinished goal to receive a next-action recommendation.' };
  }, [availableBeforeCushion, cushionGap, safeExtra, emergencyGoal, monthlyIncome, debtTarget, topGoal, strategy]);

  const health = useMemo(() => {
    const debtBurden = monthlyIncome ? monthlyMinimums / monthlyIncome : 1;
    const cushionScore = checkingCushion <= 0 ? 10 : Math.min(20, checking / checkingCushion * 20);
    const cashFlowScore = payPerCheck <= 0 ? 0 : Math.min(35, safeExtra / payPerCheck * 100);
    const goalScore = goals.length ? Math.min(10, goals.reduce((sum, goal) => sum + Math.min(1, goal.currentAmount / Math.max(1, goal.targetAmount)), 0) / goals.length * 10) : 0;
    return Math.max(0, Math.min(100, Math.round(35 + cushionScore + cashFlowScore + goalScore - debtBurden * 35)));
  }, [payPerCheck, monthlyIncome, monthlyMinimums, checking, checkingCushion, safeExtra, goals]);

  function updateDebt(id: string, field: keyof Debt, value: string) {
    setDebts(items => items.map(item => item.id === id ? { ...item, [field]: field === 'name' ? value : Number(value) } : item));
  }
  function updateBill(id: string, field: keyof Bill, value: string) {
    setBills(items => items.map(item => item.id === id ? { ...item, [field]: field === 'name' || field === 'frequency' ? value : Number(value) } : item));
  }
  function addDebt() { setDebts(items => [...items, { id: `new-${crypto.randomUUID()}`, name: 'New debt', balance: 0, apr: 0, minimum: 0 }]); }
  function addBill() { setBills(items => [...items, { id: `new-${crypto.randomUUID()}`, name: 'New bill', amount: 0, dueDay: 1, frequency: 'monthly' }]); }

  async function save() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true);
    setNotice('Saving…');
    const { error: profileError } = await supabase.from('profiles').upsert({
      user_id: userId, pay_frequency: payFrequency, weekly_take_home: payPerCheck, checking_balance: checking,
      savings_balance: savings, weekly_living_reserve: livingReserve, checking_cushion: checkingCushion,
      preferred_strategy: strategy, updated_at: new Date().toISOString(),
    });
    const { error: deleteDebtError } = await supabase.from('debts').delete().eq('user_id', userId);
    const { error: debtError } = debts.length ? await supabase.from('debts').insert(debts.map(debt => ({ user_id: userId, name: debt.name, balance: debt.balance, apr: debt.apr, minimum_payment: debt.minimum }))) : { error: null };
    const { error: deleteBillError } = await supabase.from('bills').delete().eq('user_id', userId);
    const { error: billError } = bills.length ? await supabase.from('bills').insert(bills.map(bill => ({ user_id: userId, name: bill.name, amount: bill.amount, due_day: Math.min(31, Math.max(1, bill.dueDay)), frequency: bill.frequency }))) : { error: null };
    const error = profileError || deleteDebtError || debtError || deleteBillError || billError;
    setNotice(error ? `Save failed: ${error.message}` : 'Saved successfully. Your paycheck plan is up to date.');
    setSaving(false);
  }

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
    window.location.assign('/login');
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading DebtPilot…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Gauge size={16}/> Paycheck financial command center</div><h1 className="text-4xl font-semibold">DebtPilot</h1><p className="mt-2 text-slate-400">Cover the next pay cycle, protect your safety buffers, then fund the highest-value priority.</p></div>
      <div className="flex gap-3"><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={18}/>{saving ? 'Saving…' : 'Save plan'}</button><button onClick={signOut} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-slate-300"><LogOut size={18}/>Sign out</button></div>
    </header>

    {notice && <p role="status" aria-live="polite" className="mb-5 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">{notice}</p>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<WalletCards/>} label="Checking" value={money.format(checking)}/>
      <Metric icon={<CalendarDays/>} label={`Bills due in ${schedule.cycleDays} days`} value={money.format(billsReserve)}/>
      <Metric icon={<CreditCard/>} label="Total debt" value={money.format(totalDebt)}/>
      <Metric icon={<Gauge/>} label="Available after essentials" value={money.format(Math.max(0, availableBeforeCushion))} accent/>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-3">
      <Card title="Paycheck planner" className="xl:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-slate-400"><HelpLabel label="Pay frequency" help="How often you receive your regular paycheck. This controls how monthly obligations are converted into a per-paycheck reserve."/><select className="field mt-1 w-full" value={payFrequency} onChange={e => setPayFrequency(e.target.value as PayFrequency)}><option value="weekly">Weekly — 52 checks/year</option><option value="biweekly">Every 2 weeks — 26/year</option><option value="semimonthly">Twice monthly — 24/year</option><option value="monthly">Monthly — 12/year</option></select></label>
          <NumberField label="Net pay per check" help="The amount deposited after taxes and payroll deductions." value={payPerCheck} onChange={setPayPerCheck}/>
          <NumberField label="Living reserve per check" help="Money protected for groceries, fuel, personal spending, and everyday expenses until the next check." value={livingReserve} onChange={setLivingReserve}/>
          <NumberField label="Checking balance" help="Your currently available checking balance after pending transactions." value={checking} onChange={setChecking}/>
          <NumberField label="Protected checking cushion" help="The minimum checking balance you prefer to leave untouched for surprises and timing differences." value={checkingCushion} onChange={setCheckingCushion}/>
          <NumberField label="Savings balance" help="Your current total savings balance. Goal progress is managed separately on the Goals page." value={savings} onChange={setSavings}/>
          <label className="block text-xs text-slate-400"><HelpLabel label="Debt strategy" help="Avalanche minimizes interest by targeting the highest APR. Snowball targets the smallest balance first."/><select className="field mt-1 w-full" value={strategy} onChange={e => setStrategy(e.target.value as 'avalanche' | 'snowball')}><option value="avalanche">Avalanche — highest APR</option><option value="snowball">Snowball — smallest balance</option></select></label>
        </div>
        <div className="mt-6 grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 sm:grid-cols-4">
          <Stat label={`${schedule.label} paycheck`} value={money.format(payPerCheck)}/><Stat label="Bills reserved" value={money.format(billsReserve)}/><Stat label="Living + minimums" value={money.format(livingReserve + minimumReservePerCheck)}/><Stat label="After cushion" value={money.format(safeExtra)}/>
        </div>
        <p className="mt-3 text-xs text-slate-500">Annualized take-home: {money.format(annualIncome)} • Monthly equivalent: {money.format(monthlyIncome)}</p>
      </Card>

      <Card title="Pilot recommendation">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">{recommendation.type === 'goal' ? <Target size={14}/> : recommendation.type === 'debt' ? <CreditCard size={14}/> : <WalletCards size={14}/>} {recommendation.type === 'none' ? 'No extra action' : recommendation.type}</div>
        <p className="text-2xl font-semibold">{recommendation.title}</p>
        <p className="mt-4 text-sm leading-6 text-slate-400">{recommendation.reason}</p>
        <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4"><p className="text-xs uppercase tracking-widest text-cyan-300">Confidence</p><p className="mt-1 text-3xl font-semibold">{recommendation.confidence}%</p></div>
      </Card>
    </section>

    {topGoal && <section className="mt-6"><Card title="Highest-priority unfinished goal"><div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex items-center gap-2"><Target className="text-cyan-300"/><p className="text-xl font-semibold">{topGoal.name}</p></div><p className="mt-2 text-sm text-slate-400">Priority {topGoal.priority} • {money.format(topGoal.currentAmount)} of {money.format(topGoal.targetAmount)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, topGoal.currentAmount / Math.max(1, topGoal.targetAmount) * 100)}%` }}/></div></div><a href="/goals" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300">Manage goals</a></div></Card></section>}

    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card title="Bills"><button onClick={addBill} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300"><Plus size={16}/>Add bill</button><div className="space-y-3">{bills.length === 0 && <Empty text="Add recurring bills so DebtPilot can reserve them before recommending extra payments."/>}{bills.map(bill => <div key={bill.id} className="grid gap-3 rounded-2xl border border-slate-800 p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end"><TextField label="Bill" value={bill.name} onChange={value => updateBill(bill.id, 'name', value)}/><NumberField label="Amount" value={bill.amount} onChange={value => updateBill(bill.id, 'amount', String(value))}/><NumberField label="Due day" value={bill.dueDay} onChange={value => updateBill(bill.id, 'dueDay', String(value))}/><label className="block text-xs text-slate-400">Frequency<select className="field mt-1 w-full" value={bill.frequency} onChange={e => updateBill(bill.id, 'frequency', e.target.value)}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label><button aria-label={`Remove ${bill.name}`} onClick={() => setBills(items => items.filter(item => item.id !== bill.id))} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button></div>)}</div></Card>

      <Card title="Debt accounts"><button onClick={addDebt} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300"><Plus size={16}/>Add debt</button><div className="space-y-3">{debts.length === 0 && <Empty text="Add each credit card or loan with its balance, APR, and monthly minimum."/>}{debts.map(debt => <div key={debt.id} className="grid gap-3 rounded-2xl border border-slate-800 p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end"><TextField label="Account" value={debt.name} onChange={value => updateDebt(debt.id, 'name', value)}/><NumberField label="Balance" value={debt.balance} onChange={value => updateDebt(debt.id, 'balance', String(value))}/><NumberField label="APR %" value={debt.apr} onChange={value => updateDebt(debt.id, 'apr', String(value))} step="0.01"/><NumberField label="Monthly minimum" value={debt.minimum} onChange={value => updateDebt(debt.id, 'minimum', String(value))}/><button aria-label={`Remove ${debt.name}`} onClick={() => setDebts(items => items.filter(item => item.id !== debt.id))} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button></div>)}</div></Card>
    </section>

    <section className="mt-6 grid gap-4 md:grid-cols-2"><Card title="Due before the next paycheck">{billsDueSoon.length ? <div className="space-y-3">{billsDueSoon.map(bill => <div key={bill.id} className="flex items-center justify-between rounded-xl border border-slate-800 p-3"><div><p className="font-medium">{bill.name}</p><p className="text-xs text-slate-500">{bill.frequency === 'weekly' ? 'Weekly' : `Due in ${daysUntilDue(bill.dueDay)} day(s)`}</p></div><p className="font-semibold">{money.format(bill.amount)}</p></div>)}</div> : <Empty text={`No saved bills fall within the next ${schedule.cycleDays} days.`}/>}</Card><Card title="Financial health"><p className="text-5xl font-semibold">{health}<span className="text-lg text-slate-500">/100</span></p><p className="mt-4 text-sm leading-6 text-slate-400">The score considers required-payment burden, cash flow, checking cushion coverage, and goal progress.</p></Card></section>

    <p className="mt-6 text-xs leading-5 text-slate-500">Planning estimates only. Confirm lender minimums, statement timing, bill due dates, and savings needs before moving money.</p>
  </div></main>;
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) { return <div className={`rounded-3xl border border-slate-800 bg-slate-900 p-6 ${className}`}><h2 className="mb-5 text-2xl font-semibold">{title}</h2>{children}</div>; }
function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm leading-6 text-slate-500">{text}</p>; }
function HelpLabel({ label, help }: { label: string; help: string }) { return <span className="flex items-center gap-1.5"><span>{label}</span><span className="group relative inline-flex"><button type="button" aria-label={`About ${label}`} className="rounded-full text-slate-500 transition hover:text-cyan-300 focus:text-cyan-300"><Info size={14}/></button><span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-xs leading-5 text-slate-300 shadow-xl group-hover:block group-focus-within:block">{help}</span></span></span>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" value={value} onChange={e => onChange(e.target.value)}/></label>; }
function NumberField({ label, value, onChange, step = '1', help }: { label: string; value: number; onChange: (value: number) => void; step?: string; help?: string }) { return <label className="block text-xs text-slate-400">{help ? <HelpLabel label={label} help={help}/> : label}<input className="field mt-1 w-full" type="number" step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>; }
