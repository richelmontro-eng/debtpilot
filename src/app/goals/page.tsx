'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { buildGoalWorkspace, type GoalContribution, type GoalRecord, type GoalSection, type GoalWorkspaceItem } from '@/lib/goal-workspace';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const sectionNames: GoalSection[] = ['Closest to Completion', 'In Progress', 'Just Started', 'Completed'];
const today = () => new Date().toISOString().slice(0, 10);

function mapGoal(row: Record<string, unknown>): GoalRecord { return { id: String(row.id), name: String(row.name ?? ''), goalType: String(row.goal_type ?? 'custom'), targetAmount: Number(row.target_amount ?? 0), currentAmount: Number(row.current_amount ?? 0), priority: Number(row.priority ?? 2), targetDate: typeof row.target_date === 'string' ? row.target_date : '' }; }
function mapContribution(row: Record<string, unknown>): GoalContribution { return { id: String(row.id), goalId: String(row.goal_id), amount: Number(row.amount), contributedOn: String(row.contributed_on), createdAt: String(row.created_at) }; }
const emptyGoal = (): GoalRecord => ({ id: crypto.randomUUID(), name: 'New goal', goalType: 'custom', targetAmount: 0, currentAmount: 0, priority: 2, targetDate: '' });

export default function GoalsPage() {
  const [userId, setUserId] = useState('');
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [contributeId, setContributeId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('Goal information is temporarily unavailable. Please try again later.'); setLoading(false); return; }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      setUserId(user.id);
      const [goalResult, contributionResult] = await Promise.all([
        supabase.from('goals').select('*').eq('user_id', user.id).order('priority').order('created_at'),
        supabase.from('goal_contributions').select('*').eq('user_id', user.id).order('contributed_on', { ascending: false }).order('created_at', { ascending: false }),
      ]);
      if (goalResult.error) setMessage("We couldn't load your goals. Please try again.");
      const loaded = (goalResult.data ?? []).map(row => mapGoal(row));
      setGoals(loaded); setOriginalIds(loaded.map(goal => goal.id));
      if (!contributionResult.error) setContributions((contributionResult.data ?? []).map(row => mapContribution(row)));
      setLoading(false);
    })();
  }, []);

  const model = useMemo(() => buildGoalWorkspace(goals, contributions), [goals, contributions]);
  const detail = model.items.find(item => item.id === detailId) ?? null;
  const editing = goals.find(goal => goal.id === editId) ?? null;
  const contributing = model.items.find(item => item.id === contributeId) ?? null;

  function updateGoal(id: string, field: keyof GoalRecord, value: string | number) { setGoals(items => items.map(goal => goal.id === id ? { ...goal, [field]: value } : goal)); }
  function addGoal() { const goal = emptyGoal(); setGoals(items => [...items, goal]); setEditId(goal.id); }

  async function saveGoals() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true);
    for (const goal of goals) {
      const { error } = await supabase.from('goals').upsert({ id: goal.id, user_id: userId, name: goal.name.trim() || 'Untitled goal', goal_type: goal.goalType, target_amount: Math.max(0, goal.targetAmount), current_amount: Math.max(0, goal.currentAmount), priority: goal.priority, target_date: goal.targetDate || null, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      if (error) { setMessage(`${goal.name || 'This goal'} couldn't be saved. Please try again.`); setSaving(false); return; }
    }
    const removed = originalIds.filter(id => !goals.some(goal => goal.id === id));
    if (removed.length) {
      const { error } = await supabase.from('goals').delete().eq('user_id', userId).in('id', removed);
      if (error) { setMessage("Your changes were saved, but one removed goal is still visible. Please try again."); setSaving(false); return; }
    }
    setOriginalIds(goals.map(goal => goal.id)); setEditId(null); setMessage('Goals saved successfully.'); setSaving(false);
  }

  async function contribute(goal: GoalWorkspaceItem, amount: number, date: string) {
    const supabase = createClient();
    if (!supabase || !userId || saving || amount <= 0 || !date) return;
    setSaving(true);
    const nextAmount = goal.currentAmount + amount;
    const { data, error: contributionError } = await supabase.from('goal_contributions').insert({ user_id: userId, goal_id: goal.id, amount, contributed_on: date }).select('*').single();
    if (contributionError) { setMessage("We couldn't save that contribution. Please try again."); setSaving(false); return; }
    const { error: goalError } = await supabase.from('goals').update({ current_amount: nextAmount, updated_at: new Date().toISOString() }).eq('id', goal.id).eq('user_id', userId);
    if (goalError) { await supabase.from('goal_contributions').delete().eq('id', data.id).eq('user_id', userId); setMessage("We couldn't update your goal. Your contribution was not applied."); setSaving(false); return; }
    setGoals(items => items.map(item => item.id === goal.id ? { ...item, currentAmount: nextAmount } : item));
    setContributions(items => [mapContribution(data), ...items]);
    setContributeId(null); setMessage(`${money.format(amount)} added to ${goal.name}.`); setSaving(false);
  }

  if (loading) return <WorkspaceSkeleton />;

  return <main className="mx-auto max-w-7xl px-5 py-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-cyan-300">Progress</p><h1 className="mt-2 text-4xl font-semibold">Goals</h1><p className="mt-2 text-slate-400">See your momentum, celebrate progress, and know what to fund next.</p></div><div className="flex flex-wrap gap-3"><button onClick={addGoal} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-3 text-sm text-cyan-300"><Plus size={17}/>Add goal</button><button onClick={saveGoals} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={17}/>{saving ? 'Saving...' : 'Save changes'}</button></div></header>
    {message && <p role="status" className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">{message}</p>}
    <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Pilot note</p><p className="mt-2 text-lg">{model.pilotNote}</p></section>
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Total Goals" value={String(model.totalGoals)} /><Metric label="Total Saved Toward Goals" value={money.format(model.totalSaved)} /><Metric label="Overall Completion" value={`${model.overallCompletion}%`} /><Metric label="Next Goal Expected to Finish" value={model.nextGoalDate ? `${model.nextGoal} · ${model.nextGoalDate}` : model.nextGoal} /></section>
    <div className="mt-8 space-y-8">{sectionNames.map(section => <GoalGroup key={section} title={section} items={model.sections[section]} contribute={setContributeId} detail={setDetailId} edit={setEditId} />)}</div>
    {contributing && <ContributionDialog goal={contributing} saving={saving} onSave={(amount, date) => contribute(contributing, amount, date)} onClose={() => setContributeId(null)} />}
    {detail && <GoalDetail goal={detail} onClose={() => setDetailId(null)} />}
    {editing && <GoalEditor goal={editing} saving={saving} update={(field, value) => updateGoal(editing.id, field, value)} remove={() => { setGoals(items => items.filter(goal => goal.id !== editing.id)); setEditId(null); }} save={saveGoals} close={() => setEditId(null)} />}
  </main>;
}

function GoalGroup({ title, items, contribute, detail, edit }: { title: GoalSection; items: GoalWorkspaceItem[]; contribute: (id: string) => void; detail: (id: string) => void; edit: (id: string) => void }) { const empty = title === 'Completed' ? 'Completed goals will appear here.' : `No goals are ${title.toLowerCase()} right now.`; return <section><h2 className="text-2xl font-semibold">{title}</h2><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.length === 0 && <p className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-500 md:col-span-2 xl:col-span-3">{empty}</p>}{items.map(goal => <GoalCard key={goal.id} goal={goal} contribute={() => contribute(goal.id)} detail={() => detail(goal.id)} edit={() => edit(goal.id)} />)}</div></section>; }
function GoalCard({ goal, contribute, detail, edit }: { goal: GoalWorkspaceItem; contribute: () => void; detail: () => void; edit: () => void }) { return <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-semibold">{goal.name}</p><p className="mt-1 text-sm text-slate-500">Target {money.format(goal.targetAmount)}</p></div><button onClick={edit} aria-label={`Edit ${goal.name}`} className="rounded-lg p-2 text-slate-500"><Pencil size={16}/></button></div><div className="mt-5 flex items-end justify-between"><p><span className="text-2xl font-semibold">{money.format(goal.currentAmount)}</span><span className="text-sm text-slate-500"> saved</span></p><span className="text-sm font-semibold text-cyan-300">{Math.round(goal.progress)}%</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label={`${goal.name} progress`} aria-valuenow={Math.round(goal.progress)} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-cyan-400" style={{ width: `${goal.progress}%` }}/></div><p className="mt-3 text-sm text-slate-400">Estimated finish: {goal.estimatedCompletionDate ?? 'Add a contribution to project'}</p><div className="mt-5 flex items-center gap-4">{goal.progress < 100 && <button onClick={contribute} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Contribute</button>}<button onClick={detail} className="inline-flex items-center gap-1 text-sm text-slate-400">View Details<ChevronRight size={15}/></button></div></article>; }
function ContributionDialog({ goal, saving, onSave, onClose }: { goal: GoalWorkspaceItem; saving: boolean; onSave: (amount: number, date: string) => void; onClose: () => void }) { const [amount, setAmount] = useState(''); const [date, setDate] = useState(today()); return <Modal title={`Contribute to ${goal.name}`} onClose={onClose}><p className="text-sm text-slate-400">{money.format(goal.remaining)} remains to reach this goal.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Contribution amount" type="number" value={amount} onChange={setAmount} /><Field label="Contribution date" type="date" value={date} onChange={setDate} /></div><button onClick={() => onSave(Number(amount), date)} disabled={saving || Number(amount) <= 0 || !date} className="mt-6 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving...' : 'Save contribution'}</button></Modal>; }
function GoalDetail({ goal, onClose }: { goal: GoalWorkspaceItem; onClose: () => void }) { const chronological = [...goal.contributions].reverse(); const starting = Math.max(0, goal.currentAmount - goal.contributions.reduce((sum, item) => sum + item.amount, 0)); const points = chronological.map((item, index) => ({ ...item, total: starting + chronological.slice(0, index + 1).reduce((sum, contribution) => sum + contribution.amount, 0) })); return <Modal title={`${goal.name} details`} onClose={onClose}><div className="grid gap-3 sm:grid-cols-3"><Metric label="Current saved" value={money.format(goal.currentAmount)} /><Metric label="Estimated finish" value={goal.estimatedCompletionDate ?? 'Not projected'} /><Metric label="Remaining" value={money.format(goal.remaining)} /></div><section className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4"><h3 className="font-semibold text-cyan-300">Pilot recommendation</h3><p className="mt-2 text-sm leading-6 text-slate-300">{goal.recommendation}</p></section><section className="mt-5"><h3 className="font-semibold">Progress projection</h3><div className="mt-4 flex h-40 items-end gap-2 rounded-2xl border border-slate-800 p-4">{[...points.slice(-7), { id: 'finish', total: goal.targetAmount }].map((point, index, all) => <div key={point.id} className="flex flex-1 flex-col items-center justify-end gap-2"><div className={`w-full rounded-t ${index === all.length - 1 ? 'bg-cyan-300/40' : 'bg-cyan-400'}`} style={{ height: `${Math.max(5, Math.min(100, point.total / Math.max(1, goal.targetAmount) * 100))}%` }}/><span className="text-[10px] text-slate-500">{index === all.length - 1 ? 'Goal' : index + 1}</span></div>)}</div></section><section className="mt-5"><h3 className="font-semibold">Contribution history</h3><div className="mt-3 space-y-2">{goal.contributions.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No contributions recorded yet.</p>}{goal.contributions.map(item => <div key={item.id} className="flex justify-between rounded-xl border border-slate-800 p-3 text-sm"><span>{new Date(`${item.contributedOn}T12:00:00`).toLocaleDateString()}</span><strong className="text-emerald-300">+{money.format(item.amount)}</strong></div>)}</div></section></Modal>; }
function GoalEditor({ goal, saving, update, remove, save, close }: { goal: GoalRecord; saving: boolean; update: (field: keyof GoalRecord, value: string | number) => void; remove: () => void; save: () => void; close: () => void }) { return <Modal title={`Edit ${goal.name}`} onClose={close}><div className="grid gap-4 sm:grid-cols-2"><Field label="Goal name" value={goal.name} onChange={value => update('name', value)} /><label className="text-xs text-slate-400">Goal type<select className="field mt-1 w-full" value={goal.goalType} onChange={event => update('goalType', event.target.value)}><option value="emergency_fund">Emergency fund</option><option value="vehicle">Vehicle</option><option value="house">House</option><option value="vacation">Vacation</option><option value="debt_free">Debt free</option><option value="custom">Custom</option></select></label><Field label="Target amount" type="number" value={String(goal.targetAmount)} onChange={value => update('targetAmount', Number(value))} /><Field label="Current saved" type="number" value={String(goal.currentAmount)} onChange={value => update('currentAmount', Number(value))} /><label className="text-xs text-slate-400">Priority<select className="field mt-1 w-full" value={goal.priority} onChange={event => update('priority', Number(event.target.value))}><option value={1}>1 - Highest</option><option value={2}>2 - Medium</option><option value={3}>3 - Lower</option></select></label><Field label="Target date" type="date" value={goal.targetDate} onChange={value => update('targetDate', value)} /></div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button onClick={remove} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/20 px-4 py-3 text-sm text-rose-300"><Trash2 size={16}/>Delete goal</button><button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={16}/>{saving ? 'Saving...' : 'Save goal'}</button></div></Modal>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div role="dialog" aria-modal="true" aria-labelledby="goal-modal-title" className="fixed inset-0 z-[70] overflow-y-auto bg-black/75 p-4 sm:p-8"><div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900 p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><h2 id="goal-modal-title" className="text-2xl font-semibold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400"><X size={20}/></button></div><div className="mt-5">{children}</div></div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 font-semibold">{value}</p></div>; }
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-xs text-slate-400">{label}<input className="field mt-1 w-full" type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={event => onChange(event.target.value)} /></label>; }
function WorkspaceSkeleton() { return <main className="mx-auto max-w-7xl animate-pulse px-5 py-8"><div className="h-12 w-56 rounded bg-slate-800"/><div className="mt-6 h-28 rounded-3xl bg-slate-900"/><div className="mt-6 grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 rounded-2xl bg-slate-900"/>)}</div><div className="mt-8 h-72 rounded-3xl bg-slate-900"/></main>; }
