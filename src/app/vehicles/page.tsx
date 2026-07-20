'use client';

import { useEffect, useMemo, useState } from 'react';
import { Car, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { adviseVehicle, type CashFlowChartPoint, type DatedBill, type DatedDebtPayment, type PayFrequency, type PaycheckReconciliation, type VehicleAdvisorFinances, type VehiclePaymentDay, type VehiclePurchaseScenario } from '@/lib/pilot-engine';
import { createClient } from '@/lib/supabase';
import type { VehicleScenario } from '@/lib/vehicle';

type SavedVehicle = VehiclePurchaseScenario & { id: string; name: string };
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const initialScenario: VehiclePurchaseScenario = { price: 45000, downPayment: 5000, tradeIn: 0, taxRate: 0, fees: 0, apr: 6.5, termMonths: 72, insuranceMonthly: 200, fuelMonthly: 250, maintenanceMonthly: 100, registrationAnnual: 250, purchaseDate: inDays(30), firstPaymentDate: inDays(60), preferredPaymentDay: 15 };
const initialFinances: VehicleAdvisorFinances = { startDate: today(), horizonDays: 90, currentCheckingBalance: 0, protectedCheckingCushion: 0, payPerCheck: 0, payFrequency: 'weekly', firstPaycheckDate: today(), livingReservePerCheck: 0, bills: [], debtPayments: [], plannedGoalContributions: [], existingVehicleMonthly: 0 };

export default function VehiclePlannerPage() {
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(''), [userId, setUserId] = useState(''), [name, setName] = useState('Vehicle scenario');
  const [scenario, setScenario] = useState(initialScenario), [finances, setFinances] = useState(initialFinances);
  const [savedVehicles, setSavedVehicles] = useState<SavedVehicle[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('DebtPilot is temporarily unavailable. Please try again later.'); setLoading(false); return; }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      setUserId(user.id);
      const [profileResult, billResult, debtResult, vehicleResult, paycheckResult, balanceResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('bills').select('id,name,amount,due_day,frequency').eq('user_id', user.id),
        supabase.from('debts').select('id,name,minimum_payment,due_day').eq('user_id', user.id),
        supabase.from('vehicle_scenarios').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('paycheck_events').select('*').eq('user_id', user.id),
        supabase.from('checking_balance_reconciliations').select('*').eq('user_id', user.id).order('confirmed_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (profileResult.error || billResult.error || debtResult.error || vehicleResult.error) setMessage('We couldn’t load all planning details. Review the assumptions before relying on this projection.');
      const profile = profileResult.data;
      setFinances(current => ({
        ...current,
        currentCheckingBalance: Number(profile?.checking_balance ?? 0), protectedCheckingCushion: Number(profile?.checking_cushion ?? 0),
        payPerCheck: Number(profile?.weekly_take_home ?? 0), payFrequency: (profile?.pay_frequency ?? 'weekly') as PayFrequency,
        firstPaycheckDate: profile?.next_paycheck_date ?? current.firstPaycheckDate, livingReservePerCheck: Number(profile?.weekly_living_reserve ?? 0),
        bills: (billResult.data ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' })) as DatedBill[],
        debtPayments: (debtResult.data ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.minimum_payment), dueDay: Number(row.due_day ?? 1) })) as DatedDebtPayment[],
        reconciliation: paycheckResult.error || balanceResult.error ? undefined : {
          asOfDate: today(),
          paycheckEvents: (paycheckResult.data ?? []).map(row => ({ id: row.id, expectedDate: row.expected_date, expectedAmount: Number(row.expected_amount), status: row.status, actualAmount: row.actual_amount === null ? null : Number(row.actual_amount), confirmedAt: row.confirmed_at, note: row.note })) as PaycheckReconciliation[],
          latestBalance: balanceResult.data ? { id: balanceResult.data.id, calculatedBalance: Number(balanceResult.data.calculated_balance), confirmedBalance: Number(balanceResult.data.confirmed_balance), variance: Number(balanceResult.data.variance), confirmedAt: balanceResult.data.confirmed_at } : null,
        },
      }));
      setSavedVehicles((vehicleResult.data ?? []).map(row => mapVehicle(row)));
      setLoading(false);
    })();
  }, []);

  const advisor = useMemo(() => adviseVehicle(finances, scenario), [finances, scenario]);
  const comparisons = useMemo(() => savedVehicles.map(vehicle => ({ vehicle, result: adviseVehicle(finances, vehicle) })), [savedVehicles, finances]);
  function update(field: keyof VehicleScenario | 'registrationAnnual', value: number) { setScenario(current => ({ ...current, [field]: Number.isFinite(value) ? Math.max(0, value) : 0 })); }
  function loadVehicle(vehicle: SavedVehicle) { setName(vehicle.name); setScenario(vehicle); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function saveScenario() {
    const supabase = createClient(); if (!supabase || !userId || saving) return;
    setSaving(true); setMessage('Saving vehicle scenario…');
    const { data, error } = await supabase.from('vehicle_scenarios').insert({
      user_id: userId, name: name.trim() || 'Vehicle scenario', price: scenario.price, down_payment: scenario.downPayment, trade_in: scenario.tradeIn,
      tax_rate: scenario.taxRate, fees: scenario.fees, apr: scenario.apr, term_months: scenario.termMonths, insurance_monthly: scenario.insuranceMonthly,
      fuel_monthly: scenario.fuelMonthly, maintenance_monthly: scenario.maintenanceMonthly, registration_annual: scenario.registrationAnnual,
      purchase_date: scenario.purchaseDate, first_payment_date: scenario.firstPaymentDate, preferred_payment_day: scenario.preferredPaymentDay === 'last' ? 31 : scenario.preferredPaymentDay,
    }).select('*').single();
    if (error) setMessage('We couldn’t save this vehicle scenario. Please try again.');
    else if (data) { setSavedVehicles(items => [...items, mapVehicle(data)]); setMessage('Vehicle scenario saved successfully.'); }
    setSaving(false);
  }
  async function deleteScenario(id: string) { const supabase = createClient(); if (!supabase) return; const { error } = await supabase.from('vehicle_scenarios').delete().eq('id', id).eq('user_id', userId); if (error) setMessage('We couldn’t delete this vehicle scenario. Please try again.'); else { setSavedVehicles(items => items.filter(item => item.id !== id)); setMessage('Vehicle scenario deleted.'); } }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Building your vehicle timeline…</main>;
  const tone = advisor.recommendation === 'Buy Now' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : advisor.recommendation === 'Move Payment Date' || advisor.recommendation === 'Wait Until Next Paycheck' ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-rose-400/30 bg-rose-400/10 text-rose-200';
  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Car size={16}/> Vehicle Advisor</div><h1 className="text-4xl font-semibold">See every paycheck and bill after a vehicle purchase.</h1><p className="mt-3 max-w-3xl text-slate-400">The recommendation comes from a dated Pilot Engine forecast—not a monthly income ratio.</p></header>
    {message && <p role="status" className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm">{message}</p>}

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6"><Metric label="Timeline summary" value={advisor.recommendation}/><Metric label="Lowest balance" value={money.format(advisor.scenario.lowestBalance)} detail={formatDate(advisor.scenario.lowestBalanceDate)}/><Metric label="Best purchase date" value={formatDate(advisor.recommendedPurchaseDate)}/><Metric label="Best payment date" value={paymentDay(advisor.recommendedPaymentDate)}/><Metric label="Protected cushion" value={advisor.scenario.protectedCushionMaintained ? 'Maintained' : `${advisor.scenario.daysBelowCushion} days below`}/><Metric label="Forecast confidence" value={advisor.confidence.level} detail={`${advisor.confidence.score}%`}/></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-2xl font-semibold">Temporary financing scenario</h2><button onClick={saveScenario} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"><Save size={17}/>{saving ? 'Saving…' : 'Save scenario'}</button></div>
        <label className="mt-5 block text-xs text-slate-400">Scenario name<input className="field mt-1 w-full" value={name} onChange={event => setName(event.target.value)}/></label>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><DateField label="Purchase date" value={scenario.purchaseDate} onChange={value => setScenario(current => ({ ...current, purchaseDate: value }))}/><DateField label="First payment date" value={scenario.firstPaymentDate} onChange={value => setScenario(current => ({ ...current, firstPaymentDate: value }))}/><label className="text-xs text-slate-400">Preferred payment day<select className="field mt-1 w-full" value={String(scenario.preferredPaymentDay ?? 15)} onChange={event => setScenario(current => ({ ...current, preferredPaymentDay: event.target.value === 'last' ? 'last' : Number(event.target.value) as VehiclePaymentDay }))}><option value="1">1st</option><option value="10">10th</option><option value="15">15th</option><option value="22">22nd</option><option value="last">Last day</option></select></label><DateField label="Next expected paycheck" value={finances.firstPaycheckDate} onChange={value => setFinances(current => ({ ...current, firstPaycheckDate: value }))}/><NumberField label="Purchase price" value={scenario.price} onChange={value => update('price', value)}/><NumberField label="Down payment" value={scenario.downPayment} onChange={value => update('downPayment', value)}/><NumberField label="Trade-in value" value={scenario.tradeIn} onChange={value => update('tradeIn', value)}/><NumberField label="Sales tax %" value={scenario.taxRate} onChange={value => update('taxRate', value)} step="0.01"/><NumberField label="Fees" value={scenario.fees} onChange={value => update('fees', value)}/><NumberField label="APR %" value={scenario.apr} onChange={value => update('apr', value)} step="0.01"/><NumberField label="Loan term in months" value={scenario.termMonths} onChange={value => update('termMonths', value)}/><NumberField label="Insurance per month" value={scenario.insuranceMonthly} onChange={value => update('insuranceMonthly', value)}/><NumberField label="Fuel per month" value={scenario.fuelMonthly} onChange={value => update('fuelMonthly', value)}/><NumberField label="Maintenance reserve per month" value={scenario.maintenanceMonthly} onChange={value => update('maintenanceMonthly', value)}/><NumberField label="Registration per year" value={scenario.registrationAnnual} onChange={value => update('registrationAnnual', value)}/><NumberField label="Existing vehicle obligations per month" value={finances.existingVehicleMonthly} onChange={value => setFinances(current => ({ ...current, existingVehicleMonthly: Math.max(0, value) }))}/></div>
      </div>
      <div className={`rounded-3xl border p-6 ${tone}`}><p className="text-xs font-semibold uppercase tracking-[0.2em]">Pilot recommendation</p><h2 className="mt-3 text-4xl font-semibold">{advisor.recommendation}</h2><p className="mt-5 leading-7">{advisor.explanation}</p><div className="mt-5 grid gap-2 text-sm"><p>Bills: {advisor.scenario.billsProtected ? 'protected' : `${advisor.scenario.billsAtRisk.length} at risk`}</p><p>Debt strategy: {advisor.scenario.debtStrategyPreserved ? 'preserved' : 'interrupted'}</p><p>Goals: {advisor.scenario.goalsPreserved ? 'preserved' : 'delayed'}</p></div>{advisor.scenarioForecast.reconciliation.disclosures.map(item => <p key={item} className="mt-3 rounded-xl border border-current/20 p-3 text-sm">{item}</p>)}</div>
    </section>

    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold">Projected cash-flow timeline</h2><p className="mt-2 text-sm text-slate-400">Every point reflects the balance after that day’s expected and confirmed events.</p><CashFlowChart points={advisor.scenario.chart}/><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Detail label="Projected ending balance" value={money.format(advisor.scenario.projectedEndingBalance)}/><Detail label="Negative-balance days" value={String(advisor.scenario.negativeBalanceDates.length)}/><Detail label="Bills protected" value={advisor.scenario.billsProtected ? 'Yes' : 'No'}/><Detail label="Debt and goals preserved" value={advisor.scenario.debtStrategyPreserved && advisor.scenario.goalsPreserved ? 'Yes' : 'No'}/></div></section>

    <section className="mt-6 grid gap-6 lg:grid-cols-3"><AnalysisCard title="Payment date optimization" headline={paymentDay(advisor.paymentDateAnalysis.bestPaymentDate)} detail={advisor.paymentDateAnalysis.reason} footer={`Lowest-balance improvement: ${signedMoney(advisor.paymentDateAnalysis.protectedCushionImpact)}`}/><AnalysisCard title="Down payment analysis" headline={money.format(advisor.downPaymentAnalysis.recommended)} detail={`Current ${money.format(advisor.downPaymentAnalysis.current)} · Difference ${signedMoney(advisor.downPaymentAnalysis.difference)}`} footer={advisor.downPaymentAnalysis.protectsCushion ? 'Protects the checking cushion in the tested timeline.' : 'No tested larger down payment fully protected the cushion.'}/><AnalysisCard title="Wait analysis" headline={advisor.waitAnalysis.strongestLabel} detail={advisor.waitAnalysis.reason} footer={`Recommended purchase date: ${formatDate(advisor.recommendedPurchaseDate)}`}/></section>

    <section className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/5 p-6"><h2 className="text-2xl font-semibold">Pilot explanation</h2><div className="mt-5 grid gap-6 lg:grid-cols-2"><div><h3 className="font-semibold">Key assumptions</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-400">{advisor.assumptions.map(item => <li key={item}>{item}</li>)}</ul></div><div><h3 className="font-semibold">Scenario details</h3><div className="mt-3 grid grid-cols-2 gap-3"><Mini label="Amount financed" value={money.format(advisor.loan.amountFinanced)}/><Mini label="Recurring payment event" value={money.format(advisor.loan.recurringPayment)}/><Mini label="Cash at purchase" value={money.format(advisor.loan.cashAtPurchase)}/><Mini label="Reduced budget option" value={money.format(advisor.recommendedVehicleBudget)}/></div></div></div><details className="mt-6 rounded-2xl border border-slate-700 p-4"><summary className="cursor-pointer font-semibold text-cyan-300">How was this calculated?</summary><p className="mt-3 text-sm leading-6 text-slate-400">{advisor.calculation}</p></details></section>

    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold">Saved vehicle comparison</h2>{comparisons.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">No saved vehicles yet.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{comparisons.map(({ vehicle, result }) => <article key={vehicle.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{vehicle.name}</h3><p className="mt-1 text-sm text-slate-500">{money.format(vehicle.price)} · {result.recommendation}</p></div><button aria-label={`Delete ${vehicle.name}`} onClick={() => deleteScenario(vehicle.id)} className="rounded-lg border border-rose-400/20 p-2 text-rose-300"><Trash2 size={16}/></button></div><div className="mt-4 grid grid-cols-2 gap-3"><Mini label="Lowest balance" value={money.format(result.scenario.lowestBalance)}/><Mini label="Best date" value={formatDate(result.recommendedPurchaseDate)}/></div><button onClick={() => loadVehicle(vehicle)} className="mt-4 w-full rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300">Load scenario</button></article>)}</div>}</section>
    <p className="mt-6 text-xs text-slate-500">Planning estimate only. Confirm lender, dealer, insurance, registration, and operating-cost figures before purchasing.</p>
  </div></main>;
}

function mapVehicle(row: Record<string, unknown>): SavedVehicle { const purchaseDate = String(row.purchase_date ?? inDays(30)); return { id: String(row.id), name: String(row.name), price: Number(row.price), downPayment: Number(row.down_payment), tradeIn: Number(row.trade_in), taxRate: Number(row.tax_rate), fees: Number(row.fees), apr: Number(row.apr), termMonths: Number(row.term_months), insuranceMonthly: Number(row.insurance_monthly), fuelMonthly: Number(row.fuel_monthly), maintenanceMonthly: Number(row.maintenance_monthly), registrationAnnual: Number(row.registration_annual ?? 250), purchaseDate, firstPaymentDate: String(row.first_payment_date ?? addDaysLocal(purchaseDate, 30)), preferredPaymentDay: Number(row.preferred_payment_day) === 31 ? 'last' : (Number(row.preferred_payment_day ?? 15) as VehiclePaymentDay) }; }
function addDaysLocal(value: string, days: number) { return new Date(new Date(`${value}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10); }
function NumberField({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (value: number) => void; step?: string }) { return <label className="text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="number" min="0" step={step} value={value} onChange={event => onChange(Number(event.target.value))}/></label>; }
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="date" value={value} onChange={event => onChange(event.target.value)}/></label>; }
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex items-center justify-between text-sm text-slate-400"><span>{label}</span><ShieldCheck size={17}/></div><p className="mt-3 text-xl font-semibold capitalize">{value}</p>{detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}</div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function AnalysisCard({ title, headline, detail, footer }: { title: string; headline: string; detail: string; footer: string }) { return <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><p className="text-sm text-cyan-300">{title}</p><h2 className="mt-3 text-2xl font-semibold">{headline}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{detail}</p><p className="mt-4 border-t border-slate-800 pt-4 text-xs text-slate-500">{footer}</p></article>; }
function CashFlowChart({ points }: { points: CashFlowChartPoint[] }) { const width = 900, height = 220, min = Math.min(...points.map(point => point.balance), ...points.map(point => point.protectedCushion)), max = Math.max(...points.map(point => point.balance), ...points.map(point => point.protectedCushion), min + 1), y = (value: number) => height - ((value - min) / (max - min)) * height, path = points.map((point, index) => `${index ? 'L' : 'M'} ${(index / Math.max(1, points.length - 1)) * width} ${y(point.balance)}`).join(' '), cushion = y(points[0]?.protectedCushion ?? 0); return <div className="mt-6 overflow-x-auto"><svg role="img" aria-label="Projected checking balance over time" viewBox={`0 0 ${width} ${height}`} className="min-w-[700px]"><line x1="0" x2={width} y1={cushion} y2={cushion} stroke="rgb(251 191 36)" strokeDasharray="8 6"/><path d={path} fill="none" stroke="rgb(34 211 238)" strokeWidth="4" vectorEffect="non-scaling-stroke"/></svg></div>; }
function paymentDay(value: VehiclePaymentDay) { return value === 'last' ? 'Last day' : `${value}${value === 1 ? 'st' : value === 22 ? 'nd' : 'th'}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
function signedMoney(value: number) { return `${value >= 0 ? '+' : '−'}${money.format(Math.abs(value))}`; }
