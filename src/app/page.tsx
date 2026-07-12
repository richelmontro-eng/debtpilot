'use client';

import { useMemo, useState } from 'react';
import { Car, CreditCard, Gauge, PiggyBank, WalletCards } from 'lucide-react';

type Debt = { id: number; name: string; balance: number; apr: number; minimum: number };
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function loanPayment(principal: number, apr: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const rate = apr / 100 / 12;
  return rate === 0 ? principal / months : principal * (rate * (1 + rate) ** months) / ((1 + rate) ** months - 1);
}

export default function Home() {
  const [weeklyPay, setWeeklyPay] = useState(1250);
  const [checking, setChecking] = useState(3000);
  const [savings] = useState(2500);
  const [weeklyLiving, setWeeklyLiving] = useState(250);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [debts, setDebts] = useState<Debt[]>([
    { id: 1, name: 'Capital One', balance: 4500, apr: 29.99, minimum: 145 },
    { id: 2, name: 'Personal Loan', balance: 7800, apr: 13.5, minimum: 260 },
    { id: 3, name: 'Auto Loan', balance: 18000, apr: 7.25, minimum: 425 },
  ]);
  const [carPrice, setCarPrice] = useState(48000);
  const [downPayment, setDownPayment] = useState(8000);
  const [carApr, setCarApr] = useState(6.5);
  const [term, setTerm] = useState(72);
  const [insurance, setInsurance] = useState(200);
  const [operating, setOperating] = useState(250);

  const minimums = debts.reduce((sum, debt) => sum + debt.minimum, 0);
  const totalDebt = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const weeklyMinimums = minimums / 4.33;
  const safeExtra = Math.max(0, weeklyPay - weeklyLiving - weeklyMinimums);
  const ranked = [...debts].sort((a, b) => strategy === 'avalanche' ? b.apr - a.apr : a.balance - b.balance);
  const target = ranked[0];

  const carPayment = loanPayment(Math.max(0, carPrice - downPayment), carApr, term);
  const ownershipMonthly = carPayment + insurance + operating;
  const ownershipWeekly = ownershipMonthly * 12 / 52;
  const extraAfterCar = Math.max(0, safeExtra - ownershipWeekly);
  const monthlyIncome = weeklyPay * 52 / 12;
  const paymentRatio = monthlyIncome ? (minimums + carPayment) / monthlyIncome : 1;
  const carScore = Math.max(0, Math.min(100, Math.round(100 - paymentRatio * 120 - Math.max(0, ownershipWeekly - safeExtra) / 8)));
  const health = useMemo(() => Math.max(0, Math.min(100, Math.round(45 + safeExtra / Math.max(1, weeklyPay) * 90 - minimums / Math.max(1, monthlyIncome) * 70))), [safeExtra, weeklyPay, minimums, monthlyIncome]);

  function updateDebt(id: number, field: keyof Debt, value: string) {
    setDebts(items => items.map(item => item.id === id ? { ...item, [field]: field === 'name' ? value : Number(value) } : item));
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><Gauge size={16}/> Financial command center</div>
            <h1 className="text-4xl font-semibold">DebtPilot</h1>
            <p className="mt-2 text-slate-400">Plan each weekly paycheck and test a vehicle before committing.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-3"><p className="text-xs uppercase tracking-widest text-slate-500">Financial health</p><p className="text-3xl font-semibold">{health}<span className="text-base text-slate-500">/100</span></p></div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<WalletCards/>} label="Checking" value={money.format(checking)}/>
          <Metric icon={<PiggyBank/>} label="Savings" value={money.format(savings)}/>
          <Metric icon={<CreditCard/>} label="Total debt" value={money.format(totalDebt)}/>
          <Metric icon={<Gauge/>} label="Safe extra this week" value={money.format(safeExtra)} accent/>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card title="This week's recommendation">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-2xl font-semibold">Pay {money.format(safeExtra)} toward <span className="text-cyan-300">{target?.name}</span></p>
              <select className="field" value={strategy} onChange={e => setStrategy(e.target.value as 'avalanche' | 'snowball')}><option value="avalanche">Avalanche</option><option value="snowball">Snowball</option></select>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <NumberField label="Weekly take-home" value={weeklyPay} onChange={setWeeklyPay}/>
              <NumberField label="Weekly living reserve" value={weeklyLiving} onChange={setWeeklyLiving}/>
              <NumberField label="Checking balance" value={checking} onChange={setChecking}/>
            </div>
          </Card>

          <Card title="Can I afford this car?" icon={<Car className="text-cyan-300"/>}>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Vehicle price" value={carPrice} onChange={setCarPrice}/>
              <NumberField label="Down payment" value={downPayment} onChange={setDownPayment}/>
              <NumberField label="APR %" value={carApr} onChange={setCarApr} step="0.1"/>
              <NumberField label="Term (months)" value={term} onChange={setTerm}/>
              <NumberField label="Insurance / month" value={insurance} onChange={setInsurance}/>
              <NumberField label="Fuel + maintenance" value={operating} onChange={setOperating}/>
            </div>
            <div className="mt-5 grid gap-3 rounded-2xl border border-slate-700 bg-slate-950/70 p-4 sm:grid-cols-4">
              <Stat label="Payment" value={`${money.format(carPayment)}/mo`}/>
              <Stat label="Ownership" value={`${money.format(ownershipMonthly)}/mo`}/>
              <Stat label="Debt extra after car" value={`${money.format(extraAfterCar)}/wk`}/>
              <Stat label="Affordability score" value={`${carScore}/100`}/>
            </div>
          </Card>
        </section>

        <section className="mt-6"><Card title="Debt accounts">
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-slate-500"><tr><th className="pb-3">Account</th><th>Balance</th><th>APR</th><th>Minimum</th><th>Plan</th></tr></thead><tbody>{debts.map(debt => <tr key={debt.id} className="border-t border-slate-800"><td className="py-3"><input className="field" value={debt.name} onChange={e => updateDebt(debt.id, 'name', e.target.value)}/></td><td><input className="field w-28" type="number" value={debt.balance} onChange={e => updateDebt(debt.id, 'balance', e.target.value)}/></td><td><input className="field w-24" type="number" value={debt.apr} onChange={e => updateDebt(debt.id, 'apr', e.target.value)}/></td><td><input className="field w-24" type="number" value={debt.minimum} onChange={e => updateDebt(debt.id, 'minimum', e.target.value)}/></td><td className="font-medium text-cyan-300">{target?.id === debt.id ? 'Pay extra here' : 'Minimum only'}</td></tr>)}</tbody></table></div>
        </Card></section>
        <p className="mt-6 text-xs leading-5 text-slate-500">Planning estimates only. Taxes, fees, insurance, maintenance, lender calculations and statement timing may differ. This first release uses editable sample data; Supabase persistence is the next milestone.</p>
      </div>
    </main>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) { return <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><div className="mb-5 flex items-center gap-3">{icon}<h2 className="text-2xl font-semibold">{title}</h2></div>{children}</div>; }
function Metric({ icon, label, value, accent = false }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 ${accent ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-slate-800 bg-slate-900'}`}><div className="flex items-center justify-between text-slate-400"><span>{label}</span>{icon}</div><p className="mt-3 text-2xl font-semibold">{value}</p></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
function NumberField({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (value: number) => void; step?: string }) { return <label className="block text-xs text-slate-400">{label}<input className="field mt-1 w-full" type="number" step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>; }
