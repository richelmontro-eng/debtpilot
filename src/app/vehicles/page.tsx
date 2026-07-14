'use client';

import { useEffect, useMemo, useState } from 'react';
import { Car, CircleDollarSign, Gauge, Save, ShieldCheck, Trash2, TrendingDown } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { evaluateVehicle, VehicleScenario } from '@/lib/vehicle';

type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
type SavedVehicle = VehicleScenario & { id: string; name: string };

const periods: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const initialScenario: VehicleScenario = {
  price: 45000,
  downPayment: 5000,
  tradeIn: 0,
  taxRate: 0,
  fees: 0,
  apr: 6.5,
  termMonths: 72,
  insuranceMonthly: 200,
  fuelMonthly: 250,
  maintenanceMonthly: 100,
};

export default function VehiclePlannerPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('Vehicle scenario');
  const [scenario, setScenario] = useState<VehicleScenario>(initialScenario);
  const [savedVehicles, setSavedVehicles] = useState<SavedVehicle[]>([]);
  const [finances, setFinances] = useState({
    monthlyIncome: 0,
    monthlyBills: 0,
    monthlyDebtMinimums: 0,
    monthlyLiving: 0,
    checking: 0,
    savings: 0,
    checkingCushion: 0,
  });

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setMessage('DebtPilot is temporarily unavailable. Please try again later.');
      setLoading(false);
      return;
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.assign('/login');
        return;
      }
      setUserId(user.id);

      const [
        { data: profile, error: profileError },
        { data: bills, error: billError },
        { data: debts, error: debtError },
        { data: vehicles, error: vehicleError },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('bills').select('amount, frequency').eq('user_id', user.id),
        supabase.from('debts').select('minimum_payment').eq('user_id', user.id),
        supabase.from('vehicle_scenarios').select('*').eq('user_id', user.id).order('created_at'),
      ]);

      const error = profileError || billError || debtError || vehicleError;
      if (error) setMessage('We couldn’t load your vehicle scenarios. Please try again.');

      const frequency = (profile?.pay_frequency ?? 'weekly') as PayFrequency;
      const checksPerYear = periods[frequency] ?? 52;
      const monthlyIncome = Number(profile?.weekly_take_home ?? 0) * checksPerYear / 12;
      const monthlyLiving = Number(profile?.weekly_living_reserve ?? 0) * checksPerYear / 12;
      const monthlyBills = (bills ?? []).reduce((sum, bill) => {
        const amount = Number(bill.amount ?? 0);
        if (bill.frequency === 'weekly') return sum + amount * 52 / 12;
        if (bill.frequency === 'quarterly') return sum + amount / 3;
        if (bill.frequency === 'annual') return sum + amount / 12;
        return sum + amount;
      }, 0);
      const monthlyDebtMinimums = (debts ?? []).reduce((sum, debt) => sum + Number(debt.minimum_payment ?? 0), 0);

      setFinances({
        monthlyIncome,
        monthlyBills,
        monthlyDebtMinimums,
        monthlyLiving,
        checking: Number(profile?.checking_balance ?? 0),
        savings: Number(profile?.savings_balance ?? 0),
        checkingCushion: Number(profile?.checking_cushion ?? 0),
      });
      setSavedVehicles((vehicles ?? []).map(row => ({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        downPayment: Number(row.down_payment),
        tradeIn: Number(row.trade_in),
        taxRate: Number(row.tax_rate),
        fees: Number(row.fees),
        apr: Number(row.apr),
        termMonths: Number(row.term_months),
        insuranceMonthly: Number(row.insurance_monthly),
        fuelMonthly: Number(row.fuel_monthly),
        maintenanceMonthly: Number(row.maintenance_monthly),
      })));
      setLoading(false);
    })();
  }, []);

  const result = useMemo(() => evaluateVehicle(scenario, finances), [scenario, finances]);
  const comparisons = useMemo(
    () => savedVehicles.map(vehicle => ({ vehicle, result: evaluateVehicle(vehicle, finances) })),
    [savedVehicles, finances],
  );

  function update(field: keyof VehicleScenario, value: number) {
    setScenario(current => ({ ...current, [field]: Number.isFinite(value) ? value : 0 }));
  }

  function loadVehicle(vehicle: SavedVehicle) {
    setName(vehicle.name);
    setScenario({
      price: vehicle.price,
      downPayment: vehicle.downPayment,
      tradeIn: vehicle.tradeIn,
      taxRate: vehicle.taxRate,
      fees: vehicle.fees,
      apr: vehicle.apr,
      termMonths: vehicle.termMonths,
      insuranceMonthly: vehicle.insuranceMonthly,
      fuelMonthly: vehicle.fuelMonthly,
      maintenanceMonthly: vehicle.maintenanceMonthly,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveScenario() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    setSaving(true);
    setMessage('Saving vehicle scenario…');
    const { data, error } = await supabase.from('vehicle_scenarios').insert({
      user_id: userId,
      name: name.trim() || 'Vehicle scenario',
      price: scenario.price,
      down_payment: scenario.downPayment,
      trade_in: scenario.tradeIn,
      tax_rate: scenario.taxRate,
      fees: scenario.fees,
      apr: scenario.apr,
      term_months: scenario.termMonths,
      insurance_monthly: scenario.insuranceMonthly,
      fuel_monthly: scenario.fuelMonthly,
      maintenance_monthly: scenario.maintenanceMonthly,
    }).select('*').single();

    if (error) {
      setMessage('We couldn’t save this vehicle scenario. Please try again.');
    } else if (data) {
      setSavedVehicles(items => [...items, {
        id: data.id,
        name: data.name,
        price: Number(data.price),
        downPayment: Number(data.down_payment),
        tradeIn: Number(data.trade_in),
        taxRate: Number(data.tax_rate),
        fees: Number(data.fees),
        apr: Number(data.apr),
        termMonths: Number(data.term_months),
        insuranceMonthly: Number(data.insurance_monthly),
        fuelMonthly: Number(data.fuel_monthly),
        maintenanceMonthly: Number(data.maintenance_monthly),
      }]);
      setMessage('Vehicle scenario saved successfully.');
    }
    setSaving(false);
  }

  async function deleteScenario(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from('vehicle_scenarios').delete().eq('id', id).eq('user_id', userId);
    if (error) {
      setMessage('We couldn’t delete this vehicle scenario. Please try again.');
      return;
    }
    setSavedVehicles(items => items.filter(item => item.id !== id));
    setMessage('Vehicle scenario deleted.');
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Evaluating your vehicle options…</main>;
  }

  const recommendationStyle = result.recommendation === 'READY'
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
    : result.recommendation === 'CAUTION'
      ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
      : 'border-rose-400/30 bg-rose-400/10 text-rose-200';

  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Car size={16}/> Vehicle planner</div>
        <h1 className="text-4xl font-semibold">Compare the full financial impact before you buy.</h1>
        <p className="mt-3 max-w-3xl text-slate-400">Save multiple vehicles and compare the loan, total ownership cost, cash-flow effect, and readiness score using your actual DebtPilot profile.</p>
      </header>

      {message && <p role="status" className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<CircleDollarSign/>} label="Loan payment" value={money.format(result.paymentMonthly) + '/mo'}/>
        <Metric icon={<Car/>} label="Total ownership" value={money.format(result.ownershipMonthly) + '/mo'}/>
        <Metric icon={<TrendingDown/>} label="Weekly impact" value={money.format(result.ownershipWeekly)}/>
        <Metric icon={<Gauge/>} label="Readiness" value={`${result.readiness}/100`} accent/>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-2xl font-semibold">Vehicle scenario</h2>
            <button onClick={saveScenario} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"><Save size={17}/>{saving ? 'Saving…' : 'Save scenario'}</button>
          </div>
          <label className="mt-5 block text-xs text-slate-400">Scenario name<input className="field mt-1 w-full" value={name} onChange={event => setName(event.target.value)}/></label>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberField label="Purchase price" value={scenario.price} onChange={value => update('price', value)}/>
            <NumberField label="Down payment" value={scenario.downPayment} onChange={value => update('downPayment', value)}/>
            <NumberField label="Trade-in value" value={scenario.tradeIn} onChange={value => update('tradeIn', value)}/>
            <NumberField label="Sales tax %" value={scenario.taxRate} onChange={value => update('taxRate', value)} step="0.01"/>
            <NumberField label="Fees paid or financed" value={scenario.fees} onChange={value => update('fees', value)}/>
            <NumberField label="APR %" value={scenario.apr} onChange={value => update('apr', value)} step="0.01"/>
            <NumberField label="Loan term in months" value={scenario.termMonths} onChange={value => update('termMonths', value)}/>
            <NumberField label="Insurance per month" value={scenario.insuranceMonthly} onChange={value => update('insuranceMonthly', value)}/>
            <NumberField label="Fuel per month" value={scenario.fuelMonthly} onChange={value => update('fuelMonthly', value)}/>
            <NumberField label="Maintenance per month" value={scenario.maintenanceMonthly} onChange={value => update('maintenanceMonthly', value)}/>
          </div>
        </div>

        <div className="space-y-6">
          <div className={`rounded-3xl border p-6 ${recommendationStyle}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]">Recommendation</p>
            <h2 className="mt-3 text-4xl font-semibold">{result.recommendation}</h2>
            <p className="mt-2 text-lg">{name}</p>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-950/40"><div className="h-full bg-current" style={{ width: `${result.readiness}%` }}/></div>
            <p className="mt-3 text-sm">Readiness score: {result.readiness}/100</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-2xl font-semibold">Why</h2>
            <div className="mt-5 space-y-3">{result.reasons.map(reason => <div key={reason} className="flex gap-3 text-sm leading-6 text-slate-300"><ShieldCheck className="mt-0.5 shrink-0 text-cyan-300" size={18}/><p>{reason}</p></div>)}</div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Purchase details</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Detail label="Amount financed" value={money.format(result.amountFinanced)}/>
            <Detail label="Cash due at purchase" value={money.format(result.cashDueAtPurchase)}/>
            <Detail label="Estimated loan interest" value={money.format(result.totalLoanInterest)}/>
            <Detail label="Emergency reserve after purchase" value={`${result.emergencyMonthsAfterPurchase.toFixed(1)} months`}/>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Cash-flow effect</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Detail label="Surplus before vehicle" value={money.format(result.monthlySurplusBefore) + '/mo'}/>
            <Detail label="Surplus after vehicle" value={money.format(result.monthlySurplusAfter) + '/mo'}/>
            <Detail label="Existing monthly bills" value={money.format(finances.monthlyBills)}/>
            <Detail label="Existing debt minimums" value={money.format(finances.monthlyDebtMinimums)}/>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Saved vehicle comparison</h2>
        <p className="mt-2 text-sm text-slate-400">Save at least two scenarios to compare monthly cost, cash required, surplus after purchase, and readiness.</p>
        {comparisons.length === 0 ? <p className="mt-5 rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">No saved vehicles yet. Enter a vehicle scenario above and save it to compare monthly cost and affordability.</p> : <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{comparisons.map(({ vehicle, result: comparison }) => <article key={vehicle.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{vehicle.name}</h3><p className="mt-1 text-sm text-slate-500">{money.format(vehicle.price)} • {vehicle.termMonths} months at {vehicle.apr.toFixed(2)}%</p></div><button aria-label={`Delete ${vehicle.name}`} onClick={() => deleteScenario(vehicle.id)} className="rounded-lg border border-rose-400/20 p-2 text-rose-300"><Trash2 size={16}/></button></div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><Mini label="Loan" value={`${money.format(comparison.paymentMonthly)}/mo`}/><Mini label="Ownership" value={`${money.format(comparison.ownershipMonthly)}/mo`}/><Mini label="Cash needed" value={money.format(comparison.cashDueAtPurchase)}/><Mini label="Surplus after" value={`${money.format(comparison.monthlySurplusAfter)}/mo`}/></div>
          <div className="mt-4 flex items-center justify-between"><span className="text-sm text-slate-400">{comparison.recommendation}</span><span className="text-2xl font-semibold text-cyan-300">{comparison.readiness}</span></div>
          <button onClick={() => loadVehicle(vehicle)} className="mt-4 w-full rounded-xl border border-cyan-400/30 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-400/10">Load scenario</button>
        </article>)}</div>}
      </section>

      <p className="mt-6 text-xs leading-5 text-slate-500">Planning estimate only. Taxes, fees, insurance, lender calculations, fuel use, repairs, and actual financing terms can differ. Enter exact dealer and lender figures before making a purchase decision.</p>
    </div>
  </main>;
}

function NumberField({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (value: number) => void; step?: string }) {
  return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="number" min="0" step={step} value={value} onChange={event => onChange(Number(event.target.value))}/></label>;
}

function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}
