'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, TrendingDown, WalletCards } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { buildForecast, ForecastBill, ForecastFrequency } from '@/lib/forecast';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

type Profile = { checking: number; cushion: number; pay: number; frequency: ForecastFrequency };

export default function ForecastPage() {
  const [profile, setProfile] = useState<Profile>({ checking: 0, cushion: 0, pay: 0, frequency: 'weekly' });
  const [bills, setBills] = useState<ForecastBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('DebtPilot is temporarily unavailable. Please try again later.'); setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      const [{ data: savedProfile, error: profileError }, { data: billRows, error: billError }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('bills').select('*').eq('user_id', user.id).order('due_day'),
      ]);
      const error = profileError || billError;
      if (error) setMessage('We couldn’t load your forecast. Please try again.');
      const frequency = ['weekly', 'biweekly', 'semimonthly', 'monthly'].includes(savedProfile?.pay_frequency) ? savedProfile.pay_frequency as ForecastFrequency : 'weekly';
      setProfile({
        checking: Number(savedProfile?.checking_balance ?? 0),
        cushion: Number(savedProfile?.checking_cushion ?? 0),
        pay: Number(savedProfile?.weekly_take_home ?? 0),
        frequency,
      });
      setBills((billRows ?? []).map(row => ({ id: row.id, name: row.name, amount: Number(row.amount), dueDay: Number(row.due_day ?? 1), frequency: row.frequency ?? 'monthly' })));
      setLoading(false);
    })();
  }, []);

  const forecast = useMemo(() => buildForecast({ startingBalance: profile.checking, payPerCheck: profile.pay, payFrequency: profile.frequency, bills, days: 90 }), [profile, bills]);
  const belowCushion = forecast.events.find(event => event.balance < profile.cushion);
  const negative = forecast.events.find(event => event.balance < 0);
  const chartEvents = forecast.events.filter((_, index) => index % Math.max(1, Math.floor(forecast.events.length / 18)) === 0);
  const chartPoints = [{ balance: profile.checking }, ...chartEvents].map(item => item.balance);
  const min = Math.min(...chartPoints, 0);
  const max = Math.max(...chartPoints, 1);
  const range = Math.max(1, max - min);
  const points = chartPoints.map((balance, index) => `${(index / Math.max(1, chartPoints.length - 1)) * 100},${100 - ((balance - min) / range) * 100}`).join(' ');

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Building your forecast…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8">
      <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">90-day forecast</p>
      <h1 className="mt-2 text-4xl font-semibold">See your cash balance before it happens.</h1>
      <p className="mt-3 max-w-3xl text-slate-400">This forecast uses your current checking balance, saved paycheck schedule, and recurring bills. It does not yet include one-time spending or manual payment confirmations.</p>
    </header>

    {message && <p className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<WalletCards/>} label="Starting checking" value={money.format(profile.checking)}/>
      <Metric icon={<CalendarRange/>} label="90-day ending balance" value={money.format(forecast.endingBalance)}/>
      <Metric icon={<TrendingDown/>} label="Lowest projected balance" value={money.format(forecast.lowestBalance)} accent={forecast.lowestBalance < profile.cushion}/>
      <Metric icon={<AlertTriangle/>} label="Risk status" value={negative ? 'Overdraft risk' : belowCushion ? 'Below cushion' : 'On track'} accent={Boolean(negative || belowCushion)}/>
    </section>

    {(negative || belowCushion) && <section className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5">
      <div className="flex gap-3"><AlertTriangle className="shrink-0 text-amber-300"/><div><h2 className="font-semibold text-amber-200">Forecast warning</h2><p className="mt-2 text-sm leading-6 text-amber-100/80">{negative ? `Your checking balance is projected below $0 around ${dateLabel.format(negative.date)}.` : `Your checking balance is projected below your ${money.format(profile.cushion)} cushion around ${dateLabel.format(belowCushion!.date)}.`} Reduce optional payments or update your saved income and bills before relying on this plan.</p></div></div>
    </section>}

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Projected checking balance</h2>
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <svg viewBox="0 0 100 100" className="h-64 w-full overflow-visible" role="img" aria-label="Projected checking balance graph">
            <line x1="0" y1="100" x2="100" y2="100" stroke="currentColor" className="text-slate-700" strokeWidth="0.6"/>
            <polyline points={points} fill="none" stroke="currentColor" className="text-cyan-300" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
          </svg>
          <div className="mt-3 flex justify-between text-xs text-slate-500"><span>Today</span><span>90 days</span></div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold">Forecast assumptions</h2>
        <div className="mt-5 space-y-4 text-sm">
          <Row label="Pay per check" value={money.format(profile.pay)}/>
          <Row label="Pay frequency" value={profile.frequency.replace('biweekly', 'Every 2 weeks').replace('semimonthly', 'Twice monthly')}/>
          <Row label="Saved recurring bills" value={`${bills.length}`}/>
          <Row label="Protected cushion" value={money.format(profile.cushion)}/>
        </div>
      </div>
    </section>

    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-semibold">Upcoming cash-flow timeline</h2>
      {forecast.events.length === 0 ? <p className="mt-5 text-slate-400">Add a paycheck and recurring bills on the dashboard to generate a forecast.</p> : <div className="mt-5 space-y-3">{forecast.events.slice(0, 30).map((event, index) => <div key={`${event.date.toISOString()}-${event.label}-${index}`} className="grid gap-2 rounded-2xl border border-slate-800 p-4 sm:grid-cols-[100px_1fr_auto_auto] sm:items-center">
        <p className="text-sm text-slate-500">{dateLabel.format(event.date)}</p>
        <p className="font-medium">{event.label}</p>
        <p className={event.amount >= 0 ? 'font-semibold text-emerald-300' : 'font-semibold text-rose-300'}>{event.amount >= 0 ? '+' : ''}{money.format(event.amount)}</p>
        <p className="text-sm text-slate-400">Balance {money.format(event.balance)}</p>
      </div>)}</div>}
    </section>

    <p className="mt-6 text-xs leading-5 text-slate-500">Forecast estimates depend on the accuracy of saved pay and bill data. Actual transaction timing may differ.</p>
  </div></main>;
}

function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 ${accent ? 'border-amber-400/30 bg-amber-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between border-b border-slate-800 pb-3"><span className="text-slate-500">{label}</span><span className="font-medium capitalize">{value}</span></div>; }
