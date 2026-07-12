'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import InfoTooltip from '@/components/info-tooltip';
import { createClient } from '@/lib/supabase';
import { getResumeStep, getWelcomeAction } from '@/lib/onboarding';

type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
type DebtDraft = { id: string; name: string; balance: number; apr: number; minimum: number };
type BillDraft = { id: string; name: string; amount: number; dueDay: number; frequency: string };
type GoalDraft = { id: string; name: string; goalType: string; targetAmount: number; currentAmount: number; priority: number };
type Draft = { displayName: string; payFrequency: PayFrequency; netPay: number; checking: number; savings: number; cushion: number; debts: DebtDraft[]; bills: BillDraft[]; goals: GoalDraft[] };

const initialDraft: Draft = { displayName: '', payFrequency: 'weekly', netPay: 0, checking: 0, savings: 0, cushion: 0, debts: [], bills: [], goals: [] };
const steps = ['Income & Pay Schedule', 'Accounts', 'Debts', 'Bills', 'Goals'];
const stepExplanations = [
  'Your take-home pay and schedule define the cash available in each planning cycle, so DebtPilot can reserve obligations before suggesting an action.',
  'Account balances and your protected cushion show what is truly available today and prevent DebtPilot from recommending money you need to keep accessible.',
  'Debt balances, rates, and minimums let DebtPilot protect required payments and choose the most effective payoff target for your strategy.',
  'Recurring bills determine what must be set aside before your next paycheck, keeping recommendations grounded in upcoming cash needs.',
  'Goals tell DebtPilot what you are building toward and which priority should receive safe extra cash after essentials are covered.',
];

export default function WelcomePage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [started, setStarted] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [step, setStep] = useState(1);
  const [savedStep, setSavedStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('Supabase is not configured.'); setLoading(false); return; }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (error) setMessage(`Could not load setup: ${error.message}`);
      if (data?.onboarding_completed) { router.replace('/'); return; }
      setUserId(user.id);
      setSavedStep(Number(data?.onboarding_step ?? 0));
      setStep(getResumeStep(data));
      const stored = data?.onboarding_data as Partial<Draft> | null;
      setDraft({
        ...initialDraft,
        ...(stored ?? {}),
        displayName: stored?.displayName ?? data?.display_name ?? '',
        payFrequency: (stored?.payFrequency ?? data?.pay_frequency ?? 'weekly') as PayFrequency,
        netPay: Number(stored?.netPay ?? data?.weekly_take_home ?? 0),
        checking: Number(stored?.checking ?? data?.checking_balance ?? 0),
        savings: Number(stored?.savings ?? data?.savings_balance ?? 0),
        cushion: Number(stored?.cushion ?? data?.checking_cushion ?? 0),
      });
      setLoading(false);
    })();
  }, [router]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => ({ ...current, [key]: value })); }

  async function saveAndContinue() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true); setMessage('');
    const nextStep = Math.min(5, step + 1);
    const { error } = await supabase.from('profiles').upsert({
      user_id: userId,
      display_name: draft.displayName.trim(), pay_frequency: draft.payFrequency, weekly_take_home: Math.max(0, draft.netPay),
      checking_balance: draft.checking, savings_balance: draft.savings, checking_cushion: Math.max(0, draft.cushion),
      onboarding_step: nextStep, onboarding_data: draft, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { setMessage(`Could not save setup: ${error.message}`); return; }
    setSavedStep(nextStep);
    if (step === 5) setShowFinish(true); else setStep(nextStep);
  }

  async function finishSetup() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true); setMessage('');
    const results = await Promise.all([
      supabase.from('debts').delete().eq('user_id', userId),
      supabase.from('bills').delete().eq('user_id', userId),
      supabase.from('goals').delete().eq('user_id', userId),
    ]);
    let error = results.find(result => result.error)?.error ?? null;
    if (!error && draft.debts.length) ({ error } = await supabase.from('debts').insert(draft.debts.map(debt => ({ user_id: userId, name: debt.name, balance: Math.max(0, debt.balance), apr: Math.max(0, debt.apr), minimum_payment: Math.max(0, debt.minimum) }))));
    if (!error && draft.bills.length) ({ error } = await supabase.from('bills').insert(draft.bills.map(bill => ({ user_id: userId, name: bill.name, amount: Math.max(0, bill.amount), due_day: Math.min(31, Math.max(1, bill.dueDay)), frequency: bill.frequency }))));
    if (!error && draft.goals.length) ({ error } = await supabase.from('goals').insert(draft.goals.map(goal => ({ user_id: userId, name: goal.name, goal_type: goal.goalType, target_amount: Math.max(0, goal.targetAmount), current_amount: Math.max(0, goal.currentAmount), priority: goal.priority }))));
    if (!error) ({ error } = await supabase.from('profiles').update({ onboarding_completed: true, onboarding_step: 5, updated_at: new Date().toISOString() }).eq('user_id', userId));
    setSaving(false);
    if (error) { setMessage(`Could not finish setup: ${error.message}`); return; }
    router.replace('/'); router.refresh();
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading setup…</main>;
  if (!started) return <main className="min-h-screen bg-slate-950 px-5 py-12 text-slate-100"><div className="mx-auto max-w-3xl"><p className="text-sm uppercase tracking-[0.2em] text-cyan-300">DebtPilot setup</p><h1 className="mt-3 text-4xl font-semibold">Welcome to DebtPilot 👋</h1><p className="mt-4 text-xl text-slate-300">Let&apos;s build your Financial Command Center.</p><p className="mt-2 text-slate-500">This only takes about 5 minutes.</p><div className="mt-8 space-y-3">{steps.map((label, index) => <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className={`grid h-9 w-9 place-items-center rounded-full ${savedStep > index ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>{savedStep > index ? <Check size={17}/> : index + 1}</div><p className="font-medium">{label}</p></div>)}</div>{message && <p className="mt-5 text-sm text-rose-300">{message}</p>}<button onClick={() => setStarted(true)} className="mt-8 rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950">{getWelcomeAction({ onboarding_step: savedStep })}</button></div></main>;
  if (showFinish) return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100"><div className="w-full max-w-xl rounded-3xl border border-cyan-400/20 bg-slate-900 p-10 text-center"><p className="text-6xl">🎉</p><h1 className="mt-5 text-3xl font-semibold">Your Financial Command Center is Ready</h1>{message && <p className="mt-4 text-sm text-rose-300">{message}</p>}<button onClick={finishSetup} disabled={saving} className="mt-7 rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 disabled:opacity-60">Go to Dashboard</button></div></main>;

  return <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100"><div className="mx-auto max-w-4xl"><div className="flex items-center justify-between"><p className="text-sm text-cyan-300">Step {step} of 5</p><p className="text-sm text-slate-500">{steps[step - 1]}</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400 transition-all" style={{ width: `${step * 20}%` }}/></div><section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-6"><p className="mb-6 rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-4 text-sm leading-6 text-slate-300"><span className="font-medium text-cyan-300">Why this matters: </span>{stepExplanations[step - 1]}</p><StepContent step={step} draft={draft} update={update}/></section>{message && <p className="mt-4 text-sm text-rose-300">{message}</p>}<div className="mt-6 flex justify-between"><button onClick={() => step > 1 ? setStep(step - 1) : setStarted(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-slate-300"><ChevronLeft size={17}/>Back</button><button onClick={saveAndContinue} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{step === 5 ? 'Finish Setup' : 'Continue'}<ChevronRight size={17}/></button></div></div></main>;
}

function StepContent({ step, draft, update }: { step: number; draft: Draft; update: <K extends keyof Draft>(key: K, value: Draft[K]) => void }) {
  if (step === 1) return <div><h2 className="text-2xl font-semibold">Income & Pay Schedule</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><Text label="Display Name" value={draft.displayName} onChange={value => update('displayName', value)}/><label className="text-xs text-slate-400"><InfoTooltip label="Pay frequency">How often you receive regular pay. This matters because each pay cycle must cover a different share of your monthly obligations. DebtPilot uses it to calculate per-paycheck reserves and recommendations.</InfoTooltip><select className="field mt-1 w-full" value={draft.payFrequency} onChange={e => update('payFrequency', e.target.value as PayFrequency)}><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="semimonthly">Twice monthly</option><option value="monthly">Monthly</option></select></label><NumberField label={<InfoTooltip label="Net pay per check">The amount deposited from each paycheck after taxes and deductions. It defines the cash available for this pay cycle. DebtPilot uses it to reserve essentials and calculate a safe amount for debt or goals.</InfoTooltip>} value={draft.netPay} onChange={value => update('netPay', value)}/></div></div>;
  if (step === 2) return <div><h2 className="text-2xl font-semibold">Accounts</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><NumberField label={<InfoTooltip label="Checking balance">The money currently available in checking. It matters because bills and everyday spending usually leave this account. DebtPilot uses it to identify shortfalls and protect your cushion.</InfoTooltip>} value={draft.checking} onChange={value => update('checking', value)}/><NumberField label={<InfoTooltip label="Savings balance">The money currently held in savings. It shows the reserves already available for emergencies and goals. DebtPilot uses it when assessing financial health and planning priorities.</InfoTooltip>} value={draft.savings} onChange={value => update('savings', value)}/><NumberField label={<InfoTooltip label="Protected checking cushion">The minimum amount you want to keep available in checking after bills and planned spending. DebtPilot protects this amount before recommending extra debt payments or goal contributions.</InfoTooltip>} value={draft.cushion} onChange={value => update('cushion', value)}/></div></div>;
  if (step === 3) return <Collection title="Debts" onAdd={() => update('debts', [...draft.debts, { id: crypto.randomUUID(), name: 'New debt', balance: 0, apr: 0, minimum: 0 }])}>{draft.debts.map(item => <div key={item.id} className="grid gap-3 rounded-xl border border-slate-800 p-4 sm:grid-cols-5"><Text label="Name" value={item.name} onChange={value => update('debts', draft.debts.map(row => row.id === item.id ? { ...row, name: value } : row))}/><NumberField label="Balance" value={item.balance} onChange={value => update('debts', draft.debts.map(row => row.id === item.id ? { ...row, balance: value } : row))}/><NumberField label={<InfoTooltip label="APR">The annual percentage rate charged on this debt. It determines how quickly interest accumulates. DebtPilot uses it to rank debts when the avalanche payoff strategy is selected.</InfoTooltip>} value={item.apr} onChange={value => update('debts', draft.debts.map(row => row.id === item.id ? { ...row, apr: value } : row))}/><NumberField label={<InfoTooltip label="Minimum payment">The smallest payment the lender requires each month. Missing it can trigger fees or delinquency. DebtPilot reserves minimum payments before recommending any extra payment.</InfoTooltip>} value={item.minimum} onChange={value => update('debts', draft.debts.map(row => row.id === item.id ? { ...row, minimum: value } : row))}/><Remove onClick={() => update('debts', draft.debts.filter(row => row.id !== item.id))}/></div>)}</Collection>;
  if (step === 4) return <Collection title="Bills" onAdd={() => update('bills', [...draft.bills, { id: crypto.randomUUID(), name: 'New bill', amount: 0, dueDay: 1, frequency: 'monthly' }])}>{draft.bills.map(item => <div key={item.id} className="grid gap-3 rounded-xl border border-slate-800 p-4 sm:grid-cols-5"><Text label="Name" value={item.name} onChange={value => update('bills', draft.bills.map(row => row.id === item.id ? { ...row, name: value } : row))}/><NumberField label="Amount" value={item.amount} onChange={value => update('bills', draft.bills.map(row => row.id === item.id ? { ...row, amount: value } : row))}/><NumberField label="Due Day" value={item.dueDay} onChange={value => update('bills', draft.bills.map(row => row.id === item.id ? { ...row, dueDay: value } : row))}/><label className="text-xs text-slate-400"><InfoTooltip label="Bill frequency">How often the bill repeats. This determines how much must be reserved in each pay cycle. DebtPilot uses the frequency to forecast upcoming obligations.</InfoTooltip><select className="field mt-1 w-full" value={item.frequency} onChange={e => update('bills', draft.bills.map(row => row.id === item.id ? { ...row, frequency: e.target.value } : row))}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label><Remove onClick={() => update('bills', draft.bills.filter(row => row.id !== item.id))}/></div>)}</Collection>;
  return <Collection title="Financial Goals" onAdd={() => update('goals', [...draft.goals, { id: crypto.randomUUID(), name: 'New goal', goalType: 'custom', targetAmount: 0, currentAmount: 0, priority: 2 }])}>{draft.goals.map(item => <div key={item.id} className="grid gap-3 rounded-xl border border-slate-800 p-4 sm:grid-cols-5"><Text label="Name" value={item.name} onChange={value => update('goals', draft.goals.map(row => row.id === item.id ? { ...row, name: value } : row))}/><NumberField label="Target" value={item.targetAmount} onChange={value => update('goals', draft.goals.map(row => row.id === item.id ? { ...row, targetAmount: value } : row))}/><NumberField label="Current" value={item.currentAmount} onChange={value => update('goals', draft.goals.map(row => row.id === item.id ? { ...row, currentAmount: value } : row))}/><NumberField label={<InfoTooltip label="Goal priority">The order in which you want goals funded, where 1 is highest. It matters when money is available for more than one unfinished goal. DebtPilot uses this number to choose which goal to recommend first.</InfoTooltip>} value={item.priority} onChange={value => update('goals', draft.goals.map(row => row.id === item.id ? { ...row, priority: value } : row))}/><Remove onClick={() => update('goals', draft.goals.filter(row => row.id !== item.id))}/></div>)}</Collection>;
}

function Collection({ title, onAdd, children }: { title: string; onAdd: () => void; children: React.ReactNode }) { return <div><div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">{title}</h2><button onClick={onAdd} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm text-cyan-300"><Plus size={16}/>Add</button></div><div className="mt-5 space-y-3">{children}</div></div>; }
function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-slate-400">{label}<input className="field mt-1 w-full" value={value} onChange={e => onChange(e.target.value)}/></label>; }
function NumberField({ label, value, onChange }: { label: React.ReactNode; value: number; onChange: (value: number) => void }) { return <label className="text-xs text-slate-400">{label}<input type="number" min="0" className="field mt-1 w-full" value={value} onChange={e => onChange(Number(e.target.value))}/></label>; }
function Remove({ onClick }: { onClick: () => void }) { return <button aria-label="Remove" onClick={onClick} className="self-end rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button>; }
