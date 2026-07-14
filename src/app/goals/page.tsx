'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flag, Plus, Save, Target, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Goal = {
  id: string;
  name: string;
  goalType: string;
  targetAmount: number;
  currentAmount: number;
  priority: number;
  targetDate: string;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function GoalsPage() {
  const [userId, setUserId] = useState('');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('DebtPilot is temporarily unavailable. Please try again later.'); setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      setUserId(user.id);
      const { data, error } = await supabase.from('goals').select('*').eq('user_id', user.id).order('priority').order('created_at');
      if (error) setMessage('We couldn’t load your goals. Please try again.');
      setGoals((data ?? []).map(row => ({
        id: row.id,
        name: row.name,
        goalType: row.goal_type,
        targetAmount: Number(row.target_amount),
        currentAmount: Number(row.current_amount),
        priority: Number(row.priority),
        targetDate: row.target_date ?? '',
      })));
      setLoading(false);
    })();
  }, []);

  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalCurrent = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const overallProgress = totalTarget > 0 ? Math.min(100, Math.round(totalCurrent / totalTarget * 100)) : 0;
  const topGoal = useMemo(() => [...goals].sort((a, b) => a.priority - b.priority)[0], [goals]);

  function addGoal() {
    setGoals(items => [...items, {
      id: `new-${crypto.randomUUID()}`,
      name: 'New goal',
      goalType: 'custom',
      targetAmount: 0,
      currentAmount: 0,
      priority: 2,
      targetDate: '',
    }]);
  }

  function updateGoal(id: string, field: keyof Goal, value: string | number) {
    setGoals(items => items.map(goal => goal.id === id ? { ...goal, [field]: value } : goal));
  }

  async function saveGoals() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true);
    setMessage('Saving goals…');
    const { error: deleteError } = await supabase.from('goals').delete().eq('user_id', userId);
    const { error: insertError } = goals.length ? await supabase.from('goals').insert(goals.map(goal => ({
      user_id: userId,
      name: goal.name,
      goal_type: goal.goalType,
      target_amount: goal.targetAmount,
      current_amount: goal.currentAmount,
      priority: goal.priority,
      target_date: goal.targetDate || null,
      updated_at: new Date().toISOString(),
    }))) : { error: null };
    const error = deleteError || insertError;
    setMessage(error ? 'We couldn’t save your goals. Please try again.' : 'Goals saved successfully.');
    setSaving(false);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading goals…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <div className="mx-auto max-w-6xl px-5 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Financial priorities</p>
          <h1 className="mt-2 text-4xl font-semibold">Goals</h1>
          <p className="mt-2 max-w-2xl text-slate-400">Tell DebtPilot what matters most so future recommendations can balance debt payoff, emergency savings, and major purchases.</p>
        </div>
        <button onClick={saveGoals} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={18}/>{saving ? 'Saving…' : 'Save goals'}</button>
      </header>

      {message && <p role="status" className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">{message}</p>}

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <Metric icon={<Target/>} label="Total goal target" value={money.format(totalTarget)}/>
        <Metric icon={<Flag/>} label="Saved toward goals" value={money.format(totalCurrent)}/>
        <Metric icon={<Target/>} label="Overall progress" value={`${overallProgress}%`} accent/>
      </section>

      {topGoal && <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-6">
        <p className="text-xs uppercase tracking-widest text-cyan-300">Current priority</p>
        <p className="mt-2 text-2xl font-semibold">{topGoal.name}</p>
        <p className="mt-2 text-sm text-slate-300">{money.format(topGoal.currentAmount)} of {money.format(topGoal.targetAmount)} saved.</p>
      </section>}

      <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="text-2xl font-semibold">Your goals</h2><p className="mt-1 text-sm text-slate-400">Priority 1 is considered before lower-priority goals.</p></div>
          <button onClick={addGoal} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300"><Plus size={16}/>Add goal</button>
        </div>

        <div className="mt-5 space-y-4">
          {goals.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">Add an emergency fund, vehicle down payment, vacation, house fund, or any custom financial goal.</p>}
          {goals.map(goal => {
            const progress = goal.targetAmount > 0 ? Math.min(100, Math.round(goal.currentAmount / goal.targetAmount * 100)) : 0;
            return <div key={goal.id} className="rounded-2xl border border-slate-800 p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] xl:items-end">
                <Field label="Goal name"><input className="field mt-1 w-full" value={goal.name} onChange={e => updateGoal(goal.id, 'name', e.target.value)}/></Field>
                <Field label="Type"><select className="field mt-1 w-full" value={goal.goalType} onChange={e => updateGoal(goal.id, 'goalType', e.target.value)}><option value="emergency_fund">Emergency fund</option><option value="vehicle">Vehicle</option><option value="house">House</option><option value="vacation">Vacation</option><option value="debt_free">Debt free</option><option value="custom">Custom</option></select></Field>
                <Field label="Target amount"><input className="field mt-1 w-full" type="number" min="0" value={goal.targetAmount} onChange={e => updateGoal(goal.id, 'targetAmount', Number(e.target.value))}/></Field>
                <Field label="Current amount"><input className="field mt-1 w-full" type="number" min="0" value={goal.currentAmount} onChange={e => updateGoal(goal.id, 'currentAmount', Number(e.target.value))}/></Field>
                <Field label="Priority"><select className="field mt-1 w-full" value={goal.priority} onChange={e => updateGoal(goal.id, 'priority', Number(e.target.value))}><option value={1}>1 — Highest</option><option value={2}>2 — Medium</option><option value={3}>3 — Lower</option></select></Field>
                <button aria-label={`Remove ${goal.name}`} onClick={() => setGoals(items => items.filter(item => item.id !== goal.id))} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{ width: `${progress}%` }}/></div>
              <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{progress}% complete</span><span>{money.format(Math.max(0, goal.targetAmount - goal.currentAmount))} remaining</span></div>
            </div>;
          })}
        </div>
      </section>

      <p className="mt-6 text-xs leading-5 text-slate-500">Goals are planning targets. DebtPilot will use their priority and progress when its recommendation engine is expanded.</p>
    </div>
  </main>;
}

function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-slate-400">{label}{children}</label>;
}
