'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, LockKeyhole, LogOut, Save, Settings, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import InfoTooltip from '@/components/info-tooltip';
import { PasswordFields } from '@/components/password-fields';
import { isReauthenticationError, mapPasswordError, validateNewPassword } from '@/lib/password-management';

type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
type Strategy = 'avalanche' | 'snowball';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [payFrequency, setPayFrequency] = useState<PayFrequency>('weekly');
  const [strategy, setStrategy] = useState<Strategy>('avalanche');
  const [cushion, setCushion] = useState(0);
  const [livingReserve, setLivingReserve] = useState(0);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [needsRecovery, setNeedsRecovery] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('DebtPilot is temporarily unavailable. Please try again later.'); setLoading(false); return; }
    (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { window.location.assign('/login'); return; }
      setUserId(user.id);
      setEmail(user.email ?? '');
      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (error) setMessage(`Load failed: ${error.message}`);
      if (data) {
        setDisplayName(data.display_name ?? '');
        setPayFrequency((data.pay_frequency ?? 'weekly') as PayFrequency);
        setStrategy(data.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche');
        setCushion(Number(data.checking_cushion ?? 0));
        setLivingReserve(Number(data.weekly_living_reserve ?? 0));
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true);
    setMessage('Saving…');
    const { error } = await supabase.from('profiles').upsert({
      user_id: userId,
      display_name: displayName.trim(),
      pay_frequency: payFrequency,
      preferred_strategy: strategy,
      checking_cushion: Math.max(0, cushion),
      weekly_living_reserve: Math.max(0, livingReserve),
      updated_at: new Date().toISOString(),
    });
    setMessage(error ? `Save failed: ${error.message}` : 'Settings saved successfully.');
    setSaving(false);
  }

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
    window.location.assign('/login');
  }

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwordBusy) return;
    const validation = validateNewPassword(newPassword, confirmPassword);
    if (validation) return setPasswordMessage(validation);
    const supabase = createClient();
    if (!supabase) return setPasswordMessage('We couldn’t update your password. Please try again.');
    setPasswordBusy(true); setPasswordMessage(''); setNeedsRecovery(false);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) { setPasswordMessage(mapPasswordError(error)); setNeedsRecovery(isReauthenticationError(error)); }
      else { setNewPassword(''); setConfirmPassword(''); setPasswordMessage('Password updated successfully.'); }
    } catch { setPasswordMessage('We couldn’t update your password. Please try again.'); }
    setPasswordBusy(false);
  }

  async function deleteAccount() {
    const supabase = createClient();
    if (!supabase || deleting || deleteConfirmation.trim().toLowerCase() !== email.toLowerCase()) return;
    if (!window.confirm('Permanently delete your DebtPilot account and all saved financial data? This cannot be undone.')) return;

    setDeleting(true);
    setMessage('Deleting your account…');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setMessage('Your session has expired. Sign in again before deleting your account.');
      setDeleting(false);
      return;
    }

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmation: deleteConfirmation.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Account deletion failed.');
      await supabase.auth.signOut({ scope: 'local' });
      window.location.assign('/login?account_deleted=1');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Account deletion failed.');
      setDeleting(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading settings…</main>;

  const deletionReady = Boolean(email) && deleteConfirmation.trim().toLowerCase() === email.toLowerCase();

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-5xl px-5 py-8">
    <header className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Settings size={16}/> Settings</div><h1 className="text-4xl font-semibold">Your financial preferences.</h1><p className="mt-3 text-slate-400">These defaults are used across the dashboard, recommendations, payoff planner, forecast, and What-If Lab.</p></header>
    {message && <p role="status" className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}
    <section className="grid gap-6 lg:grid-cols-2">
      <Card title="Profile"><Field label="Display name"><input className="field mt-1 w-full" value={displayName} onChange={e => setDisplayName(e.target.value)}/></Field><Field label="Email"><input className="field mt-1 w-full opacity-70" value={email} disabled/></Field></Card>
      <Card title="Paycheck preferences"><Field label={<InfoTooltip label="Pay frequency">How often you receive regular pay. DebtPilot uses it to convert monthly bills and debt minimums into a per-paycheck reserve.</InfoTooltip>}><select className="field mt-1 w-full" value={payFrequency} onChange={e => setPayFrequency(e.target.value as PayFrequency)}><option value="weekly">Weekly — 52 checks/year</option><option value="biweekly">Every 2 weeks — 26/year</option><option value="semimonthly">Twice monthly — 24/year</option><option value="monthly">Monthly — 12/year</option></select></Field><NumberField label={<InfoTooltip label="Living reserve per check">Money protected for groceries, fuel, and everyday spending until your next paycheck. DebtPilot subtracts it before suggesting extra payments.</InfoTooltip>} value={livingReserve} onChange={setLivingReserve}/></Card>
      <Card title="Financial guardrails"><NumberField label={<InfoTooltip label="Protected checking cushion">The minimum balance you want left in checking after planned expenses. DebtPilot protects this amount before recommending optional debt or goal payments.</InfoTooltip>} value={cushion} onChange={setCushion}/><Field label="Debt payoff strategy"><select className="field mt-1 w-full" value={strategy} onChange={e => setStrategy(e.target.value as Strategy)}><option value="avalanche">Avalanche — highest APR first</option><option value="snowball">Snowball — smallest balance first</option></select></Field></Card>
      <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><div className="mb-5 flex items-center gap-2"><LockKeyhole className="text-cyan-300" size={21}/><h2 className="text-2xl font-semibold">Account &amp; Security</h2></div><form onSubmit={updatePassword}><PasswordFields password={newPassword} confirmation={confirmPassword} onPassword={setNewPassword} onConfirmation={setConfirmPassword} disabled={passwordBusy}/>{passwordMessage && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">{passwordMessage}</p>}{needsRecovery && <Link href="/forgot-password" className="mt-3 block text-sm font-semibold text-cyan-300">Send me a secure reset link</Link>}<button disabled={passwordBusy} className="mt-5 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:opacity-60">{passwordBusy ? 'Updating…' : 'Update password'}</button></form></section>
      <Card title="About DebtPilot"><p className="text-2xl font-semibold">Version 0.15.0</p><p className="mt-3 text-sm leading-6 text-slate-400">Includes the Financial Command Center, reviewed transaction posting, forecasting, goals, payoff planning, vehicle comparisons, What-If scenarios, and Pilot recommendations.</p><button onClick={signOut} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-300"><LogOut size={17}/>Sign out</button></Card>
    </section>

    <section className="mt-6 rounded-3xl border border-rose-400/25 bg-rose-400/5 p-6">
      <div className="flex items-start gap-3"><AlertTriangle className="mt-1 shrink-0 text-rose-300" size={22}/><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">Danger zone</p><h2 className="mt-2 text-2xl font-semibold">Delete account</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Permanently deletes your login and all related DebtPilot data, including balances, debts, bills, goals, transactions, snapshots, and saved vehicle scenarios. This action cannot be undone.</p></div></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><Field label={`Type ${email || 'your email address'} to confirm`}><input className="field mt-1 w-full" value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} autoComplete="off"/></Field><button onClick={deleteAccount} disabled={!deletionReady || deleting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={18}/>{deleting ? 'Deleting…' : 'Delete account permanently'}</button></div>
    </section>

    <div className="mt-6 flex justify-end"><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={18}/>{saving ? 'Saving…' : 'Save settings'}</button></div>
  </div></main>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="mb-5 text-2xl font-semibold">{title}</h2><div className="space-y-4">{children}</div></section>; }
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) { return <label className="block text-xs text-slate-400">{label}{children}</label>; }
function NumberField({ label, value, onChange }: { label: React.ReactNode; value: number; onChange: (value: number) => void }) { return <Field label={label}><input className="field mt-1 w-full" type="number" min="0" value={value} onChange={e => onChange(Number(e.target.value))}/></Field>; }
