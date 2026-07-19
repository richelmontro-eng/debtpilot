'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, WalletCards } from 'lucide-react';
import { confirmPaycheck, expectedPaycheckDrafts, reconcilePaychecks, shouldRequestBalanceConfirmation, type BalanceReconciliation, type PaycheckReconciliation, type PaycheckStatus } from '@/lib/pilot-engine';
import { createClient } from '@/lib/supabase';

const today = () => new Date().toISOString().slice(0, 10);
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
type Profile = { checking_balance?: number | string | null; next_paycheck_date?: string | null; weekly_take_home?: number | string | null; pay_frequency?: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | null };

export function PilotCheckIn({ manual = false }: { manual?: boolean }) {
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [available, setAvailable] = useState(true);
  const [message, setMessage] = useState(''), [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [paychecks, setPaychecks] = useState<PaycheckReconciliation[]>([]);
  const [latestBalance, setLatestBalance] = useState<BalanceReconciliation | null>(null);
  const [actualAmounts, setActualAmounts] = useState<Record<string, string>>({});
  const [editingAmount, setEditingAmount] = useState<string | null>(null), [confirmedBalance, setConfirmedBalance] = useState('');

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setAvailable(false); setLoading(false); return; }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);
      const profileResult = await supabase.from('profiles').select('checking_balance,next_paycheck_date,weekly_take_home,pay_frequency').eq('user_id', user.id).maybeSingle();
      if (profileResult.error || !profileResult.data) { setAvailable(false); setLoading(false); return; }
      const loadedProfile = profileResult.data as Profile;
      if (loadedProfile.next_paycheck_date && Number(loadedProfile.weekly_take_home ?? 0) > 0) {
        const drafts = expectedPaycheckDrafts({ userId: user.id, firstDate: loadedProfile.next_paycheck_date, endDate: futureDate(60), expectedAmount: Number(loadedProfile.weekly_take_home), cadence: loadedProfile.pay_frequency ?? 'weekly' });
        if (drafts.length) await supabase.from('paycheck_events').upsert(drafts, { onConflict: 'user_id,expected_date', ignoreDuplicates: true });
      }
      const [paycheckResult, balanceResult] = await Promise.all([
        supabase.from('paycheck_events').select('*').eq('user_id', user.id).order('expected_date'),
        supabase.from('checking_balance_reconciliations').select('*').eq('user_id', user.id).order('confirmed_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (paycheckResult.error || balanceResult.error) { setAvailable(false); setLoading(false); return; }
      setProfile(loadedProfile); setConfirmedBalance(String(Number(loadedProfile.checking_balance ?? 0)));
      setPaychecks((paycheckResult.data ?? []).filter(row => row.expected_date <= today()).map(row => ({ id: row.id, expectedDate: row.expected_date, expectedAmount: Number(row.expected_amount), status: row.status, actualAmount: row.actual_amount === null ? null : Number(row.actual_amount), confirmedAt: row.confirmed_at, note: row.note })));
      if (balanceResult.data && !Array.isArray(balanceResult.data)) setLatestBalance({ id: balanceResult.data.id, calculatedBalance: Number(balanceResult.data.calculated_balance), confirmedBalance: Number(balanceResult.data.confirmed_balance), variance: Number(balanceResult.data.variance), confirmedAt: balanceResult.data.confirmed_at });
      setLoading(false);
    })();
  }, []);

  const calculatedBalance = Number(profile?.checking_balance ?? 0);
  const unresolved = paychecks.filter(paycheck => paycheck.status === 'expected' || paycheck.status === 'delayed');
  const engineReality = useMemo(() => reconcilePaychecks([], calculatedBalance, { asOfDate: today(), paycheckEvents: paychecks, latestBalance }), [calculatedBalance, latestBalance, paychecks]);
  const eligible = shouldRequestBalanceConfirmation({ asOfDate: today(), lastConfirmedAt: latestBalance?.confirmedAt, paycheckEvents: paychecks, manualCheckIn: manual });

  async function resolvePaycheck(paycheck: PaycheckReconciliation, status: PaycheckStatus) {
    const supabase = createClient(); if (!supabase || saving) return;
    const entered = Number(actualAmounts[paycheck.id]);
    if (status === 'received_different_amount' && (!Number.isFinite(entered) || entered < 0)) { setMessage('Enter the amount that arrived.'); return; }
    setSaving(true);
    const resolved = confirmPaycheck(paycheck, status, status === 'received_different_amount' ? entered : undefined);
    const { error } = await supabase.from('paycheck_events').update({ status: resolved.status, actual_amount: resolved.actualAmount, confirmed_at: resolved.confirmedAt, note: resolved.note, updated_at: new Date().toISOString() }).eq('id', paycheck.id).eq('user_id', userId);
    if (error) setMessage('We couldn’t update this paycheck. Please try again.');
    else { setPaychecks(items => items.map(item => item.id === paycheck.id ? resolved : item)); setEditingAmount(null); setMessage(status === 'missed' ? 'Paycheck marked as not received. Your forecast will exclude it.' : status === 'delayed' ? 'Paycheck marked as delayed. We’ll keep it visible for follow-up.' : 'Paycheck confirmed. Your forecast has been updated.'); }
    setSaving(false);
  }

  async function confirmChecking(useCalculated: boolean) {
    const supabase = createClient(); if (!supabase || saving) return;
    const amount = useCalculated ? calculatedBalance : Number(confirmedBalance);
    if (!Number.isFinite(amount)) { setMessage('Enter your current checking balance.'); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('reconcile_checking_balance', { p_calculated_balance: calculatedBalance, p_confirmed_balance: amount });
    if (error) setMessage('We couldn’t confirm your balance. Please try again.');
    else {
      const row = Array.isArray(data) ? data[0] : data;
      const reconciliation = { id: row.id, calculatedBalance: Number(row.calculated_balance), confirmedBalance: Number(row.confirmed_balance), variance: Number(row.variance), confirmedAt: row.confirmed_at };
      setLatestBalance(reconciliation); setProfile(current => ({ ...current, checking_balance: amount })); setConfirmedBalance(String(amount));
      const updated = reconcilePaychecks([], amount, { asOfDate: today(), paycheckEvents: paychecks, latestBalance: reconciliation });
      setMessage(`Reality check complete. Checking balance confirmed at ${money.format(amount)}. Forecast confidence: ${updated.confidence.level}.`);
    }
    setSaving(false);
  }

  if (loading) return <section aria-label="Pilot reality check" className="mt-6 animate-pulse rounded-3xl border border-slate-800 bg-slate-900 p-6"><div className="h-6 w-48 rounded bg-slate-800"/><div className="mt-4 h-20 rounded bg-slate-800"/></section>;
  if (!available || (!eligible && !unresolved.length)) return null;
  return <section aria-labelledby="pilot-check-in-title" className="mt-6 rounded-3xl border border-cyan-400/25 bg-slate-900 p-5 sm:p-6">
    <div className="flex items-start gap-3"><div className="rounded-xl bg-cyan-400/10 p-2 text-cyan-300"><CheckCircle2/></div><div><h2 id="pilot-check-in-title" className="text-2xl font-semibold">Pilot Check-In</h2><p className="mt-1 text-sm text-slate-400">Confirm recent activity so projected money stays separate from confirmed reality.</p></div></div>
    {message && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm">{message}</p>}
    {unresolved.length > 0 && <div className="mt-5 space-y-4">{unresolved.map(paycheck => <article key={paycheck.id} className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="flex items-center gap-2 font-semibold"><Clock3 size={17} className="text-cyan-300"/> Expected paycheck</p><p className="mt-1 text-sm text-slate-400">{new Date(`${paycheck.expectedDate}T12:00:00Z`).toLocaleDateString()} · {money.format(paycheck.expectedAmount)}</p></div><span className="w-fit rounded-full bg-amber-400/10 px-3 py-1 text-xs capitalize text-amber-200">{paycheck.status}</span></div>
      <p className="mt-4 text-sm">Did this paycheck arrive?</p>
      {editingAmount === paycheck.id && <label className="mt-3 block max-w-xs text-xs text-slate-400">Actual amount<input autoFocus aria-label="Actual paycheck amount" className="field mt-1 w-full" type="number" min="0" step="0.01" value={actualAmounts[paycheck.id] ?? ''} onChange={event => setActualAmounts(values => ({ ...values, [paycheck.id]: event.target.value }))}/></label>}
      <div className="mt-4 flex flex-wrap gap-2"><Action disabled={saving} onClick={() => resolvePaycheck(paycheck, 'received')}>Received as expected</Action><Action disabled={saving} onClick={() => editingAmount === paycheck.id ? resolvePaycheck(paycheck, 'received_different_amount') : setEditingAmount(paycheck.id)}>{editingAmount === paycheck.id ? 'Confirm amount' : 'Different amount'}</Action><Action disabled={saving} onClick={() => resolvePaycheck(paycheck, 'delayed')}>Not yet</Action><Action disabled={saving} onClick={() => resolvePaycheck(paycheck, 'missed')}>Did not receive</Action></div>
    </article>)}</div>}
    {eligible && <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/50 p-4"><div className="flex items-center gap-2"><WalletCards size={18} className="text-cyan-300"/><h3 className="font-semibold">Confirm checking balance</h3></div><dl className="mt-4"><dt className="text-xs text-slate-500">DebtPilot calculated balance</dt><dd className="mt-1 text-2xl font-semibold">{money.format(calculatedBalance)}</dd></dl><label className="mt-4 block max-w-sm text-xs text-slate-400">Current checking balance<input aria-label="Current checking balance" className="field mt-1 w-full" type="number" step="0.01" value={confirmedBalance} onChange={event => setConfirmedBalance(event.target.value)}/></label><div className="mt-4 flex flex-wrap gap-2"><button disabled={saving} onClick={() => confirmChecking(true)} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">Balance is correct</button><Action disabled={saving} onClick={() => confirmChecking(false)}>Update balance</Action></div>{latestBalance && latestBalance.variance !== 0 && <p className="mt-3 text-sm text-slate-400">Last confirmed variance: {money.format(latestBalance.variance)}. Future forecasts start from the confirmed balance.</p>}</div>}
    <div className="mt-5"><p className="text-sm font-semibold capitalize">Forecast confidence: {engineReality.confidence.level}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">{engineReality.confidence.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>
  </section>;
}

function Action({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 outline-none hover:border-cyan-400 hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-60">{children}</button>;
}
