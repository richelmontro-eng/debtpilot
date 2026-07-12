'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, CreditCard, Gauge, LogOut, Plus, Save, Trash2, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Debt = { id: string; name: string; balance: number; apr: number; minimum: number };
type Bill = { id: string; name: string; amount: number; dueDay: number; frequency: string };

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

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
  const [weeklyPay, setWeeklyPay] = useState(0);
  const [checking, setChecking] = useState(0);
  const [savings, setSavings] = useState(0);
  const [weeklyLiving, setWeeklyLiving] = useState(0);
  const [checkingCushion, setCheckingCushion] = useState(0);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [debts, setDebts] = useState<Debt[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);

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
      const [{ data: profile, error: profileError }, { data: debtRows, error: debtError }, { data: billRows, error: billError }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('bills').select('*').eq('user_id', user.id).order('due_day'),
      ]);
      const loadError = profileError || debtError || billError;
      if (loadError) setNotice(`Load failed: ${loadError.message}`);
      if (profile) {
        setWeeklyPay(Number(profile.weekly_take_home));
        setChecking(Number(profile.checking_balance));
        setSavings(Number(profile.savings_balance));
        setWeeklyLiving(Number(profile.weekly_living_reserve));
        setCheckingCushion(Number(profile.checking_cushion));
        setStrategy(profile.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche');
      }
      setDebts((debtRows ?? []).map(row => ({ id: row.id, name: row.name, balance: Number(row.balance), apr: Number(row.apr), minimum: Number(row.minimum_payment) })));
      setBills((billRows ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' })));
      setLoading(false);
    })();
  }, [router]);

  const billsDueSoon = useMemo(() => bills.filter(bill => bill.frequency === 'weekly' || daysUntilDue(bill.dueDay) <= 7), [bills]);
  const billsReserve = billsDueSoon.reduce((sum, bill) => sum + bill.amount, 0);
  const monthlyMinimums = debts.reduce((sum, debt) => sum + debt.minimum, 0);
  const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const weeklyMinimums = monthlyMinimums / 4.33;
  const availableFromPaycheck = Math.max(0, weeklyPay - weeklyLiving - billsReserve - weeklyMinimums);
  const cushionAdjustment = Math.max(0, checkingCushion - checking);
  const safeExtra = Math.max(0, availableFromPaycheck - cushionAdjustment);
  const ranked = [...debts].sort((a, b) => strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance);
  const target = ranked[0];
  const confidence = target && safeExtra > 0 ? (billsDueSoon.length ? 94 : 88) : 65;
  const health = useMemo(() => {
    const monthlyIncome = weeklyPay * 52 / 12;
    const debtBurden = monthlyIncome ? monthlyMinimums / monthlyIncome : 1;
    const cushionScore = checkingCushion <= 0 ? 10 : Math.min(20, checking / checkingCushion * 20);
    const cashFlowScore = weeklyPay <= 0 ? 0 : Math.min(35, safeExtra / weeklyPay * 100);
    return Math.max(0, Math.min(100, Math.round(35 + cushionScore + cashFlowScore - debtBurden * 35)));
  }, [weeklyPay, monthlyMinimums, checking, checkingCushion, safeExtra]);

  function updateDebt(id: string, field: keyof Debt, value: string) {
    setDebts(items => items.map(item => item.id === id ? { ...item, [field]: field === 'name' ? value : Number(value) } : item));
  }

  function updateBill(id: string, field: keyof Bill, value: string) {
    setBills(items => items.map(item => item.id === id ? { ...item, [field]: field === 'name' || field === 'frequency' ? value : Number(value) } : item));
  }

  function addDebt() {
    setDebts(items => [...items, { id: `new-${crypto.randomUUID()}`, name: 'New debt', balance: 0, apr: 0, minimum: 0 }]);
  }

  function addBill() {
    setBills(items => [...items, { id: `new-${crypto.randomUUID()}`, name: 'New bill', amount: 0, dueDay: 1, frequency: 'monthly' }]);
  }

  async function save() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true);
    setNotice('Saving…');
    const { error: profileError } = await supabase.from('profiles').upsert({
      user_id: userId,
      weekly_take_home: weeklyPay,
      checking_balance: checking,
      savings_balance: savings,
      weekly_living_reserve: weeklyLiving,
      checking_cushion: checkingCushion,
      preferred_strategy: strategy,
      updated_at: new Date().toISOString(),
    });
    const { error: deleteDebtError } = await supabase.from('debts').delete().eq('user_id', userId);
    const { error: debtError } = debts.length
      ? await supabase.from('debts').insert(debts.map(debt => ({ user_id: userId, name: debt.name, balance: debt.balance, apr: debt.apr, minimum_payment: debt.minimum })))
      : { error: null };
    const { error: deleteBillError } = await supabase.from('bills').delete().eq('user_id', userId);
    const { error: billError } = bills.length
      ? await supabase.from('bills').insert(bills.map(bill => ({ user_id: userId, name: bill.name, amount: bill.amount, due_day: Math.min(31, Math.max(1, bill.dueDay)), frequency: bill.frequency })))
      : { error: null };
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
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Gauge size={16}/> Weekly financial command center</div><h1 className="text-4xl font-semibold">DebtPilot</h1><p className="mt-2 text-slate-400">Cover the next seven days, protect your cushion, then attack debt.</p></div>
      <div className="flex gap-3"><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={18}/>{saving ? 'Saving…' : 'Save plan'}</button><button onClick={signOut} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-slate-300"><LogOut size={18}/>Sign out</button></div>
    </header>

    {notice && <p role="status" aria-live="polite" className="mb-5 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">{notice}</p>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<WalletCards/>} label="Checking" value={money.format(checking)}/>
      <Metric icon={<CalendarDays/>} label="Bills due in 7 days" value={money.format(billsReserve)}/>
      <Metric icon={<CreditCard/>} label="Total debt" value={money.format(totalDebt)}/>
      <Metric icon={<Gauge/>} label="Safe extra this paycheck" value={money.format(safeExtra)} accent/>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-3">
      <Card title="Paycheck planner" className="xl:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Weekly take-home" value={weeklyPay} onChange={setWeeklyPay}/>
          <NumberField label="Weekly living reserve" value={weeklyLiving} onChange={setWeeklyLiving}/>
          <NumberField label="Checking balance" value={checking} onChange={setChecking}/>
          <NumberField label="Protected checking cushion" value={checkingCushion} onChange={setCheckingCushion}/>
          <NumberField label="Savings balance" value={savings} onChange={setSavings}/>
          <label className="block text-xs text-slate-400">Debt strategy<select className="field mt-1 w-full" value={strategy} onChange={e => setStrategy(e.target.value as 'avalanche' | 'snowball')}><option value="avalanche">Avalanche — highest APR</option><option value="snowball">Snowball — smallest balance</option></select></label>
        </div>
        <div className="mt-6 grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 sm:grid-cols-4">
          <Stat label="Paycheck" value={money.format(weeklyPay)}/><Stat label="Bills reserved" value={money.format(billsReserve)}/><Stat label="Living + minimums" value={money.format(weeklyLiving + weeklyMinimums)}/><Stat label="Available for debt" value={money.format(safeExtra)}/>
        </div>
      </Card>

      <Card title="Pilot recommendation">
        {target && safeExtra > 0 ? <>
          <p className="text-2xl font-semibold">Pay <span className="text-cyan-300">{money.format(safeExtra)}</span> toward {target.name}.</p>
          <p className="mt-4 text-sm leading-6 text-slate-400">Why: {strategy === 'avalanche' ? `${target.name} has the highest APR at ${target.apr.toFixed(2)}%.` : `${target.name} has the smallest remaining balance.`} Bills due within seven days, weekly spending, minimum payments, and your checking cushion are reserved first.</p>
          <div className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4"><p className="text-xs uppercase tracking-widest text-cyan-300">Confidence</p><p className="mt-1 text-3xl font-semibold">{confidence}%</p></div>
        </> : <p className="text-slate-400">Add your income, bills, cushion, and debts. DebtPilot will recommend the safest extra payment after required cash is protected.</p>}
      </Card>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card title="Bills">
        <button onClick={addBill} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300"><Plus size={16}/>Add bill</button>
        <div className="space-y-3">{bills.length === 0 && <Empty text="Add recurring bills so DebtPilot can reserve them before recommending extra debt payments."/>}{bills.map(bill => <div key={bill.id} className="grid gap-3 rounded-2xl border border-slate-800 p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
          <TextField label="Bill" value={bill.name} onChange={value => updateBill(bill.id, 'name', value)}/>
          <NumberField label="Amount" value={bill.amount} onChange={value => updateBill(bill.id, 'amount', String(value))}/>
          <NumberField label="Due day" value={bill.dueDay} onChange={value => updateBill(bill.id, 'dueDay', String(value))}/>
          <label className="block text-xs text-slate-400">Frequency<select className="field mt-1 w-full" value={bill.frequency} onChange={e => updateBill(bill.id, 'frequency', e.target.value)}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
          <button aria-label={`Remove ${bill.name}`} onClick={() => setBills(items => items.filter(item => item.id !== bill.id))} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button>
        </div>)}</div>
      </Card>

      <Card title="Debt accounts">
        <button onClick={addDebt} className="mb-4 inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300"><Plus size={16}/>Add debt</button>
        <div className="space-y-3">{debts.length === 0 && <Empty text="Add each credit card or loan with its balance, APR, and monthly minimum."/>}{debts.map(debt => <div key={debt.id} className="grid gap-3 rounded-2xl border border-slate-800 p-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto] sm:items-end">
          <TextField label="Account" value={debt.name} onChange={value => updateDebt(debt.id, 'name', value)}/>
          <NumberField label="Balance" value={debt.balance} onChange={value => updateDebt(debt.id, 'balance', String(value))}/>
          <NumberField label="APR %" value={debt.apr} onChange={value => updateDebt(debt.id, 'apr', String(value))} step="0.01"/>
          <NumberField label="Monthly minimum" value={debt.minimum} onChange={value => updateDebt(debt.id, 'minimum', String(value))}/>
          <button aria-label={`Remove ${debt.name}`} onClick={() => setDebts(items => items.filter(item => item.id !== debt.id))} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button>
        </div>)}</div>
      </Card>
    </section>

    <section className="mt-6 grid gap-4 md:grid-cols-2">
      <Card title="Due before the next weekly cycle">
        {billsDueSoon.length ? <div className="space-y-3">{billsDueSoon.map(bill => <div key={bill.id} className="flex items-center justify-between rounded-xl border border-slate-800 p-3"><div><p className="font-medium">{bill.name}</p><p className="text-xs text-slate-500">{bill.frequency === 'weekly' ? 'Weekly' : `Due in ${daysUntilDue(bill.dueDay)} day(s)`}</p></div><p className="font-semibold">{money.format(bill.amount)}</p></div>)}</div> : <Empty text="No saved bills fall within the next seven days."/>}
      </Card>
      <Card title="Financial health"><p className="text-5xl font-semibold">{health}<span className="text-lg text-slate-500">/100</span></p><p className="mt-4 text-sm leading-6 text-slate-400">This early score considers minimum-payment burden, available weekly cash flow, and whether your checking cushion is funded. It will become more accurate as goals and payment history are added.</p></Card>
    </section>

    <p className="mt-6 text-xs leading-5 text-slate-500">Planning estimates only. Confirm lender minimums, statement timing, and bill due dates before making payments.</p>
  </div></main>;
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) { return <div className={`rounded-3xl border border-slate-800 bg-slate-900 p-6 ${className}`}><h2 className="mb-5 text-2xl font-semibold">{title}</h2>{children}</div>; }
function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm leading-6 text-slate-500">{text}</p>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" value={value} onChange={e => onChange(e.target.value)}/></label>; }
function NumberField({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (value: number) => void; step?: string }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="number" step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>; }
