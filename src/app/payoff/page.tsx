'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, CircleDollarSign, TrendingDown } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { PayoffDebt, simulatePayoff } from '@/lib/payoff';
import { analyzePromotion, promotionStatusLabel } from '@/lib/promotions';
import { mapDebtRow } from '@/lib/debt-persistence';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function PayoffPage() {
  const [debts, setDebts] = useState<PayoffDebt[]>([]);
  const [weeklyExtra, setWeeklyExtra] = useState(0);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

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

      const [{ data: profile }, { data: debtRows, error }] = await Promise.all([
        supabase.from('profiles').select('preferred_strategy').eq('user_id', user.id).maybeSingle(),
        supabase.from('debts').select('*').eq('user_id', user.id).order('created_at'),
      ]);

      if (error) setMessage(`Load failed: ${error.message}`);
      setStrategy(profile?.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche');
      setDebts((debtRows ?? []).map(mapDebtRow));
      setLoading(false);
    })();
  }, []);

  const monthlyExtra = weeklyExtra * 52 / 12;
  const withExtra = useMemo(() => simulatePayoff(debts, monthlyExtra, strategy), [debts, monthlyExtra, strategy]);
  const minimumOnly = useMemo(() => simulatePayoff(debts, 0, strategy), [debts, strategy]);
  const monthsSaved = minimumOnly.paidOff && withExtra.paidOff ? Math.max(0, minimumOnly.months - withExtra.months) : 0;
  const interestSaved = minimumOnly.paidOff && withExtra.paidOff ? Math.max(0, minimumOnly.totalInterest - withExtra.totalInterest) : 0;
  const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const promotions = debts.filter(debt => debt.promotionType && debt.promotionType !== 'none').map(debt => ({ debt, analysis: analyzePromotion(debt, { payPeriodsPerYear: 52, plannedMonthlyPayment: debt.minimum + monthlyExtra }) }));

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Calculating payoff plan…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100">
    <div className="mx-auto max-w-6xl px-5 py-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-cyan-300"><ArrowLeft size={16}/>Back to dashboard</Link>

      <header className="mt-6 mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Debt payoff projection</p>
        <h1 className="mt-2 text-4xl font-semibold">See how fast extra weekly payments change your future.</h1>
        <p className="mt-3 max-w-3xl text-slate-400">This simulator uses your saved balances, APRs, minimum payments, and selected strategy. It rolls freed-up payments into the next debt automatically.</p>
      </header>

      {message && <p className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<CircleDollarSign/>} label="Total debt" value={money.format(totalDebt)}/>
        <Metric icon={<CalendarClock/>} label="Projected debt-free" value={withExtra.debtFreeDate ?? 'Not projected'}/>
        <Metric icon={<TrendingDown/>} label="Months saved" value={`${monthsSaved}`}/>
        <Metric icon={<CircleDollarSign/>} label="Interest saved" value={money.format(interestSaved)} accent/>
      </section>

      {promotions.length > 0 && <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold">Promotional interest status</h2><div className="mt-5 grid gap-4 md:grid-cols-2">{promotions.map(({ debt, analysis }) => <article key={debt.id} className={`rounded-2xl border p-5 ${analysis.status === 'on_track' ? 'border-emerald-400/25 bg-emerald-400/10' : analysis.status === 'at_risk' || analysis.status === 'expired' ? 'border-rose-400/25 bg-rose-400/10' : 'border-amber-400/25 bg-amber-400/10'}`}><p className="text-sm text-slate-400">{debt.name}</p><p className="mt-2 text-2xl font-semibold">{promotionStatusLabel(analysis.status)}</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-slate-500">Days remaining</p><p className="mt-1 font-medium">{analysis.daysRemaining}</p></div><div><p className="text-slate-500">Payments remaining</p><p className="mt-1 font-medium">{analysis.paymentsRemainingBeforeDeadline}</p></div><div><p className="text-slate-500">Required monthly</p><p className="mt-1 font-medium">{money.format(analysis.requiredMonthlyPayment)}</p></div><div><p className="text-slate-500">Required weekly</p><p className="mt-1 font-medium">{money.format(analysis.requiredPerPaycheck)}</p></div></div>{analysis.estimatedInterestAtRisk > 0 && <p className="mt-4 text-sm text-rose-200">Approximately {money.format(analysis.estimatedInterestAtRisk)} in deferred interest is at risk.</p>}</article>)}</div></section>}

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Test an extra payment</h2>
          <label className="mt-6 block text-sm text-slate-300">Extra payment each week
            <input className="field mt-2 w-full" type="number" min="0" step="10" value={weeklyExtra} onChange={event => setWeeklyExtra(Number(event.target.value))}/>
          </label>
          <label className="mt-5 block text-sm text-slate-300">Strategy
            <select className="field mt-2 w-full" value={strategy} onChange={event => setStrategy(event.target.value as 'avalanche' | 'snowball')}>
              <option value="avalanche">Avalanche — highest APR first</option>
              <option value="snowball">Snowball — smallest balance first</option>
            </select>
          </label>
          <div className="mt-6 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
            <p className="text-xs uppercase tracking-widest text-cyan-300">Monthly equivalent</p>
            <p className="mt-1 text-3xl font-semibold">{money.format(monthlyExtra)}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-2xl font-semibold">Plan comparison</h2>
          {debts.length === 0 ? <p className="mt-5 text-slate-400">Add debts on the dashboard first.</p> : <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Plan title="Minimums only" result={minimumOnly}/>
            <Plan title={`With ${money.format(weeklyExtra)}/week extra`} result={withExtra} highlight/>
          </div>}
          {withExtra.paidOff && minimumOnly.paidOff && <p className="mt-5 text-sm leading-6 text-slate-400">Adding {money.format(weeklyExtra)} per week is projected to save about <strong className="text-slate-100">{monthsSaved} month(s)</strong> and <strong className="text-slate-100">{money.format(interestSaved)}</strong> in interest.</p>}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Saved debts</h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="text-slate-500"><tr><th className="pb-3">Account</th><th>Balance</th><th>APR</th><th>Minimum</th></tr></thead>
            <tbody>{debts.map(debt => <tr key={debt.id} className="border-t border-slate-800"><td className="py-4 font-medium">{debt.name}</td><td>{money.format(debt.balance)}</td><td>{debt.apr.toFixed(2)}%</td><td>{money.format(debt.minimum)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-xs leading-5 text-slate-500">Projection only. Credit-card interest can accrue daily, minimum payments can change, and lenders may use different calculation methods.</p>
    </div>
  </main>;
}

function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>;
}

function Plan({ title, result, highlight = false }: { title: string; result: ReturnType<typeof simulatePayoff>; highlight?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${highlight ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-700 bg-slate-950/60'}`}>
    <p className="text-sm text-slate-400">{title}</p>
    <p className="mt-3 text-2xl font-semibold">{result.debtFreeDate ?? 'Payment too low'}</p>
    <p className="mt-3 text-sm text-slate-400">{result.paidOff ? `${result.months} months • ${money.format(result.totalInterest)} interest` : 'The planned payment does not appear to reduce the balance.'}</p>
  </div>;
}
