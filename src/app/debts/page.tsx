'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { mapDebtRow, saveDebts, type DebtStore, type PersistedDebt } from '@/lib/debt-persistence';
import { buildDebtWorkspace, type DebtSection, type DebtWorkspaceItem, type DebtStrategy } from '@/lib/debt-workspace';
import { promotionStatusLabel } from '@/lib/promotions';
import type { SupabaseClient } from '@supabase/supabase-js';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const sections: DebtSection[] = ['Needs Attention', 'Promotional Interest', 'Active Payoff', 'Paid Off'];

function storeFor(supabase: SupabaseClient, userId: string): DebtStore {
  return {
    async upsert(payload) { const { error } = await supabase.from('debts').upsert(payload, { onConflict: 'id' }); return { error }; },
    async reload() { const { data, error } = await supabase.from('debts').select('*').eq('user_id', userId).order('created_at'); return { rows: data ?? [], error }; },
    async remove(ids) { const { error } = await supabase.from('debts').delete().eq('user_id', userId).in('id', ids); return { error }; },
  };
}

const newDebt = (): PersistedDebt => ({ id: crypto.randomUUID(), name: 'New debt', balance: 0, apr: 0, minimum: 0, promotionType: 'none', promotionalApr: null, promotionEndDate: '', postPromotionApr: null, originalPromotionalBalance: null, estimatedDeferredInterest: null });

export default function DebtsPage() {
  const [debts, setDebts] = useState<PersistedDebt[]>([]);
  const [userId, setUserId] = useState('');
  const [strategy, setStrategy] = useState<DebtStrategy>('avalanche');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('Debt information is temporarily unavailable. Please try again later.'); setLoading(false); return; }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      setUserId(user.id);
      const [{ data: profile }, result] = await Promise.all([
        supabase.from('profiles').select('preferred_strategy').eq('user_id', user.id).maybeSingle(),
        storeFor(supabase, user.id).reload(),
      ]);
      setStrategy(profile?.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche');
      if (result.error) setMessage("We couldn't load your debts. Please try again.");
      else setDebts(result.rows.map(mapDebtRow));
      setLoading(false);
    })();
  }, []);

  const model = useMemo(() => buildDebtWorkspace(debts, strategy), [debts, strategy]);
  const items = sections.flatMap(section => model.sections[section]);
  const detail = items.find(item => item.debt.id === detailId) ?? null;
  const editing = debts.find(debt => debt.id === editId) ?? null;

  async function save() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true);
    const result = await saveDebts(storeFor(supabase, userId), userId, debts);
    setMessage(result.ok ? result.warning ?? 'Debts saved successfully.' : result.message);
    if (result.ok) { setDebts(result.debts); setEditId(null); }
    setSaving(false);
  }

  function update(id: string, key: keyof PersistedDebt, value: string) {
    setDebts(current => current.map(debt => debt.id === id ? {
      ...debt,
      [key]: key === 'name' || key === 'promotionType' || key === 'promotionEndDate' ? value : value === '' ? null : Number(value),
    } : debt));
  }

  function addDebt() { const debt = newDebt(); setDebts(current => [...current, debt]); setEditId(debt.id); }

  if (loading) return <WorkspaceSkeleton />;

  return <main className="mx-auto max-w-7xl px-5 py-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold text-cyan-300">Debt strategy</p><h1 className="mt-2 text-4xl font-semibold">Debts</h1><p className="mt-2 text-slate-400">Know what needs attention and where your next payment has the most impact.</p></div>
      <div className="flex flex-wrap gap-3"><button onClick={addDebt} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 px-4 py-3 text-sm text-cyan-300"><Plus size={17}/>Add debt</button><button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={17}/>{saving ? 'Saving...' : 'Save changes'}</button></div>
    </header>

    {message && <p role="status" className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">{message}</p>}

    <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Pilot note</p><p className="mt-2 text-lg">{model.pilotNote}</p></section>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Metric label="Total debt" value={money.format(model.totalDebt)} />
      <Metric label="Total minimum payments" value={money.format(model.totalMinimums)} />
      <Metric label="Estimated monthly interest" value={money.format(model.estimatedMonthlyInterest)} />
      <Metric label="Projected debt-free date" value={model.debtFreeDate ?? 'Needs a payment update'} />
      <Metric label="Current payoff strategy" value={strategy === 'avalanche' ? 'Avalanche' : 'Snowball'} />
    </section>

    <div className="mt-8 space-y-8">
      {sections.map(section => <DebtGroup key={section} title={section} items={model.sections[section]} onDetail={setDetailId} onEdit={setEditId} />)}
    </div>

    {detail && <DebtDetail item={detail} strategy={strategy} onClose={() => setDetailId(null)} />}
    {editing && <DebtEditor debt={editing} saving={saving} update={(key, value) => update(editing.id, key, value)} remove={() => { setDebts(current => current.filter(debt => debt.id !== editing.id)); setEditId(null); }} save={save} close={() => setEditId(null)} />}
  </main>;
}

function DebtGroup({ title, items, onDetail, onEdit }: { title: DebtSection; items: DebtWorkspaceItem[]; onDetail: (id: string) => void; onEdit: (id: string) => void }) {
  const empty = title === 'Needs Attention' ? 'No debts need immediate attention.' : title === 'Promotional Interest' ? 'No active promotional balances.' : title === 'Active Payoff' ? 'No standard payoff balances.' : 'Paid-off debts will appear here.';
  return <section><div className="flex items-center gap-2"><h2 className="text-2xl font-semibold">{title}</h2>{title === 'Needs Attention' && items.length > 0 && <span className="rounded-full bg-rose-400/10 px-2 py-1 text-xs text-rose-300">{items.length}</span>}</div><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.length === 0 && <p className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-500 md:col-span-2 xl:col-span-3">{empty}</p>}{items.map(item => <DebtCard key={item.debt.id} item={item} onDetail={() => onDetail(item.debt.id)} onEdit={() => onEdit(item.debt.id)} />)}</div></section>;
}

function DebtCard({ item, onDetail, onEdit }: { item: DebtWorkspaceItem; onDetail: () => void; onEdit: () => void }) {
  const { debt, promotion } = item;
  return <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-lg font-semibold">{debt.name}</p><p className="mt-1 text-sm text-slate-500">Priority #{item.rank}</p></div><PriorityBadge value={item.priority} /></div><div className="mt-5 grid grid-cols-2 gap-4 text-sm"><Value label="Balance" value={money.format(debt.balance)} /><Value label="Current APR" value={`${item.effectiveApr.toFixed(2)}%`} /><Value label="Minimum payment" value={money.format(debt.minimum)} /><Value label="Recommended payment" value={money.format(item.recommendedPayment)} /><Value label="Projected payoff" value={item.payoffDate ?? 'Not projected'} /><Value label="Promotion" value={debt.promotionType === 'none' ? 'None' : promotionStatusLabel(promotion.status)} /></div>{debt.promotionType !== 'none' && <p className="mt-4 rounded-xl bg-slate-950/60 p-3 text-xs leading-5 text-slate-400">{debt.promotionType === 'deferred_interest' ? 'Deferred interest' : '0% promotional APR'} · {promotion.daysRemaining ?? 0} days remaining · {money.format(promotion.requiredPerPaycheck)} per paycheck</p>}<p className="mt-4 text-sm leading-6 text-slate-400">{item.explanation[0]}</p><div className="mt-5 flex items-center gap-4"><button onClick={onDetail} className="inline-flex items-center gap-1 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">View Strategy<ChevronRight size={15}/></button><button onClick={onEdit} className="inline-flex items-center gap-2 text-sm text-slate-400"><Pencil size={15}/>Edit Debt</button></div></article>;
}

function DebtDetail({ item, strategy, onClose }: { item: DebtWorkspaceItem; strategy: DebtStrategy; onClose: () => void }) {
  const { debt, promotion } = item;
  return <Modal title={`${debt.name} strategy`} onClose={onClose}><div className="grid gap-3 sm:grid-cols-3"><Metric label="Recommended payment" value={money.format(item.recommendedPayment)} /><Metric label="Projected payoff" value={item.payoffDate ?? 'Not projected'} /><Metric label="Estimated interest" value={money.format(item.estimatedInterest)} /></div><section className="mt-5 rounded-2xl border border-slate-800 p-4"><h3 className="font-semibold">Why this ranks #{item.rank}</h3><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">{item.explanation.map(reason => <li key={reason}>• {reason}</li>)}</ul></section>{debt.promotionType !== 'none' && <section className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4"><h3 className="font-semibold">Promotional deadline analysis</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Value label="Promotion type" value={debt.promotionType === 'deferred_interest' ? 'Deferred interest' : '0% promotional APR'} /><Value label="End date" value={debt.promotionEndDate ? new Date(`${debt.promotionEndDate}T12:00:00`).toLocaleDateString() : 'Not set'} /><Value label="Days remaining" value={String(promotion.daysRemaining ?? 0)} /><Value label="Required per paycheck" value={money.format(promotion.requiredPerPaycheck)} /><Value label="Status" value={promotionStatusLabel(promotion.status)} /><Value label="Deferred interest at risk" value={money.format(promotion.estimatedInterestAtRisk)} /></div></section>}<section className="mt-5"><h3 className="font-semibold">Scenario comparison</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Plan label="Minimum payment" payment={debt.minimum} date={item.minimumPayoffDate} interest={item.minimumInterest} /><Plan label="Pilot recommendation" payment={item.recommendedPayment} date={item.payoffDate} interest={item.estimatedInterest} highlight /></div><p className="mt-3 text-xs text-slate-500">Comparison uses your saved {strategy} strategy and current promotional terms.</p></section></Modal>;
}

function DebtEditor({ debt, saving, update, remove, save, close }: { debt: PersistedDebt; saving: boolean; update: (key: keyof PersistedDebt, value: string) => void; remove: () => void; save: () => void; close: () => void }) {
  return <Modal title={`Edit ${debt.name}`} onClose={close}><div className="grid gap-4 sm:grid-cols-2"><Field label="Account name" value={debt.name} onChange={value => update('name', value)} /><Field label="Balance" type="number" value={String(debt.balance)} onChange={value => update('balance', value)} /><Field label="APR %" type="number" value={String(debt.apr)} onChange={value => update('apr', value)} /><Field label="Minimum payment" type="number" value={String(debt.minimum)} onChange={value => update('minimum', value)} /><label className="text-xs text-slate-400">Promotion type<select className="field mt-1 w-full" value={debt.promotionType} onChange={event => update('promotionType', event.target.value)}><option value="none">None</option><option value="zero_percent">0% promotional APR</option><option value="deferred_interest">Deferred interest</option></select></label>{debt.promotionType !== 'none' && <><Field label="Promotional APR %" type="number" value={String(debt.promotionalApr ?? '')} onChange={value => update('promotionalApr', value)} /><Field label="Promotion end date" type="date" value={debt.promotionEndDate} onChange={value => update('promotionEndDate', value)} /><Field label="Post-promotion APR %" type="number" value={String(debt.postPromotionApr ?? '')} onChange={value => update('postPromotionApr', value)} /><Field label="Original promotional balance" type="number" value={String(debt.originalPromotionalBalance ?? '')} onChange={value => update('originalPromotionalBalance', value)} />{debt.promotionType === 'deferred_interest' && <Field label="Estimated deferred interest" type="number" value={String(debt.estimatedDeferredInterest ?? '')} onChange={value => update('estimatedDeferredInterest', value)} />}</>}</div><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button onClick={remove} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/20 px-4 py-3 text-sm text-rose-300"><Trash2 size={16}/>Delete debt</button><button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60"><Save size={16}/>{saving ? 'Saving...' : 'Save debt'}</button></div></Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div role="dialog" aria-modal="true" aria-labelledby="debt-modal-title" className="fixed inset-0 z-[70] overflow-y-auto bg-black/75 p-4 sm:p-8"><div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-700 bg-slate-900 p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><h2 id="debt-modal-title" className="text-2xl font-semibold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400"><X size={20}/></button></div><div className="mt-5">{children}</div></div></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 font-semibold">{value}</p></div>; }
function Value({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function PriorityBadge({ value }: { value: DebtWorkspaceItem['priority'] }) { const tone = value === 'Urgent' ? 'bg-rose-400/10 text-rose-300' : value === 'High' ? 'bg-amber-400/10 text-amber-200' : value === 'Complete' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-slate-800 text-slate-300'; const Icon = value === 'Complete' ? CheckCircle2 : value === 'Urgent' ? AlertTriangle : null; return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${tone}`}>{Icon && <Icon size={13}/>} {value}</span>; }
function Plan({ label, payment, date, interest, highlight = false }: { label: string; payment: number; date: string | null; interest: number; highlight?: boolean }) { return <div className={`rounded-2xl border p-4 ${highlight ? 'border-cyan-400/30 bg-cyan-400/5' : 'border-slate-800'}`}><p className="text-sm font-semibold">{label}</p><p className="mt-3 text-2xl font-semibold">{money.format(payment)}/mo</p><p className="mt-2 text-xs text-slate-400">Payoff: {date ?? 'Not projected'}<br/>Interest: {money.format(interest)}</p></div>; }
function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="text-xs text-slate-400">{label}<input className="field mt-1 w-full" type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined} value={value} onChange={event => onChange(event.target.value)} /></label>; }
function WorkspaceSkeleton() { return <main className="mx-auto max-w-7xl animate-pulse px-5 py-8"><div className="h-12 w-56 rounded bg-slate-800"/><div className="mt-6 h-28 rounded-3xl bg-slate-900"/><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-24 rounded-2xl bg-slate-900"/>)}</div><div className="mt-8 h-72 rounded-3xl bg-slate-900"/></main>; }
