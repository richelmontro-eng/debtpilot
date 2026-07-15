'use client';

import { useEffect, useMemo, useState } from 'react';
import { Car, CircleDollarSign, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { adviseVehicle, type DatedBill, type DatedDebtPayment, type PayFrequency, type VehicleAdvisorFinances, type VehiclePurchaseScenario } from '@/lib/pilot-engine';
import { createClient } from '@/lib/supabase';
import type { VehicleScenario } from '@/lib/vehicle';

type SavedVehicle = VehicleScenario & { id: string; name: string };
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const initialScenario: VehiclePurchaseScenario = { price: 45000, downPayment: 5000, tradeIn: 0, taxRate: 0, fees: 0, apr: 6.5, termMonths: 72, insuranceMonthly: 200, fuelMonthly: 250, maintenanceMonthly: 100, purchaseDate: inDays(30) };
const initialFinances: VehicleAdvisorFinances = { startDate: today(), horizonDays: 90, currentCheckingBalance: 0, protectedCheckingCushion: 0, payPerCheck: 0, payFrequency: 'weekly', firstPaycheckDate: today(), livingReservePerCheck: 0, bills: [], debtPayments: [], plannedGoalContributions: [], existingVehicleMonthly: 0 };

export default function VehiclePlannerPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('Vehicle scenario');
  const [scenario, setScenario] = useState(initialScenario);
  const [finances, setFinances] = useState(initialFinances);
  const [savedVehicles, setSavedVehicles] = useState<SavedVehicle[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('DebtPilot is temporarily unavailable. Please try again later.'); setLoading(false); return; }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      setUserId(user.id);
      const [profileResult, billResult, debtResult, vehicleResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('bills').select('id,name,amount,due_day,frequency').eq('user_id', user.id),
        supabase.from('debts').select('id,name,minimum_payment,due_day').eq('user_id', user.id),
        supabase.from('vehicle_scenarios').select('*').eq('user_id', user.id).order('created_at'),
      ]);
      if (profileResult.error || billResult.error || debtResult.error || vehicleResult.error) setMessage('We couldn’t load all of your planning details. Review the assumptions before relying on this projection.');
      const profile = profileResult.data;
      setFinances(current => ({
        ...current,
        currentCheckingBalance: Number(profile?.checking_balance ?? 0), protectedCheckingCushion: Number(profile?.checking_cushion ?? 0),
        payPerCheck: Number(profile?.weekly_take_home ?? 0), payFrequency: (profile?.pay_frequency ?? 'weekly') as PayFrequency,
        livingReservePerCheck: Number(profile?.weekly_living_reserve ?? 0),
        bills: (billResult.data ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' })) as DatedBill[],
        debtPayments: (debtResult.data ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.minimum_payment), dueDay: Number(row.due_day ?? 1) })) as DatedDebtPayment[],
      }));
      setSavedVehicles((vehicleResult.data ?? []).map(row => ({ id: row.id, name: row.name, price: Number(row.price), downPayment: Number(row.down_payment), tradeIn: Number(row.trade_in), taxRate: Number(row.tax_rate), fees: Number(row.fees), apr: Number(row.apr), termMonths: Number(row.term_months), insuranceMonthly: Number(row.insurance_monthly), fuelMonthly: Number(row.fuel_monthly), maintenanceMonthly: Number(row.maintenance_monthly) })));
      setLoading(false);
    })();
  }, []);

  const advisor = useMemo(() => adviseVehicle(finances, scenario), [finances, scenario]);
  const comparisons = useMemo(() => savedVehicles.map(vehicle => ({ vehicle, advisor: adviseVehicle(finances, { ...vehicle, purchaseDate: scenario.purchaseDate }) })), [savedVehicles, finances, scenario.purchaseDate]);
  function update(field: keyof VehicleScenario, value: number) { setScenario(current => ({ ...current, [field]: Number.isFinite(value) ? Math.max(0, value) : 0 })); }
  function loadVehicle(vehicle: SavedVehicle) { setName(vehicle.name); setScenario(current => ({ ...vehicle, purchaseDate: current.purchaseDate })); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function saveScenario() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true); setMessage('Saving vehicle scenario…');
    const { data, error } = await supabase.from('vehicle_scenarios').insert({ user_id: userId, name: name.trim() || 'Vehicle scenario', price: scenario.price, down_payment: scenario.downPayment, trade_in: scenario.tradeIn, tax_rate: scenario.taxRate, fees: scenario.fees, apr: scenario.apr, term_months: scenario.termMonths, insurance_monthly: scenario.insuranceMonthly, fuel_monthly: scenario.fuelMonthly, maintenance_monthly: scenario.maintenanceMonthly }).select('*').single();
    if (error) setMessage('We couldn’t save this vehicle scenario. Please try again.');
    else if (data) { setSavedVehicles(items => [...items, { id: data.id, name: data.name, price: Number(data.price), downPayment: Number(data.down_payment), tradeIn: Number(data.trade_in), taxRate: Number(data.tax_rate), fees: Number(data.fees), apr: Number(data.apr), termMonths: Number(data.term_months), insuranceMonthly: Number(data.insurance_monthly), fuelMonthly: Number(data.fuel_monthly), maintenanceMonthly: Number(data.maintenance_monthly) }]); setMessage('Vehicle scenario saved successfully.'); }
    setSaving(false);
  }
  async function deleteScenario(id: string) { const supabase = createClient(); if (!supabase) return; const { error } = await supabase.from('vehicle_scenarios').delete().eq('id', id).eq('user_id', userId); if (error) setMessage('We couldn’t delete this vehicle scenario. Please try again.'); else { setSavedVehicles(items => items.filter(item => item.id !== id)); setMessage('Vehicle scenario deleted.'); } }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Building your 90-day vehicle forecast…</main>;
  const tone = advisor.coach.rating === 'Strong fit' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : advisor.coach.rating === 'Affordable with caution' ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-rose-400/30 bg-rose-400/10 text-rose-200';

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Car size={16}/> Vehicle Advisor</div><h1 className="text-4xl font-semibold">See how a vehicle changes your actual cash timeline.</h1><p className="mt-3 max-w-3xl text-slate-400">Projected figures include every expected paycheck and dated obligation across the next 90 days—not a monthly-income shortcut.</p></header>
    {message && <p role="status" className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric label="Projected loan payment" value={`${money.format(advisor.loan.monthlyPayment)}/mo`}/><Metric label="Projected ownership cost" value={`${money.format(advisor.loan.monthlyOwnershipCost)}/mo`}/><Metric label="Scenario low balance" value={money.format(advisor.scenario.lowestBalance)}/><Metric label="Vehicle Coach" value={advisor.coach.rating} accent/></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-2xl font-semibold">Vehicle scenario</h2><button onClick={saveScenario} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"><Save size={17}/>{saving ? 'Saving…' : 'Save scenario'}</button></div>
        <label className="mt-5 block text-xs text-slate-400">Scenario name<input className="field mt-1 w-full" value={name} onChange={event => setName(event.target.value)}/></label>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><DateField label="Projected purchase date" value={scenario.purchaseDate} onChange={value => setScenario(current => ({ ...current, purchaseDate: value }))}/><DateField label="Next expected paycheck" value={finances.firstPaycheckDate} onChange={value => setFinances(current => ({ ...current, firstPaycheckDate: value }))}/><NumberField label="Purchase price" value={scenario.price} onChange={value => update('price', value)}/><NumberField label="Down payment" value={scenario.downPayment} onChange={value => update('downPayment', value)}/><NumberField label="Trade-in value" value={scenario.tradeIn} onChange={value => update('tradeIn', value)}/><NumberField label="Sales tax %" value={scenario.taxRate} onChange={value => update('taxRate', value)} step="0.01"/><NumberField label="Fees paid at purchase" value={scenario.fees} onChange={value => update('fees', value)}/><NumberField label="APR %" value={scenario.apr} onChange={value => update('apr', value)} step="0.01"/><NumberField label="Loan term in months" value={scenario.termMonths} onChange={value => update('termMonths', value)}/><NumberField label="Insurance per month" value={scenario.insuranceMonthly} onChange={value => update('insuranceMonthly', value)}/><NumberField label="Fuel per month" value={scenario.fuelMonthly} onChange={value => update('fuelMonthly', value)}/><NumberField label="Maintenance per month" value={scenario.maintenanceMonthly} onChange={value => update('maintenanceMonthly', value)}/><NumberField label="Existing vehicle obligations per month" value={finances.existingVehicleMonthly} onChange={value => setFinances(current => ({ ...current, existingVehicleMonthly: Math.max(0, value) }))}/></div>
      </div>
      <div className={`rounded-3xl border p-6 ${tone}`}><p className="text-xs font-semibold uppercase tracking-[0.2em]">Vehicle Coach</p><h2 className="mt-3 text-4xl font-semibold">{advisor.coach.rating}</h2><p className="mt-5 text-base leading-7">{advisor.coach.explanation}</p><p className="mt-5 text-sm">{advisor.scenario.underfundedBills.length ? `${advisor.scenario.underfundedBills.length} bill${advisor.scenario.underfundedBills.length === 1 ? '' : 's'} may be underfunded in this projection.` : 'All modeled bills remain funded.'}</p></div>
    </section>

    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold">Baseline vs vehicle scenario</h2><p className="mt-2 text-sm text-slate-400">All values are projected from dated cash events.</p><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-slate-500"><tr><th className="pb-3">90-day measure</th><th className="pb-3">Baseline</th><th className="pb-3">With vehicle</th></tr></thead><tbody className="divide-y divide-slate-800"><CompareRow label="Lowest projected checking" before={money.format(advisor.baseline.lowestBalance)} after={money.format(advisor.scenario.lowestBalance)}/><CompareRow label="Dates below protected cushion" before={`${advisor.baseline.belowCushionDates.length}`} after={`${advisor.scenario.belowCushionDates.length}`}/><CompareRow label="Negative-balance dates" before={`${advisor.baseline.negativeBalanceDates.length}`} after={`${advisor.scenario.negativeBalanceDates.length}`}/><CompareRow label="Recovery date after shortfall" before={displayDate(advisor.baseline.recoveryDate)} after={displayDate(advisor.scenario.recoveryDate)}/><CompareRow label="Bills projected underfunded" before={`${advisor.baseline.underfundedBills.length}`} after={`${advisor.scenario.underfundedBills.length}`}/><CompareRow label="Projected cash-flow health" before={`${advisor.baseline.health}/100`} after={`${advisor.scenario.health}/100`}/></tbody></table></div></section>

    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold">90-day projected cash-flow summary</h2><div className="mt-5 grid gap-4 sm:grid-cols-3"><BalanceCard day="30 days" before={advisor.baseline.balances.day30} after={advisor.scenario.balances.day30}/><BalanceCard day="60 days" before={advisor.baseline.balances.day60} after={advisor.scenario.balances.day60}/><BalanceCard day="90 days" before={advisor.baseline.balances.day90} after={advisor.scenario.balances.day90}/></div></section>

    <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Reality Check</p><h2 className="mt-3 text-3xl font-semibold">A projected vehicle price around {money.format(advisor.realityCheck.affordablePriceLow)}–{money.format(advisor.realityCheck.affordablePriceHigh)} fits the dated cash-flow limit.</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Detail label="Maximum safe loan payment" value={`${money.format(advisor.realityCheck.maximumSafeMonthlyPayment)}/mo`}/><Detail label="Additional down payment needed" value={money.format(advisor.realityCheck.additionalDownPaymentNeeded)}/><Detail label="Lower-price alternative" value={money.format(advisor.realityCheck.lowerPriceAlternative)}/><Detail label="Estimated wait" value={advisor.realityCheck.estimatedWaitMonths === null ? 'More than 24 months' : `${advisor.realityCheck.estimatedWaitMonths} month${advisor.realityCheck.estimatedWaitMonths === 1 ? '' : 's'}`}/></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2"><div><h3 className="font-semibold">Key assumptions</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">{advisor.assumptions.map(item => <li key={item}>{item}</li>)}</ul></div><div><h3 className="font-semibold">Confidence: {advisor.confidence.score}% ({advisor.confidence.level})</h3><p className="mt-3 text-sm leading-6 text-slate-400">Confidence reflects the completeness of the dated events supplied to the shared Pilot Engine.</p></div></div>
      <details className="mt-6 rounded-2xl border border-slate-700 bg-slate-950/50 p-4"><summary className="cursor-pointer font-semibold text-cyan-300">How was this calculated?</summary><p className="mt-3 text-sm leading-6 text-slate-400">{advisor.calculation}</p></details>
    </section>

    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold">Purchase details</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Detail label="Projected amount financed" value={money.format(advisor.loan.amountFinanced)}/><Detail label="Projected cash at purchase" value={money.format(advisor.loan.cashAtPurchase)}/><Detail label="Projected loan interest" value={money.format(advisor.loan.totalInterest)}/><Detail label="Projected monthly ownership" value={`${money.format(advisor.loan.monthlyOwnershipCost)}/mo`}/></div></section>

    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold">Saved vehicle comparison</h2>{comparisons.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">No saved vehicles yet.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{comparisons.map(({ vehicle, advisor: comparison }) => <article key={vehicle.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{vehicle.name}</h3><p className="mt-1 text-sm text-slate-500">{money.format(vehicle.price)} · {vehicle.termMonths} months</p></div><button aria-label={`Delete ${vehicle.name}`} onClick={() => deleteScenario(vehicle.id)} className="rounded-lg border border-rose-400/20 p-2 text-rose-300"><Trash2 size={16}/></button></div><div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Coach" value={comparison.coach.rating}/><Mini label="Scenario low" value={money.format(comparison.scenario.lowestBalance)}/></div><button onClick={() => loadVehicle(vehicle)} className="mt-4 w-full rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Load scenario</button></article>)}</div>}</section>
    <p className="mt-6 text-xs leading-5 text-slate-500">Planning estimate only. Projected figures depend on the dates and amounts entered. Confirm dealer, lender, insurance, and operating-cost details before purchasing.</p>
  </div></main>;
}

function NumberField({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (value: number) => void; step?: string }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="number" min="0" step={step} value={value} onChange={event => onChange(Number(event.target.value))}/></label>; }
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="date" value={value} onChange={event => onChange(event.target.value)}/></label>; }
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{accent ? <ShieldCheck/> : <CircleDollarSign/>}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>; }
function CompareRow({ label, before, after }: { label: string; before: string; after: string }) { return <tr><th className="py-4 font-medium text-slate-300">{label}</th><td className="py-4 text-slate-400">{before}</td><td className="py-4 font-semibold text-cyan-200">{after}</td></tr>; }
function BalanceCard({ day, before, after }: { day: string; before: number; after: number }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"><p className="text-sm font-semibold">Projected balance at {day}</p><p className="mt-3 text-sm text-slate-500">Baseline {money.format(before)}</p><p className="mt-1 text-xl font-semibold text-cyan-200">With vehicle {money.format(after)}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function displayDate(value: string | null) { return value ? new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'No shortfall'; }
