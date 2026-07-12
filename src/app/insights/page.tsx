'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, Camera, HeartPulse, Landmark, Sparkles, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Snapshot = {
  id: string;
  snapshotDate: string;
  totalAssets: number;
  totalDebt: number;
  netWorth: number;
  checking: number;
  savings: number;
  investments: number;
  otherAssets: number;
  health: number;
};

type Debt = { balance: number; minimum: number; apr: number };
type Goal = { goalType: string; target: number; current: number };

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function InsightsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [investments, setInvestments] = useState(0);
  const [otherAssets, setOtherAssets] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('Supabase is not configured.'); setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      setUserId(user.id);
      const [{ data: p, error: pe }, { data: d, error: de }, { data: g, error: ge }, { data: s, error: se }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('balance, minimum_payment, apr').eq('user_id', user.id),
        supabase.from('goals').select('goal_type, target_amount, current_amount').eq('user_id', user.id),
        supabase.from('financial_snapshots').select('*').eq('user_id', user.id).order('snapshot_date', { ascending: true }),
      ]);
      const error = pe || de || ge || se;
      if (error) setMessage(`Load failed: ${error.message}`);
      setProfile(p);
      setInvestments(Number(p?.investment_balance ?? 0));
      setOtherAssets(Number(p?.other_assets ?? 0));
      setDebts((d ?? []).map(row => ({ balance: Number(row.balance), minimum: Number(row.minimum_payment), apr: Number(row.apr) })));
      setGoals((g ?? []).map(row => ({ goalType: row.goal_type, target: Number(row.target_amount), current: Number(row.current_amount) })));
      setSnapshots((s ?? []).map(row => ({ id: row.id, snapshotDate: row.snapshot_date, totalAssets: Number(row.total_assets), totalDebt: Number(row.total_debt), netWorth: Number(row.net_worth), checking: Number(row.checking_balance), savings: Number(row.savings_balance), investments: Number(row.investment_balance), otherAssets: Number(row.other_assets), health: Number(row.financial_health) })));
      setLoading(false);
    })();
  }, []);

  const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const monthlyMinimums = debts.reduce((sum, debt) => sum + debt.minimum, 0);
  const checking = Number(profile?.checking_balance ?? 0);
  const savings = Number(profile?.savings_balance ?? 0);
  const cushion = Number(profile?.checking_cushion ?? 0);
  const pay = Number(profile?.weekly_take_home ?? 0);
  const periods = profile?.pay_frequency === 'biweekly' ? 26 : profile?.pay_frequency === 'semimonthly' ? 24 : profile?.pay_frequency === 'monthly' ? 12 : 52;
  const monthlyIncome = pay * periods / 12;
  const totalAssets = checking + savings + investments + otherAssets;
  const netWorth = totalAssets - totalDebt;
  const emergency = goals.find(goal => goal.goalType === 'emergency_fund');

  const health = useMemo(() => {
    const cashFlow = monthlyIncome > 0 ? Math.max(0, Math.min(25, 25 - (monthlyMinimums / monthlyIncome) * 50)) : 0;
    const cushionScore = cushion <= 0 ? 12 : Math.min(20, checking / cushion * 20);
    const emergencyScore = emergency?.target ? Math.min(20, emergency.current / emergency.target * 20) : Math.min(20, savings / Math.max(1, monthlyIncome) * 10);
    const debtScore = monthlyIncome > 0 ? Math.max(0, Math.min(25, 25 - (totalDebt / (monthlyIncome * 12)) * 12)) : 0;
    const goalScore = goals.length ? Math.min(10, goals.reduce((sum, goal) => sum + Math.min(1, goal.current / Math.max(1, goal.target)), 0) / goals.length * 10) : 3;
    return Math.round(Math.max(0, Math.min(100, cashFlow + cushionScore + emergencyScore + debtScore + goalScore)));
  }, [monthlyIncome, monthlyMinimums, cushion, checking, emergency, savings, totalDebt, goals]);

  const latest = snapshots.at(-1);
  const previous = snapshots.length > 1 ? snapshots.at(-2) : undefined;
  const netWorthChange = latest && previous ? latest.netWorth - previous.netWorth : 0;
  const debtChange = latest && previous ? latest.totalDebt - previous.totalDebt : 0;
  const healthChange = latest && previous ? latest.health - previous.health : 0;

  async function saveAssetsAndSnapshot() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true);
    setMessage('Saving snapshot…');
    const today = new Date().toISOString().slice(0, 10);
    const { error: profileError } = await supabase.from('profiles').update({ investment_balance: investments, other_assets: otherAssets, updated_at: new Date().toISOString() }).eq('user_id', userId);
    const { error: snapshotError } = await supabase.from('financial_snapshots').upsert({
      user_id: userId,
      snapshot_date: today,
      total_assets: totalAssets,
      total_debt: totalDebt,
      net_worth: netWorth,
      checking_balance: checking,
      savings_balance: savings,
      investment_balance: investments,
      other_assets: otherAssets,
      financial_health: health,
    }, { onConflict: 'user_id,snapshot_date' });
    const error = profileError || snapshotError;
    setMessage(error ? `Save failed: ${error.message}` : 'Snapshot saved successfully.');
    if (!error) {
      const { data } = await supabase.from('financial_snapshots').select('*').eq('user_id', userId).order('snapshot_date', { ascending: true });
      setSnapshots((data ?? []).map(row => ({ id: row.id, snapshotDate: row.snapshot_date, totalAssets: Number(row.total_assets), totalDebt: Number(row.total_debt), netWorth: Number(row.net_worth), checking: Number(row.checking_balance), savings: Number(row.savings_balance), investments: Number(row.investment_balance), otherAssets: Number(row.other_assets), health: Number(row.financial_health) })));
    }
    setSaving(false);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Building your financial picture…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Activity size={16}/> Financial insights</div><h1 className="text-4xl font-semibold">Net worth, health, and progress.</h1><p className="mt-3 max-w-3xl text-slate-400">Track the full picture, preserve weekly snapshots, and turn the changes into a grounded financial brief.</p></div>
      <button onClick={saveAssetsAndSnapshot} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"><Camera size={18}/>{saving ? 'Saving…' : 'Save today’s snapshot'}</button>
    </header>

    {message && <p className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Landmark/>} label="Net worth" value={money.format(netWorth)} accent/>
      <Metric icon={<WalletCards/>} label="Total assets" value={money.format(totalAssets)}/>
      <Metric icon={<ArrowDownRight/>} label="Total debt" value={money.format(totalDebt)}/>
      <Metric icon={<HeartPulse/>} label="Financial health" value={`${health}/100`}/>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Assets</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2"><ReadOnly label="Checking" value={checking}/><ReadOnly label="Savings" value={savings}/><NumberField label="Investments" value={investments} onChange={setInvestments}/><NumberField label="Other assets" value={otherAssets} onChange={setOtherAssets}/></div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Vehicle equity and real estate can be entered under Other assets until dedicated asset modules are added.</p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-2 text-cyan-300"><Sparkles size={18}/><p className="text-xs font-semibold uppercase tracking-[0.2em]">Weekly brief</p></div>
        <h2 className="mt-3 text-2xl font-semibold">{profile?.display_name ? `${profile.display_name}, here’s your update.` : 'Here’s your financial update.'}</h2>
        <div className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
          {latest && previous ? <>
            <BriefLine positive={netWorthChange >= 0} text={`Net worth ${netWorthChange >= 0 ? 'increased' : 'decreased'} by ${money.format(Math.abs(netWorthChange))} since the prior snapshot.`}/>
            <BriefLine positive={debtChange <= 0} text={`Debt ${debtChange <= 0 ? 'decreased' : 'increased'} by ${money.format(Math.abs(debtChange))}.`}/>
            <BriefLine positive={healthChange >= 0} text={`Financial health moved ${healthChange >= 0 ? 'up' : 'down'} ${Math.abs(healthChange)} point${Math.abs(healthChange) === 1 ? '' : 's'}.`}/>
          </> : <p className="text-slate-400">Save at least two snapshots to unlock week-over-week comparisons. Today’s score and balances are already reflected below.</p>}
          <BriefLine positive={checking >= cushion} text={checking >= cushion ? 'Your protected checking cushion is currently funded.' : `Checking is ${money.format(cushion - checking)} below your protected cushion.`}/>
          <BriefLine positive={(emergency?.current ?? savings) >= 1000} text={emergency ? `${emergency.current >= emergency.target ? 'Your emergency-fund goal is complete.' : `${money.format(emergency.target - emergency.current)} remains on your emergency-fund goal.`}` : 'Create an emergency-fund goal for more precise coaching.'}/>
        </div>
      </div>
    </section>

    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-semibold">Snapshot trend</h2>
      {snapshots.length ? <><TrendChart snapshots={snapshots}/><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-slate-500"><tr><th className="pb-3">Date</th><th className="pb-3">Assets</th><th className="pb-3">Debt</th><th className="pb-3">Net worth</th><th className="pb-3">Health</th></tr></thead><tbody>{[...snapshots].reverse().slice(0, 12).map(snapshot => <tr key={snapshot.id} className="border-t border-slate-800"><td className="py-3">{new Date(snapshot.snapshotDate + 'T00:00:00').toLocaleDateString()}</td><td>{money.format(snapshot.totalAssets)}</td><td>{money.format(snapshot.totalDebt)}</td><td>{money.format(snapshot.netWorth)}</td><td>{snapshot.health}/100</td></tr>)}</tbody></table></div></> : <p className="mt-4 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">Save your first snapshot to begin tracking net worth and financial health over time.</p>}
    </section>

    <p className="mt-6 text-xs leading-5 text-slate-500">The weekly brief is generated from saved financial data and snapshot changes. It is not a substitute for professional financial advice.</p>
  </div></main>;
}

function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>; }
function ReadOnly({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{money.format(value)}</p></div>; }
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="number" min="0" step="1" value={value} onChange={event => onChange(Number(event.target.value))}/></label>; }
function BriefLine({ positive, text }: { positive: boolean; text: string }) { const Icon = positive ? ArrowUpRight : ArrowDownRight; return <div className="flex gap-3"><Icon className={positive ? 'mt-1 shrink-0 text-emerald-300' : 'mt-1 shrink-0 text-amber-300'} size={17}/><p>{text}</p></div>; }
function TrendChart({ snapshots }: { snapshots: Snapshot[] }) {
  const values = snapshots.map(snapshot => snapshot.netWorth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = snapshots.map((snapshot, index) => {
    const x = snapshots.length === 1 ? 50 : index / (snapshots.length - 1) * 100;
    const y = 92 - ((snapshot.netWorth - min) / range) * 84;
    return `${x},${y}`;
  }).join(' ');
  return <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><svg viewBox="0 0 100 100" className="h-56 w-full" preserveAspectRatio="none" role="img" aria-label="Net worth trend"><line x1="0" y1="92" x2="100" y2="92" stroke="currentColor" className="text-slate-800" strokeWidth="0.8"/><polyline points={points} fill="none" stroke="currentColor" className="text-cyan-300" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{new Date(snapshots[0].snapshotDate + 'T00:00:00').toLocaleDateString()}</span><span>{money.format(min)} to {money.format(max)}</span><span>{new Date(snapshots.at(-1)!.snapshotDate + 'T00:00:00').toLocaleDateString()}</span></div></div>;
}
