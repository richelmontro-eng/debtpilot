'use client';

import { useEffect, useMemo, useState } from 'react';
import { Beaker, CalendarClock, CircleDollarSign, RotateCcw, TrendingDown, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { PayoffDebt, simulatePayoff } from '@/lib/payoff';

type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

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

export default function WhatIfPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [frequency, setFrequency] = useState<PayFrequency>('weekly');
  const [payPerCheck, setPayPerCheck] = useState(0);
  const [checking, setChecking] = useState(0);
  const [monthlyBills, setMonthlyBills] = useState(0);
  const [monthlyLiving, setMonthlyLiving] = useState(0);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [debts, setDebts] = useState<PayoffDebt[]>([]);

  const [incomeChangePerCheck, setIncomeChangePerCheck] = useState(0);
  const [newMonthlyBill, setNewMonthlyBill] = useState(0);
  const [oneTimeCash, setOneTimeCash] = useState(0);
  const [extraDebtPerCheck, setExtraDebtPerCheck] = useState(0);
  const [missedPaychecks, setMissedPaychecks] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setMessage('Supabase is not configured.');
      setLoading(false);
      return;
    }

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.assign('/login');
        return;
      }

      const [{ data: profile, error: profileError }, { data: billRows, error: billError }, { data: debtRows, error: debtError }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('bills').select('amount, frequency').eq('user_id', user.id),
        supabase.from('debts').select('*').eq('user_id', user.id),
      ]);

      const error = profileError || billError || debtError;
      if (error) setMessage(`Load failed: ${error.message}`);

      const savedFrequency = (profile?.pay_frequency ?? 'weekly') as PayFrequency;
      const safeFrequency = periods[savedFrequency] ? savedFrequency : 'weekly';
      setFrequency(safeFrequency);
      setPayPerCheck(Number(profile?.weekly_take_home ?? 0));
      setChecking(Number(profile?.checking_balance ?? 0));
      setMonthlyLiving(Number(profile?.weekly_living_reserve ?? 0) * periods[safeFrequency] / 12);
      setStrategy(profile?.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche');
      setMonthlyBills((billRows ?? []).reduce((sum, bill) => {
        const amount = Number(bill.amount ?? 0);
        if (bill.frequency === 'weekly') return sum + amount * 52 / 12;
        if (bill.frequency === 'quarterly') return sum + amount / 3;
        if (bill.frequency === 'annual') return sum + amount / 12;
        return sum + amount;
      }, 0));
      setDebts((debtRows ?? []).map(row => ({
        id: row.id,
        name: row.name,
        balance: Number(row.balance),
        apr: Number(row.apr),
        minimum: Number(row.minimum_payment),
      })));
      setLoading(false);
    })();
  }, []);

  const checksPerYear = periods[frequency];
  const monthlyIncome = payPerCheck * checksPerYear / 12;
  const monthlyMinimums = debts.reduce((sum, debt) => sum + debt.minimum, 0);
  const baseMonthlySurplus = monthlyIncome - monthlyBills - monthlyLiving - monthlyMinimums;

  const scenario = useMemo(() => {
    const adjustedMonthlyIncome = (payPerCheck + incomeChangePerCheck) * checksPerYear / 12;
    const adjustedMonthlyBills = monthlyBills + newMonthlyBill;
    const adjustedMonthlySurplus = adjustedMonthlyIncome - adjustedMonthlyBills - monthlyLiving - monthlyMinimums - extraDebtPerCheck * checksPerYear / 12;
    const cashAfterOneTimeChanges = checking + oneTimeCash - missedPaychecks * payPerCheck;
    const basePayoff = simulatePayoff(debts, 0, strategy);
    const scenarioPayoff = simulatePayoff(debts, extraDebtPerCheck * checksPerYear / 12, strategy);
    const monthsSaved = basePayoff.paidOff && scenarioPayoff.paidOff ? Math.max(0, basePayoff.months - scenarioPayoff.months) : 0;
    const interestSaved = basePayoff.paidOff && scenarioPayoff.paidOff ? Math.max(0, basePayoff.totalInterest - scenarioPayoff.totalInterest) : 0;

    return {
      adjustedMonthlyIncome,
      adjustedMonthlyBills,
      adjustedMonthlySurplus,
      cashAfterOneTimeChanges,
      basePayoff,
      scenarioPayoff,
      monthsSaved,
      interestSaved,
    };
  }, [payPerCheck, incomeChangePerCheck, checksPerYear, monthlyBills, newMonthlyBill, monthlyLiving, monthlyMinimums, extraDebtPerCheck, checking, oneTimeCash, missedPaychecks, debts, strategy]);

  function resetScenario() {
    setIncomeChangePerCheck(0);
    setNewMonthlyBill(0);
    setOneTimeCash(0);
    setExtraDebtPerCheck(0);
    setMissedPaychecks(0);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading your scenario lab…</main>;

  const surplusDelta = scenario.adjustedMonthlySurplus - baseMonthlySurplus;

  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Beaker size={16}/> What-If Lab</div>
          <h1 className="text-4xl font-semibold">Test a financial change without changing your saved plan.</h1>
          <p className="mt-3 max-w-3xl text-slate-400">Adjust income, expenses, one-time cash, missed paychecks, or extra debt payments and see the impact immediately.</p>
        </div>
        <button type="button" onClick={resetScenario} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-300 hover:bg-slate-900"><RotateCcw size={17}/>Reset scenario</button>
      </header>

      {message && <p className="mb-6 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{message}</p>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<CircleDollarSign/>} label="Scenario monthly surplus" value={money.format(scenario.adjustedMonthlySurplus)} accent={scenario.adjustedMonthlySurplus >= 0}/>
        <Metric icon={<WalletCards/>} label="Cash after one-time changes" value={money.format(scenario.cashAfterOneTimeChanges)}/>
        <Metric icon={<CalendarClock/>} label="Debt-free projection" value={scenario.scenarioPayoff.debtFreeDate ?? 'Not projected'}/>
        <Metric icon={<TrendingDown/>} label="Interest saved" value={money.format(scenario.interestSaved)}/>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Scenario controls</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <NumberField label="Income change per paycheck" value={incomeChangePerCheck} onChange={setIncomeChangePerCheck} allowNegative/>
            <NumberField label="New monthly bill" value={newMonthlyBill} onChange={setNewMonthlyBill}/>
            <NumberField label="One-time cash received" value={oneTimeCash} onChange={setOneTimeCash} allowNegative/>
            <NumberField label="Extra debt payment per paycheck" value={extraDebtPerCheck} onChange={setExtraDebtPerCheck}/>
            <NumberField label="Missed paychecks" value={missedPaychecks} onChange={value => setMissedPaychecks(Math.max(0, Math.round(value)))}/>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-500">Nothing entered here is saved. Negative income changes and negative one-time cash can be used to model reduced hours or an unexpected expense.</p>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Before and after</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-slate-500"><tr><th className="pb-3">Metric</th><th>Current plan</th><th>Scenario</th><th>Change</th></tr></thead>
              <tbody>
                <CompareRow label="Monthly income" before={monthlyIncome} after={scenario.adjustedMonthlyIncome}/>
                <CompareRow label="Monthly bills" before={monthlyBills} after={scenario.adjustedMonthlyBills} inverse/>
                <CompareRow label="Monthly surplus" before={baseMonthlySurplus} after={scenario.adjustedMonthlySurplus}/>
                <tr className="border-t border-slate-800"><td className="py-4">Debt-free date</td><td>{scenario.basePayoff.debtFreeDate ?? 'Not projected'}</td><td>{scenario.scenarioPayoff.debtFreeDate ?? 'Not projected'}</td><td>{scenario.monthsSaved ? `${scenario.monthsSaved} months sooner` : 'No change'}</td></tr>
                <CompareRow label="Future interest" before={scenario.basePayoff.totalInterest} after={scenario.scenarioPayoff.totalInterest} inverse/>
              </tbody>
            </table>
          </div>
          <div className={`mt-6 rounded-2xl border p-5 ${surplusDelta >= 0 ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-amber-400/25 bg-amber-400/10'}`}>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Scenario summary</p>
            <p className="mt-2 text-xl font-semibold">Your monthly surplus changes by {money.format(surplusDelta)}.</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{scenario.monthsSaved > 0 ? `The extra debt payment is projected to make you debt-free ${scenario.monthsSaved} month(s) sooner and save about ${money.format(scenario.interestSaved)} in interest.` : 'Adjust the extra debt payment to see how it changes your payoff timeline.'}</p>
          </div>
        </div>
      </section>

      <p className="mt-6 text-xs leading-5 text-slate-500">Scenario estimates only. Actual balances, lender interest calculations, taxes, and variable expenses may differ.</p>
    </div>
  </main>;
}

function NumberField({ label, value, onChange, allowNegative = false }: { label: string; value: number; onChange: (value: number) => void; allowNegative?: boolean }) {
  return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="number" min={allowNegative ? undefined : 0} step="10" value={value} onChange={event => onChange(Number(event.target.value))}/></label>;
}

function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
}

function CompareRow({ label, before, after, inverse = false }: { label: string; before: number; after: number; inverse?: boolean }) {
  const delta = after - before;
  const favorable = inverse ? delta <= 0 : delta >= 0;
  return <tr className="border-t border-slate-800"><td className="py-4">{label}</td><td>{money.format(before)}</td><td>{money.format(after)}</td><td className={delta === 0 ? 'text-slate-500' : favorable ? 'text-emerald-300' : 'text-amber-300'}>{delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${money.format(delta)}`}</td></tr>;
}
