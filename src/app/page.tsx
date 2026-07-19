'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, CreditCard, Gauge, Info, ListChecks, Save, Target, Trophy, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { getRecommendationId, type CompletedRecommendation, type PilotCategory } from '@/lib/pilot';
import { buildCommandCenter, getSafeDashboardError } from '@/lib/intelligence';
import PilotReasoning from '@/components/pilot-reasoning';
import { PilotCheckIn } from '@/components/pilot-check-in';
import { analyzePromotion, promotionStatusLabel } from '@/lib/promotions';
import { getSafeBillSaveMessage, logBillSaveError, validateOnboardingBill } from '@/lib/onboarding-bills';
import { mapDebtRow, optionalNumber, saveDebts, type PersistedDebt } from '@/lib/debt-persistence';
import { activeOccurrences, occurrenceDrafts, type BillOccurrence } from '@/lib/bill-occurrences';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

type Debt = PersistedDebt;
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

type SaveResult<T> = { items: T[]; error: PostgrestError | null; message?: string };

function isMissingRecommendationHistory(error: PostgrestError | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

async function saveDebtsSafely(supabase: SupabaseClient, userId: string, debts: Debt[]): Promise<SaveResult<Debt>> {
  const result = await saveDebts({
    upsert: async payload => { const { error } = await supabase.from('debts').upsert(payload, { onConflict: 'id' }); return { error }; },
    reload: async () => { const { data, error } = await supabase.from('debts').select('*').eq('user_id', userId).order('created_at'); return { rows: data ?? [], error }; },
    remove: async ids => { const { error } = await supabase.from('debts').delete().eq('user_id', userId).in('id', ids); return { error }; },
  }, userId, debts);
  return { items: result.debts, error: result.error as PostgrestError | null ?? null, message: result.ok ? result.warning : result.message };
}

async function saveBillsSafely(supabase: SupabaseClient, userId: string, bills: Bill[]): Promise<SaveResult<Bill>> {
  for (const bill of bills) {
    const validation = validateOnboardingBill(bill);
    if (validation) return { items: bills, error: null, message: validation };
  }
  const { data: existing, error: readError } = await supabase.from('bills').select('id').eq('user_id', userId);
  if (readError) { logBillSaveError('dashboard select bill ids', readError); return { items: bills, error: readError, message: 'Bills could not be loaded for saving. Please try again.' }; }

  const saved: Bill[] = [];
  for (const [index, bill] of bills.entries()) {
    const payload = {
      user_id: userId,
      name: bill.name,
      amount: Math.max(0, bill.amount),
      due_day: Math.min(31, Math.max(1, bill.dueDay)),
      frequency: bill.frequency,
    };
    const query = supabase.from('bills').upsert({ id: bill.id, ...payload }, { onConflict: 'id' });
    const { data, error } = await query.select('id').single();
    if (error) { logBillSaveError('dashboard upsert bill', error, bill); return { items: [...saved, ...bills.slice(index)], error, message: getSafeBillSaveMessage(bill, error) }; }
    saved.push({ ...bill, id: data.id, amount: payload.amount, dueDay: payload.due_day });
  }

  const savedIds = new Set(saved.map(bill => bill.id));
  const removedIds = (existing ?? []).map(row => row.id).filter(id => !savedIds.has(id));
  if (removedIds.length) {
    const { error } = await supabase.from('bills').delete().eq('user_id', userId).in('id', removedIds);
    if (error) { logBillSaveError('dashboard remove deleted bills', error); return { items: saved, error, message: 'An older bill could not be removed. Please try again.' }; }
  }
  const { data: refreshed, error: reloadError } = await supabase.from('bills').select('*').eq('user_id', userId).order('due_day');
  if (reloadError) {
    logBillSaveError('dashboard reload after successful bill writes', reloadError);
    return { items: saved, error: null, message: 'Bills saved, but the refreshed bill list is temporarily unavailable.' };
  }
  return { items: (refreshed ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day), frequency: row.frequency })), error: null };
}

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completingRecommendation, setCompletingRecommendation] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [recommendationFocusPending, setRecommendationFocusPending] = useState(false);
  const [highlightedTarget, setHighlightedTarget] = useState<'plan' | 'recommendation' | null>(null);
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
  const [billOccurrences, setBillOccurrences] = useState<BillOccurrence[]>([]);
  const [goalContributions, setGoalContributions] = useState<Array<{ id: string; goalId: string; amount: number; contributedOn: string; createdAt: string }>>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setNotice(getSafeDashboardError());
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        setNotice(getSafeDashboardError());
        setLoadFailed(true);
      }
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
      if (loadError) {
        setNotice(getSafeDashboardError());
        setLoadFailed(true);
      }
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
      setDebts((debtResult.data ?? []).map(mapDebtRow));
      const loadedBills = (billResult.data ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' }));
      setBills(loadedBills);
      const drafts = occurrenceDrafts(user.id, loadedBills);
      if (drafts.length) await supabase.from('bill_occurrences').upsert(drafts.map(draft => ({ user_id: draft.userId, bill_id: draft.billId, due_date: draft.dueDate, expected_amount: draft.expectedAmount, status: draft.status })), { onConflict: 'user_id,bill_id,due_date', ignoreDuplicates: true });
      const occurrenceResult = await supabase.from('bill_occurrences').select('*').eq('user_id', user.id).order('due_date');
      if (!occurrenceResult.error) setBillOccurrences((occurrenceResult.data ?? []).map(row => ({ id: row.id, userId: row.user_id, billId: row.bill_id, dueDate: row.due_date, expectedAmount: Number(row.expected_amount), status: row.status, paidAt: row.paid_at, paidAmount: row.paid_amount == null ? null : Number(row.paid_amount), transactionId: row.transaction_id })));
      const contributionResult = await supabase.from('goal_contributions').select('*').eq('user_id', user.id).order('contributed_on', { ascending: false });
      if (!contributionResult.error) setGoalContributions((contributionResult.data ?? []).map(row => ({ id: row.id, goalId: row.goal_id, amount: Number(row.amount), contributedOn: row.contributed_on, createdAt: row.created_at })));
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

  useEffect(() => {
    if (!recommendationFocusPending || !whyOpen) return;
    const frame = requestAnimationFrame(() => {
      const panel = document.getElementById('pilot-recommendation-details');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        panel.focus({ preventScroll: true });
        setHighlightedTarget('recommendation');
        window.setTimeout(() => setHighlightedTarget(current => current === 'recommendation' ? null : current), 1600);
      }
      setRecommendationFocusPending(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [recommendationFocusPending, whyOpen]);

  const schedule = paySchedule[payFrequency];
  const billsDueSoon = useMemo(() => {
    if (!billOccurrences.length) return bills.filter(bill => bill.frequency === 'weekly' || daysUntilDue(bill.dueDay) <= schedule.cycleDays);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + schedule.cycleDays);
    return activeOccurrences(billOccurrences).filter(item => new Date(`${item.dueDate}T12:00:00`) <= cutoff).map(item => ({ id: item.billId, name: bills.find(bill => bill.id === item.billId)?.name ?? 'Bill', amount: Math.max(0, item.expectedAmount - (item.paidAmount ?? 0)), dueDay: new Date(`${item.dueDate}T12:00:00`).getDate(), frequency: 'occurrence' }));
  }, [bills, billOccurrences, schedule.cycleDays]);
  const billsReserve = billsDueSoon.reduce((sum, bill) => sum + bill.amount, 0);
  const intelligenceBills = billOccurrences.length ? activeOccurrences(billOccurrences).map(item => ({ id: item.billId, name: bills.find(bill => bill.id === item.billId)?.name ?? 'Bill', amount: Math.max(0, item.expectedAmount - (item.paidAmount ?? 0)), dueDay: new Date(`${item.dueDate}T12:00:00`).getDate(), frequency: 'occurrence' })) : bills;
  const monthlyMinimums = debts.reduce((sum, debt) => sum + debt.minimum, 0);
  const minimumReservePerCheck = monthlyMinimums * 12 / schedule.periods;
  const availableBeforeCushion = Math.max(0, payPerCheck - livingReserve - billsReserve - minimumReservePerCheck);
  const cushionGap = Math.max(0, checkingCushion - checking);
  const safeExtra = Math.max(0, availableBeforeCushion - cushionGap);
  const incompleteGoals = [...goals].filter(goal => goal.targetAmount > goal.currentAmount).sort((a, b) => a.priority - b.priority || (a.targetAmount - a.currentAmount) - (b.targetAmount - b.currentAmount));
  const topGoal = incompleteGoals[0];
  const annualIncome = payPerCheck * schedule.periods;
  const monthlyIncome = annualIncome / 12;

  const financialState = {
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
    payPeriodsPerYear: schedule.periods,
  };
  const commandCenter = buildCommandCenter({ now: new Date(), cycleDays: schedule.cycleDays, financialState, checking, checkingCushion, billsReserve, debts, bills: intelligenceBills, goals, recommendationHistory, billOccurrences: billOccurrences.map(item => ({ id:item.id, billId:item.billId, name:bills.find(bill=>bill.id===item.billId)?.name??'Bill', paidAt:item.paidAt, paidAmount:item.paidAmount, status:item.status })), goalContributions: goalContributions.map(item => ({ ...item, name: goals.find(goal => goal.id === item.goalId)?.name ?? 'Goal' })) });
  const briefing = commandCenter.pilot;
  const pilot = briefing.recommendation;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const briefingSummary = commandCenter.briefing;
  const timeHorizon = pilot.category === 'cushion' ? 'Before optional spending' : pilot.category === 'none' ? 'Through next payday' : 'This pay cycle';
  const missingInformation = commandCenter.missingInformation;
  const pilotInsights = commandCenter.insights;
  const timeline = commandCenter.timeline;
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
      setNotice('We could not mark this recommendation complete. Please try again.');
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

  async function markBillPaid(billId: string) {
    const occurrence = activeOccurrences(billOccurrences).filter(item => item.billId === billId).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    const supabase = createClient();
    if (!supabase || !occurrence) { window.location.assign('/bills'); return; }
    const paidAt = new Date().toISOString();
    const { error } = await supabase.from('bill_occurrences').update({ status: 'paid', paid_amount: occurrence.expectedAmount, paid_at: paidAt, updated_at: paidAt }).eq('id', occurrence.id).eq('user_id', userId);
    if (error) { setNotice('We couldn’t mark this bill paid. Please try again.'); return; }
    setBillOccurrences(items => items.map(item => item.id === occurrence.id ? { ...item, status: 'paid', paidAmount: item.expectedAmount, paidAt } : item));
    setNotice('Bill marked paid. It was removed from upcoming obligations.');
  }

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
    if (profileError && process.env.NODE_ENV !== 'production') console.error('[DebtPilot dashboard save]', { context: 'profile update after bill write', code: profileError.code, message: profileError.message, details: profileError.details, hint: profileError.hint });
    if (debtResult.error && process.env.NODE_ENV !== 'production') console.error('[DebtPilot dashboard save]', { context: 'debt update alongside bill write', code: debtResult.error.code, message: debtResult.error.message, details: debtResult.error.details, hint: debtResult.error.hint });
    setNotice(debtResult.message
      ?? billResult.message
      ?? (profileError ? "Bills saved, but we couldn't update your paycheck settings. Please try saving again."
        : debtResult.error ? "Bills saved, but one or more debt changes couldn't be saved. Review your debts and try again."
          : 'Saved successfully. Your paycheck plan is up to date.'));
    setSaving(false);
  }

  function reviewDashboardPlan() {
    const plan = document.getElementById('command-center-plan');
    if (!plan) { router.push('/paychecks'); return; }
    plan.scrollIntoView({ behavior: 'smooth', block: 'center' });
    plan.focus({ preventScroll: true });
    setHighlightedTarget('plan');
    window.setTimeout(() => setHighlightedTarget(current => current === 'plan' ? null : current), 1600);
  }

  function reviewRecommendation() {
    setWhyOpen(true);
    setRecommendationFocusPending(true);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading DebtPilot…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Gauge size={16}/> Paycheck financial command center</div><h1 className="text-4xl font-semibold">DebtPilot</h1><p className="mt-2 text-slate-400">Cover the next pay cycle, protect your safety buffers, then fund the highest-value priority.</p></div>
      <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={18}/>{saving ? 'Saving…' : 'Save plan'}</button>
    </header>

    {notice && <div role="status" aria-live="polite" className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300 sm:flex-row sm:items-center sm:justify-between"><p>{notice}</p>{loadFailed && <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-cyan-400/30 px-3 py-2 font-medium text-cyan-300 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Retry briefing</button>}</div>}

    <PilotCheckIn/>

    <section className="mt-6 overflow-hidden rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/15 via-slate-900 to-slate-900 p-7 sm:p-9">
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
        <div><p className="text-sm font-medium text-cyan-300">{greeting}{displayName ? `, ${displayName}` : ''}</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Your financial briefing</h2><p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">{briefingSummary.summary}</p><p className={`mt-4 inline-flex rounded-full border px-3 py-1.5 text-sm ${briefingSummary.cashRisk ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'}`}>{briefingSummary.cashMessage}</p></div>
        <div className="flex items-center gap-4 rounded-2xl border border-slate-700/80 bg-slate-950/60 p-5"><div role="img" aria-label={`Financial health ${briefing.pulse.score} out of 100`} className="grid h-20 w-20 place-items-center rounded-full border-4 border-cyan-400/70 bg-slate-900"><span className="text-2xl font-semibold">{briefing.pulse.score}</span></div><div><p className="text-xs uppercase tracking-widest text-slate-500">Financial health</p><p className="mt-1 text-xl font-semibold text-cyan-300">{briefing.pulse.label}</p></div></div>
      </div>
    </section>

    <section className="mt-6"><Card title="Pilot insights"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{pilotInsights.map(insight => <Insight key={insight.id} icon={insight.id === 'debt' ? <CreditCard/> : insight.id === 'goal' || insight.id === 'emergency' ? <Target/> : insight.id === 'bills' ? <CalendarDays/> : <WalletCards/>} title={insight.title} detail={insight.summary} severity={insight.severity} action={insight.suggestedAction} actionKind={insight.id === 'pilot-recommendation' ? 'recommendation' : insight.suggestedAction.label === 'Review dashboard plan' ? 'plan' : null} reviewPlan={reviewDashboardPlan} reviewRecommendation={reviewRecommendation}/>)}</div></Card></section>

    {missingInformation.length > 0 && <section className="mt-6"><Card title="Missing information"><p className="-mt-2 mb-5 text-sm leading-6 text-slate-400">Complete these details to make your briefing and Pilot recommendation more precise.</p><div className="grid gap-3 md:grid-cols-2">{missingInformation.map(item => <Link key={item.label} href={item.href} className="group flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 transition hover:border-amber-400/40"><ListChecks className="mt-0.5 shrink-0 text-amber-300" size={19}/><span className="min-w-0 flex-1"><span className="block font-medium text-slate-200">{item.label}</span><span className="mt-1 block text-sm leading-5 text-slate-500">{item.detail}</span></span><ArrowRight className="mt-1 shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-amber-300" size={17}/></Link>)}</div></Card></section>}

    <section className="mt-6 grid gap-6 xl:grid-cols-3">
      <div id="command-center-plan" tabIndex={-1} className={`scroll-mt-24 rounded-3xl outline-none transition duration-500 focus:ring-2 focus:ring-cyan-300 xl:col-span-2 ${highlightedTarget === 'plan' ? 'ring-4 ring-cyan-300/80 shadow-[0_0_32px_rgba(34,211,238,0.35)]' : ''}`}><Card title="Upcoming items"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Next paycheck" value={money.format(payPerCheck)}/><Stat label="Bills before payday" value={money.format(billsReserve)}/><Stat label="Minimums reserved" value={money.format(minimumReservePerCheck)}/><Stat label="Safe after cushion" value={money.format(safeExtra)}/></div>{billsDueSoon.length > 0 && <div className="mt-5 space-y-2">{billsDueSoon.slice(0,4).map(bill => <div key={`${bill.id}-${bill.dueDay}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 p-3"><div><p className="text-sm font-medium">{bill.name}</p><p className="text-xs text-slate-500">{money.format(bill.amount)} · due day {bill.dueDay}</p></div><button onClick={() => markBillPaid(bill.id)} className="rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-300 hover:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300">Mark Paid</button></div>)}</div>}<div className="mt-5 flex flex-wrap gap-3"><Link href="/bills" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300 hover:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300">View bills</Link><Link href="/transactions" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-300">Review transactions</Link><Link href="/paychecks" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-300">Update paycheck</Link></div></Card></div>

      <div className={`rounded-3xl transition duration-500 ${highlightedTarget === 'recommendation' ? 'ring-4 ring-cyan-300/80 shadow-[0_0_32px_rgba(34,211,238,0.35)]' : ''}`}><Card title="Pilot recommendation">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">{pilot.category === 'goal' ? <Target size={14}/> : pilot.category === 'debt' ? <CreditCard size={14}/> : <WalletCards size={14}/>} {pilot.category === 'none' ? 'No extra action' : pilot.category}</div>
        <p className="text-2xl font-semibold">{pilot.title}</p>
        <p className="mt-4 text-sm leading-6 text-slate-400">{pilot.description}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4"><p className="text-xs uppercase tracking-widest text-cyan-300">Expected impact</p><p className="mt-1 text-xl font-semibold">{pilot.estimatedBenefit > 0 ? money.format(pilot.estimatedBenefit) : 'Cash protected'}</p></div><div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Confidence</p><p className="mt-1 text-xl font-semibold">{pilot.confidence}%</p></div><div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-xs uppercase tracking-widest text-slate-500">Time horizon</p><p className="mt-1 text-base font-semibold">{timeHorizon}</p></div></div>
        <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row"><div><PilotReasoning panelId="pilot-recommendation-details" open={whyOpen} onToggle={() => setWhyOpen(open => !open)} reasoning={pilot.reasoning}/></div><button type="button" disabled={recommendationHistoryUnavailable || isRecommendationComplete || completingRecommendation} onClick={markRecommendationComplete} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-default disabled:bg-emerald-400"><CheckCircle2 size={16}/>{isRecommendationComplete ? 'Completed' : 'Mark Complete'}</button></div>
      </Card></div>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card title="Financial Pulse">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div role="img" aria-label={`Financial health ${briefing.pulse.score} out of 100`} className="grid h-48 w-48 shrink-0 place-items-center rounded-full p-4" style={{ background: `conic-gradient(rgb(34 211 238) ${briefing.pulse.score * 3.6}deg, rgb(30 41 59) 0deg)` }}><div className="grid h-full w-full place-items-center rounded-full bg-slate-900 text-center"><div><p className="text-5xl font-semibold">{briefing.pulse.score}</p><p className="mt-1 text-xs uppercase tracking-widest text-cyan-300">{briefing.pulse.label}</p></div></div></div>
          <div><p className="text-sm font-medium text-slate-200">Why this pulse was assigned</p><ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-400">{briefing.pulse.explanation.map(item => <li key={item}>{item}</li>)}</ul></div>
        </div>
      </Card>
      <div id="timeline"><Card title="Financial Timeline">
        {timeline.length ? <div className="space-y-6">{timeline.map(group => <section key={group.label}><h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-cyan-300">{group.label}</h3><div className="space-y-3">{group.events.map(event => <article key={event.id} className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-cyan-400/25 text-cyan-300"><Clock3 size={14}/></div><div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><p className="font-medium">{event.title}</p>{event.amount !== undefined && <p className={`font-semibold ${event.direction === 'inflow' ? 'text-emerald-300' : 'text-slate-200'}`}>{event.direction === 'inflow' ? '+' : event.direction === 'outflow' ? '−' : ''}{money.format(Math.abs(event.amount))}</p>}</div><p className="mt-1 text-sm text-slate-500">{event.summary} · {event.status} · {new Date(event.occurredAt).toLocaleDateString()}</p></div></article>)}</div></section>)}</div> : <Empty text="Your timeline is ready for details. Add a paycheck, recurring bills, or a goal to see what is expected next."/>}
      </Card></div>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card title="Recent Wins"><div className="space-y-3">{briefing.recentWins.map(win => <div key={win} className="flex gap-3 rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-4"><Trophy className="mt-0.5 shrink-0 text-emerald-300" size={18}/><p className="text-sm leading-6 text-slate-300">{win}</p></div>)}</div></Card>
      <div id="recommendation-history"><Card title="Recommendation History">{commandCenter.recommendationHistory.length ? <div className="space-y-3">{commandCenter.recommendationHistory.slice(0, 5).map(event => <div key={event.id} className="rounded-2xl border border-slate-800 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{event.title}</p><p className="mt-1 text-xs capitalize text-slate-500">{String(event.metadata?.category ?? 'recommendation')} • {new Date(event.occurredAt).toLocaleDateString()}</p></div><CheckCircle2 className="shrink-0 text-emerald-300" size={19}/></div>{event.amount !== undefined && <p className="mt-3 text-sm font-semibold text-cyan-300">{money.format(event.amount)} estimated benefit</p>}</div>)}</div> : <Empty text={recommendationHistoryUnavailable ? 'Recommendation history is temporarily unavailable. You can still use the current Pilot recommendation and try again later.' : 'No completed recommendations yet. Mark the current Pilot recommendation complete to record your first win.'}/>}</Card></div>
    </section>

    {topGoal && <section className="mt-6"><Card title="Highest-priority unfinished goal"><div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex items-center gap-2"><Target className="text-cyan-300"/><p className="text-xl font-semibold">{topGoal.name}</p></div><p className="mt-2 text-sm text-slate-400">Priority {topGoal.priority} • {money.format(topGoal.currentAmount)} of {money.format(topGoal.targetAmount)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, topGoal.currentAmount / Math.max(1, topGoal.targetAmount) * 100)}%` }}/></div></div><Link href="/goals" className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300 hover:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300">Manage goals</Link></div></Card></section>}

    <p className="mt-6 text-xs leading-5 text-slate-500">Planning estimates only. Confirm lender minimums, statement timing, bill due dates, and savings needs before moving money.</p>
  </div></main>;
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) { return <div className={`rounded-3xl border border-slate-800 bg-slate-900 p-6 ${className}`}><h2 className="mb-5 text-2xl font-semibold">{title}</h2>{children}</div>; }
function Insight({ icon, title, detail, severity, action, actionKind, reviewPlan, reviewRecommendation }: { icon: React.ReactNode; title: string; detail: string; severity: 'info' | 'positive' | 'warning' | 'critical'; action: { label: string; href: string }; actionKind: 'plan' | 'recommendation' | null; reviewPlan: () => void; reviewRecommendation: () => void }) { const warning = severity === 'warning' || severity === 'critical'; const actionClass = 'mt-4 inline-flex rounded-lg text-sm font-medium text-cyan-300 outline-none transition hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'; return <article className={`rounded-2xl border bg-slate-950/40 p-5 ${warning ? 'border-amber-400/25' : severity === 'positive' ? 'border-emerald-400/20' : 'border-slate-800'}`}><div className={warning ? 'text-amber-300' : severity === 'positive' ? 'text-emerald-300' : 'text-cyan-300'}>{icon}</div><h3 className="mt-4 text-lg font-semibold leading-6">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>{actionKind === 'plan' ? <button type="button" onClick={reviewPlan} className={actionClass}>{action.label}</button> : actionKind === 'recommendation' ? <button type="button" onClick={reviewRecommendation} className={actionClass}>{action.label}</button> : <Link href={action.href} className={actionClass}>{action.label}</Link>}</article>; }
function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm leading-6 text-slate-500">{text}</p>; }
function HelpLabel({ label, help }: { label: string; help: string }) { return <span className="flex items-center gap-1.5"><span>{label}</span><span className="group relative inline-flex"><button type="button" aria-label={`About ${label}`} className="rounded-full text-slate-500 outline-none transition hover:text-cyan-300 focus-visible:text-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300"><Info size={14}/></button><span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-xs leading-5 text-slate-300 shadow-xl group-hover:block group-focus-within:block">{help}</span></span></span>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" value={value} onChange={e => onChange(e.target.value)}/></label>; }
function NumberField({ label, value, onChange, step = '1', help }: { label: string; value: number; onChange: (value: number) => void; step?: string; help?: string }) { return <label className="block text-xs text-slate-400">{help ? <HelpLabel label={label} help={help}/> : label}<input className="field mt-1 w-full" type="number" step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>; }
function OptionalNumberField({ label, value, onChange, step = '1' }: { label: string; value: number | null; onChange: (value: string) => void; step?: string }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="number" min="0" step={step} value={value ?? ''} onChange={e => onChange(e.target.value)}/></label>; }
function PromotionFields({ debt, periods, update }: { debt: Debt; periods: number; update: (field: keyof Debt, value: string) => void }) { const analysis = analyzePromotion(debt, { payPeriodsPerYear: periods, plannedMonthlyPayment: debt.minimum }); return <div className="mt-4 border-t border-slate-800 pt-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-xs text-slate-400"><HelpLabel label="Promotion type" help="Choose 0% promotional APR when interest does not accrue during the offer. Choose deferred interest when backdated interest may apply if the balance is not fully paid by the deadline."/><select className="field mt-1 w-full" value={debt.promotionType} onChange={event => update('promotionType', event.target.value)}><option value="none">None</option><option value="zero_percent">0% promotional APR</option><option value="deferred_interest">Deferred interest</option></select></label>{debt.promotionType !== 'none' && <><OptionalNumberField label="Promotional APR %" value={debt.promotionalApr} onChange={value => update('promotionalApr', value)} step="0.01"/><label className="text-xs text-slate-400">Promotion end date<input type="date" className="field mt-1 w-full" value={debt.promotionEndDate} onChange={event => update('promotionEndDate', event.target.value)}/></label><OptionalNumberField label="Post-promotion APR %" value={debt.postPromotionApr} onChange={value => update('postPromotionApr', value)} step="0.01"/><OptionalNumberField label="Original promotional balance" value={debt.originalPromotionalBalance} onChange={value => update('originalPromotionalBalance', value)}/>{debt.promotionType === 'deferred_interest' && <OptionalNumberField label="Estimated deferred interest" value={debt.estimatedDeferredInterest} onChange={value => update('estimatedDeferredInterest', value)}/>}</>}</div>{debt.promotionType !== 'none' && <><p className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs leading-5 text-slate-400">{debt.promotionType === 'zero_percent' ? 'No interest accrues during the promotional period. After it ends, the regular APR applies to any remaining balance.' : 'No interest is charged if the promotional balance is paid in full before the deadline. If it is not, the lender may charge interest dating back to the original purchase.'}</p><div className={`mt-3 rounded-xl border p-3 text-sm ${analysis.status === 'on_track' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : analysis.status === 'expired' || analysis.status === 'at_risk' ? 'border-rose-400/25 bg-rose-400/10 text-rose-200' : 'border-amber-400/25 bg-amber-400/10 text-amber-200'}`}><p className="font-semibold">{promotionStatusLabel(analysis.status)}</p><p className="mt-1 text-xs">{analysis.daysRemaining} days remaining · {money.format(analysis.requiredPerPaycheck)} required per paycheck · safety target {analysis.safetyTargetDate?.toLocaleDateString() ?? 'unavailable'} · projected payoff {analysis.projectedPayoffDate?.toLocaleDateString() ?? 'not projected'}</p></div></>}</div>; }
