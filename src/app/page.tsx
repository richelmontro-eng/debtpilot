'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, CreditCard, Gauge, Info, ListChecks, LogOut, Plus, Save, Target, Trash2, Trophy, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getPilotBriefing, getRecommendationId, type CompletedRecommendation, type PilotCategory } from '@/lib/pilot';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

type Debt = { id: string; name: string; balance: number; apr: number; minimum: number };
type Bill = { id: string; name: string; amount: number; dueDay: number; frequency: string };
type Goal = { id: string; name: string; goalType: string; targetAmount: number; currentAmount: number; priority: number };
type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

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

type SaveResult<T> = { items: T[]; error: PostgrestError | null };

function isMissingRecommendationHistory(error: PostgrestError | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

async function saveDebtsSafely(supabase: SupabaseClient, userId: string, debts: Debt[]): Promise<SaveResult<Debt>> {
  const { data: existing, error: readError } = await supabase.from('debts').select('id').eq('user_id', userId);
  if (readError) return { items: debts, error: readError };

  const saved: Debt[] = [];
  for (const [index, debt] of debts.entries()) {
    const payload = {
      user_id: userId,
      name: debt.name,
      balance: Math.max(0, debt.balance),
      apr: Math.max(0, debt.apr),
      minimum_payment: Math.max(0, debt.minimum),
    };
    const query = debt.id.startsWith('new-')
      ? supabase.from('debts').insert(payload)
      : supabase.from('debts').upsert({ id: debt.id, ...payload }, { onConflict: 'id' });
    const { data, error } = await query.select('id').single();
    if (error) return { items: [...saved, ...debts.slice(index)], error };
    saved.push({ ...debt, id: data.id });
  }

  const savedIds = new Set(saved.map(debt => debt.id));
  const removedIds = (existing ?? []).map(row => row.id).filter(id => !savedIds.has(id));
  if (removedIds.length) {
    const { error } = await supabase.from('debts').delete().eq('user_id', userId).in('id', removedIds);
    if (error) return { items: saved, error };
  }
  return { items: saved, error: null };
}

async function saveBillsSafely(supabase: SupabaseClient, userId: string, bills: Bill[]): Promise<SaveResult<Bill>> {
  const { data: existing, error: readError } = await supabase.from('bills').select('id').eq('user_id', userId);
  if (readError) return { items: bills, error: readError };

  const saved: Bill[] = [];
  for (const [index, bill] of bills.entries()) {
    const payload = {
      user_id: userId,
      name: bill.name,
      amount: Math.max(0, bill.amount),
      due_day: Math.min(31, Math.max(1, bill.dueDay)),
      frequency: bill.frequency,
    };
    const query = bill.id.startsWith('new-')
      ? supabase.from('bills').insert(payload)
      : supabase.from('bills').upsert({ id: bill.id, ...payload }, { onConflict: 'id' });
    const { data, error } = await query.select('id').single();
    if (error) return { items: [...saved, ...bills.slice(index)], error };
    saved.push({ ...bill, id: data.id, amount: payload.amount, dueDay: payload.due_day });
  }

  const savedIds = new Set(saved.map(bill => bill.id));
  const removedIds = (existing ?? []).map(row => row.id).filter(id => !savedIds.has(id));
  if (removedIds.length) {
    const { error } = await supabase.from('bills').delete().eq('user_id', userId).in('id', removedIds);
    if (error) return { items: saved, error };
  }
  return { items: saved, error: null };
}

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [completingRecommendation, setCompletingRecommendation] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [recommendationHistory, setRecommendationHistory] = useState<CompletedRecommendation[]>([]);
  const [recommendationHistoryUnavailable, setRecommendationHistoryUnavailable] = useState(false);
  const [displayName, setDisplayName] = useState('');
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
      const [profileResult, debtResult, billResult, goalResult, historyResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('bills').select('*').eq('user_id', user.id).order('due_day'),
        supabase.from('goals').select('*').eq('user_id', user.id).order('priority').order('created_at'),
        supabase.from('pilot_recommendation_history').select('*').eq('user_id', user.id).order('completed_at', { ascending: false }).limit(5),
      ]);
      const historyTableMissing = isMissingRecommendationHistory(historyResult.error);
      const loadError = profileResult.error || debtResult.error || billResult.error || goalResult.error || (historyTableMissing ? null : historyResult.error);
      if (loadError) setNotice(`Load failed: ${loadError.message}`);
      if (historyTableMissing) {
        setRecommendationHistoryUnavailable(true);
        if (!loadError) setNotice('Recommendation history is not available yet.');
      }
      const profile = profileResult.data;
      if (!profile?.onboarding_completed) {
        router.replace('/welcome');
        return;
      }
      if (profile) {
        setDisplayName(profile.display_name ?? '');
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
      setRecommendationHistory((historyResult.data ?? []).map(row => ({
        id: row.id,
        recommendationId: row.recommendation_id,
        title: row.title,
        category: row.category as PilotCategory,
        confidence: Number(row.confidence),
        estimatedBenefit: Number(row.estimated_benefit),
        reasoning: Array.isArray(row.reasoning) ? row.reasoning.filter((item: unknown): item is string => typeof item === 'string') : [],
        completedAt: row.completed_at,
      })));
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
  const incompleteGoals = [...goals].filter(goal => goal.targetAmount > goal.currentAmount).sort((a, b) => a.priority - b.priority || (a.targetAmount - a.currentAmount) - (b.targetAmount - b.currentAmount));
  const topGoal = incompleteGoals[0];
  const annualIncome = payPerCheck * schedule.periods;
  const monthlyIncome = annualIncome / 12;

  const briefing = getPilotBriefing({
    availableBeforeCushion,
    cushionGap,
    safeExtra,
    monthlyIncome,
    payPerCheck,
    monthlyMinimums,
    checking,
    checkingCushion,
    strategy,
    debts,
    goals,
    billsDueSoon: billsDueSoon.map(bill => ({
      ...bill,
      dueInDays: bill.frequency === 'weekly' ? 0 : daysUntilDue(bill.dueDay),
    })),
  });
  const pilot = briefing.recommendation;
  const emergencyGoal = goals.find(goal => goal.goalType === 'emergency_fund');
  const emergencyProgress = emergencyGoal?.targetAmount
    ? Math.min(100, Math.round(emergencyGoal.currentAmount / emergencyGoal.targetAmount * 100))
    : null;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const financialSummary = pilot.category === 'none'
    ? pilot.description
    : `${briefing.pulse.label} overall: ${pilot.description}`;
  const timeHorizon = pilot.category === 'cushion' ? 'Before optional spending' : pilot.category === 'none' ? 'Through next payday' : 'This pay cycle';
  const missingInformation = [
    ...(payPerCheck <= 0 ? [{ label: 'Net pay per check', detail: 'Add income so Pilot can calculate a safe spending and payment plan.', href: '/settings' }] : []),
    ...(checkingCushion <= 0 ? [{ label: 'Protected checking cushion', detail: 'Set a floor so recommendations never use cash you want kept available.', href: '/settings' }] : []),
    ...(bills.length === 0 ? [{ label: 'Recurring bills', detail: 'Add bills so each pay-cycle briefing reserves upcoming obligations.', href: '#bills' }] : []),
    ...(debts.length === 0 ? [{ label: 'Debt accounts', detail: 'Add balances, APRs, and minimums to unlock payoff guidance.', href: '#debts' }] : []),
    ...(goals.length === 0 ? [{ label: 'Financial goals', detail: 'Add a goal so Pilot can direct safe extra cash toward what matters.', href: '/goals' }] : []),
  ];
  const recommendationId = getRecommendationId(pilot);
  const isRecommendationComplete = recommendationHistory.some(item => item.recommendationId === recommendationId);

  async function markRecommendationComplete() {
    const supabase = createClient();
    if (!supabase || !userId || isRecommendationComplete || completingRecommendation) return;
    setCompletingRecommendation(true);
    const { data, error } = await supabase.from('pilot_recommendation_history').insert({
      user_id: userId,
      recommendation_id: recommendationId,
      category: pilot.category,
      title: pilot.title,
      confidence: pilot.confidence,
      estimated_benefit: String(pilot.estimatedBenefit),
      reasoning: pilot.reasoning,
    }).select('*').single();
    if (error) {
      if (isMissingRecommendationHistory(error)) {
        setRecommendationHistoryUnavailable(true);
        setNotice('Recommendation history is not available yet.');
        setCompletingRecommendation(false);
        return;
      }
      setNotice(`Could not complete recommendation: ${error.message}`);
      setCompletingRecommendation(false);
      return;
    }
    const completed: CompletedRecommendation = {
      id: data.id,
      recommendationId: data.recommendation_id,
      title: data.title,
      category: data.category as PilotCategory,
      confidence: Number(data.confidence),
      estimatedBenefit: Number(data.estimated_benefit),
      reasoning: Array.isArray(data.reasoning) ? data.reasoning.filter((item: unknown): item is string => typeof item === 'string') : [],
      completedAt: data.completed_at,
    };
    setRecommendationHistory(items => [completed, ...items].slice(0, 5));
    setCompletingRecommendation(false);
  }

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
      user_id: userId, weekly_take_home: payPerCheck, checking_balance: checking,
      savings_balance: savings, weekly_living_reserve: livingReserve, checking_cushion: checkingCushion,
      preferred_strategy: strategy, updated_at: new Date().toISOString(),
    });
    const [debtResult, billResult] = await Promise.all([
      saveDebtsSafely(supabase, userId, debts),
      saveBillsSafely(supabase, userId, bills),
    ]);
    setDebts(debtResult.items);
    setBills(billResult.items);
    const error = profileError || debtResult.error || billResult.error;
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

    <section className="overflow-hidden rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/15 via-slate-900 to-slate-900 p-7 sm:p-9">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div><p className="text-sm font-medium text-cyan-300">{greeting}{displayName ? `, ${displayName}` : ''}</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Your financial briefing</h2><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">{financialSummary}</p></div>
        <div className="flex items-center gap-4 rounded-2xl border border-slate-700/80 bg-slate-950/60 p-5"><div role="img" aria-label={`Financial health ${briefing.pulse.score} out of 100`} className="grid h-20 w-20 place-items-center rounded-full border-4 border-cyan-400/70 bg-slate-900"><span className="text-2xl font-semibold">{briefing.pulse.score}</span></div><div><p className="text-xs uppercase tracking-widest text-slate-500">Financial health</p><p className="mt-1 text-xl font-semibold text-cyan-300">{briefing.pulse.label}</p></div></div>
      </div>
    </section>

    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Insight icon={<CalendarDays/>} title={billsReserve <= Math.max(0, payPerCheck - livingReserve - minimumReservePerCheck) ? 'Upcoming bills are covered.' : 'Upcoming bills need attention.'} detail={`${money.format(billsReserve)} is reserved for bills due before your next ${schedule.label.toLowerCase()} paycheck.`}/>
      <Insight icon={<Target/>} title={emergencyProgress === null ? 'Emergency fund is not defined.' : `Emergency fund is ${emergencyProgress}% funded.`} detail={emergencyGoal ? `${money.format(emergencyGoal.currentAmount)} saved toward a ${money.format(emergencyGoal.targetAmount)} target.` : 'Create an emergency-fund goal to track your first line of financial defense.'}/>
      <Insight icon={<WalletCards/>} title={`${money.format(safeExtra)} is safe to direct.`} detail={`${money.format(Math.max(0, availableBeforeCushion))} remains after essentials; Pilot protects a ${money.format(checkingCushion)} checking cushion first.`}/>
      <Insight icon={<CreditCard/>} title={totalDebt > 0 ? `${money.format(totalDebt)} remains across ${debts.length} debt${debts.length === 1 ? '' : 's'}.` : 'No active debt is recorded.'} detail={totalDebt > 0 ? `${money.format(monthlyMinimums)} in monthly minimums is included before extra payments.` : 'Add any credit cards or loans to receive a payoff priority.'}/>
    </section>

    {missingInformation.length > 0 && <section className="mt-6"><Card title="Missing information"><p className="-mt-2 mb-5 text-sm leading-6 text-slate-400">Complete these details to make your briefing and Pilot recommendation more precise.</p><div className="grid gap-3 md:grid-cols-2">{missingInformation.map(item => <Link key={item.label} href={item.href} className="group flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 transition hover:border-amber-400/40"><ListChecks className="mt-0.5 shrink-0 text-amber-300" size={19}/><span className="min-w-0 flex-1"><span className="block font-medium text-slate-200">{item.label}</span><span className="mt-1 block text-sm leading-5 text-slate-500">{item.detail}</span></span><ArrowRight className="mt-1 shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-amber-300" size={17}/></Link>)}</div></Card></section>}

    <section className="mt-6 grid gap-6 xl:grid-cols-3">
      <Card title="Paycheck planner" className="xl:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="block text-xs text-slate-400"><HelpLabel label="Pay frequency" help="Pay frequency is managed in Settings. DebtPilot uses it to convert monthly obligations into a per-paycheck reserve."/><div className="field mt-1 w-full text-slate-200" aria-label="Pay frequency">{schedule.label}</div></div>
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
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">{pilot.category === 'goal' ? <Target size={14}/> : pilot.category === 'debt' ? <CreditCard size={14}/> : <WalletCards size={14}/>} {pilot.category === 'none' ? 'No extra action' : pilot.category}</div>
        <p className="text-2xl font-semibold">{pilot.title}</p>
        <p className="mt-4 text-sm leading-6 text-slate-400">{pilot.description}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4"><p className="text-xs uppercase tracking-widest text-cyan-300">Expected impact</p><p className="mt-1 text-xl font-semibold">{pilot.estimatedBenefit > 0 ? money.format(pilot.estimatedBenefit) : 'Cash protected'}</p></div><div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Confidence</p><p className="mt-1 text-xl font-semibold">{pilot.confidence}%</p></div><div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Time horizon</p><p className="mt-1 text-base font-semibold">{timeHorizon}</p></div></div>
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" aria-expanded={whyOpen} aria-controls="pilot-reasoning" onClick={() => setWhyOpen(open => !open)} className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-medium text-cyan-300">{whyOpen ? 'Hide details' : 'Why?'}</button><button type="button" disabled={recommendationHistoryUnavailable || isRecommendationComplete || completingRecommendation} onClick={markRecommendationComplete} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-default disabled:bg-emerald-400"><CheckCircle2 size={16}/>{isRecommendationComplete ? 'Completed' : 'Mark Complete'}</button></div>
        {whyOpen && <div id="pilot-reasoning" className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Stat label="Confidence" value={`${pilot.confidence}%`}/>
            <Stat label="Estimated benefit" value={money.format(pilot.estimatedBenefit)}/>
            <Stat label="Recommendation category" value={pilot.category === 'none' ? 'No extra action' : pilot.category}/>
            <Stat label="Priority" value={pilot.priority}/>
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-cyan-300">Reasoning</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{pilot.reasoning.map(reason => <li key={reason}>{reason}</li>)}</ul>
        </div>}
      </Card>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card title="Financial Pulse">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div role="img" aria-label={`Financial health ${briefing.pulse.score} out of 100`} className="grid h-48 w-48 shrink-0 place-items-center rounded-full p-4" style={{ background: `conic-gradient(rgb(34 211 238) ${briefing.pulse.score * 3.6}deg, rgb(30 41 59) 0deg)` }}><div className="grid h-full w-full place-items-center rounded-full bg-slate-900 text-center"><div><p className="text-5xl font-semibold">{briefing.pulse.score}</p><p className="mt-1 text-xs uppercase tracking-widest text-cyan-300">{briefing.pulse.label}</p></div></div></div>
          <div><p className="text-sm font-medium text-slate-200">Why this pulse was assigned</p><ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-400">{briefing.pulse.explanation.map(item => <li key={item}>{item}</li>)}</ul></div>
        </div>
      </Card>
      <Card title="Financial Inbox">
        <div className="space-y-0">{briefing.inbox.map((item, index) => <div key={item.id} className="relative flex gap-4 pb-5 last:pb-0">{index < briefing.inbox.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-slate-700"/>}<div className={`z-10 mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border ${item.urgency === 'now' ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-cyan-400/30 bg-slate-950 text-cyan-300'}`}><Clock3 size={14}/></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="font-medium">{item.title}</p>{item.amount !== undefined && <p className="shrink-0 font-semibold text-cyan-300">{money.format(item.amount)}</p>}</div><p className="mt-1 text-sm leading-5 text-slate-500">{item.description}</p></div></div>)}</div>
      </Card>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card title="Recent Wins"><div className="space-y-3">{briefing.recentWins.map(win => <div key={win} className="flex gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4"><Trophy className="mt-0.5 shrink-0 text-emerald-300" size={18}/><p className="text-sm leading-6 text-slate-300">{win}</p></div>)}</div></Card>
      <Card title="Recommendation History">{recommendationHistory.length ? <div className="space-y-3">{recommendationHistory.slice(0, 5).map(item => <div key={item.id} className="rounded-2xl border border-slate-800 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{item.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{item.category} • {new Date(item.completedAt).toLocaleDateString()}</p></div><CheckCircle2 className="shrink-0 text-emerald-300" size={19}/></div>{item.estimatedBenefit > 0 && <p className="mt-3 text-sm font-semibold text-cyan-300">{money.format(item.estimatedBenefit)} estimated benefit</p>}</div>)}</div> : <Empty text={recommendationHistoryUnavailable ? 'Recommendation history is not available yet. Apply the history migration to start recording completed actions.' : 'No completed recommendations yet. Mark the current Pilot recommendation complete to record your first win.'}/>}</Card>
    </section>

    {topGoal && <section className="mt-6"><Card title="Highest-priority unfinished goal"><div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex items-center gap-2"><Target className="text-cyan-300"/><p className="text-xl font-semibold">{topGoal.name}</p></div><p className="mt-2 text-sm text-slate-400">Priority {topGoal.priority} • {money.format(topGoal.currentAmount)} of {money.format(topGoal.targetAmount)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, topGoal.currentAmount / Math.max(1, topGoal.targetAmount) * 100)}%` }}/></div></div><a href="/goals" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300">Manage goals</a></div></Card></section>}

    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <div id="bills">
      <Card title="Bills"><button onClick={addBill} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300"><Plus size={16}/>Add bill</button><div className="space-y-3">{bills.length === 0 && <Empty text="Add recurring bills so DebtPilot can reserve them before recommending extra payments."/>}{bills.map(bill => <div key={bill.id} className="grid gap-3 rounded-2xl border border-slate-800 p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end"><TextField label="Bill" value={bill.name} onChange={value => updateBill(bill.id, 'name', value)}/><NumberField label="Amount" value={bill.amount} onChange={value => updateBill(bill.id, 'amount', String(value))}/><NumberField label="Due day" value={bill.dueDay} onChange={value => updateBill(bill.id, 'dueDay', String(value))}/><label className="block text-xs text-slate-400">Frequency<select className="field mt-1 w-full" value={bill.frequency} onChange={e => updateBill(bill.id, 'frequency', e.target.value)}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label><button aria-label={`Remove ${bill.name}`} onClick={() => setBills(items => items.filter(item => item.id !== bill.id))} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button></div>)}</div></Card>
      </div>

      <div id="debts">
      <Card title="Debt accounts"><button onClick={addDebt} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300"><Plus size={16}/>Add debt</button><div className="space-y-3">{debts.length === 0 && <Empty text="Add each credit card or loan with its balance, APR, and monthly minimum."/>}{debts.map(debt => <div key={debt.id} className="grid gap-3 rounded-2xl border border-slate-800 p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end"><TextField label="Account" value={debt.name} onChange={value => updateDebt(debt.id, 'name', value)}/><NumberField label="Balance" value={debt.balance} onChange={value => updateDebt(debt.id, 'balance', String(value))}/><NumberField label="APR %" value={debt.apr} onChange={value => updateDebt(debt.id, 'apr', String(value))} step="0.01"/><NumberField label="Monthly minimum" value={debt.minimum} onChange={value => updateDebt(debt.id, 'minimum', String(value))}/><button aria-label={`Remove ${debt.name}`} onClick={() => setDebts(items => items.filter(item => item.id !== debt.id))} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button></div>)}</div></Card>
      </div>
    </section>

    <p className="mt-6 text-xs leading-5 text-slate-500">Planning estimates only. Confirm lender minimums, statement timing, bill due dates, and savings needs before moving money.</p>
  </div></main>;
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) { return <div className={`rounded-3xl border border-slate-800 bg-slate-900 p-6 ${className}`}><h2 className="mb-5 text-2xl font-semibold">{title}</h2>{children}</div>; }
function Insight({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="text-cyan-300">{icon}</div><h3 className="mt-4 text-lg font-semibold leading-6">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p></article>; }
function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm leading-6 text-slate-500">{text}</p>; }
function HelpLabel({ label, help }: { label: string; help: string }) { return <span className="flex items-center gap-1.5"><span>{label}</span><span className="group relative inline-flex"><button type="button" aria-label={`About ${label}`} className="rounded-full text-slate-500 transition hover:text-cyan-300 focus:text-cyan-300"><Info size={14}/></button><span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-xs leading-5 text-slate-300 shadow-xl group-hover:block group-focus-within:block">{help}</span></span></span>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" value={value} onChange={e => onChange(e.target.value)}/></label>; }
function NumberField({ label, value, onChange, step = '1', help }: { label: string; value: number; onChange: (value: number) => void; step?: string; help?: string }) { return <label className="block text-xs text-slate-400">{help ? <HelpLabel label={label} help={help}/> : label}<input className="field mt-1 w-full" type="number" step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>; }
