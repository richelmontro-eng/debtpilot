'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, CircleDollarSign, RotateCcw, Save, ShieldAlert, ShoppingBag, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { evaluatePurchase, type PurchaseFinancialState, type PurchaseReport, type PurchaseScenario } from '@/lib/before-you-buy';
import { mapDebtRow } from '@/lib/debt-persistence';

type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
type SavedScenario = { id: string; savedAt: string; scenario: PurchaseScenario; decision: PurchaseReport['decision'] };

const periods: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const initialScenario = (): PurchaseScenario => ({ itemName: '', purchasePrice: 0, method: 'cash', downPayment: 0, monthlyPayment: 0, interestRate: 0, loanLength: 36, purchaseDate: new Date().toISOString().slice(0, 10) });

export default function BeforeYouBuyPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [scenario, setScenario] = useState<PurchaseScenario>(initialScenario);
  const [finances, setFinances] = useState<PurchaseFinancialState | null>(null);
  const [report, setReport] = useState<PurchaseReport | null>(null);
  const [saved, setSaved] = useState<SavedScenario[]>([]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('Your financial data is temporarily unavailable. Please try again later.'); setLoading(false); return; }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      setUserId(user.id);
      const [{ data: profile, error: profileError }, { data: bills, error: billError }, { data: debts, error: debtError }, { data: goals, error: goalError }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('bills').select('amount,frequency').eq('user_id', user.id),
        supabase.from('debts').select('*').eq('user_id', user.id),
        supabase.from('goals').select('*').eq('user_id', user.id),
      ]);
      if (profileError || billError || debtError || goalError) setMessage('Some saved information could not be loaded. The report may be incomplete; refresh to try again.');
      const frequency = (profile?.pay_frequency ?? 'weekly') as PayFrequency;
      const periodsPerYear = periods[frequency] ?? 52;
      const monthlyBills = (bills ?? []).reduce((sum, bill) => {
        const amount = Number(bill.amount ?? 0);
        if (bill.frequency === 'weekly') return sum + amount * 52 / 12;
        if (bill.frequency === 'quarterly') return sum + amount / 3;
        if (bill.frequency === 'annual') return sum + amount / 12;
        return sum + amount;
      }, 0);
      setFinances({
        payPerCheck: Number(profile?.weekly_take_home ?? 0), periodsPerYear,
        checking: Number(profile?.checking_balance ?? 0), savings: Number(profile?.savings_balance ?? 0),
        checkingCushion: Number(profile?.checking_cushion ?? 0), livingPerCheck: Number(profile?.weekly_living_reserve ?? 0),
        monthlyBills, strategy: profile?.preferred_strategy === 'snowball' ? 'snowball' : 'avalanche',
        debts: (debts ?? []).map(mapDebtRow),
        goals: (goals ?? []).map(goal => ({ id: goal.id, name: goal.name, goalType: goal.goal_type, targetAmount: Number(goal.target_amount), currentAmount: Number(goal.current_amount), priority: Number(goal.priority) })),
      });
      try {
        const stored = localStorage.getItem(`debtpilot:before-you-buy:${user.id}`);
        if (stored) setSaved(JSON.parse(stored) as SavedScenario[]);
      } catch { setSaved([]); }
      setLoading(false);
    })();
  }, []);

  function update<K extends keyof PurchaseScenario>(key: K, value: PurchaseScenario[K]) {
    setScenario(current => ({ ...current, [key]: value }));
  }

  function run() {
    if (!finances || scenario.purchasePrice <= 0 || !scenario.itemName.trim()) {
      setMessage('Add an item name and purchase price to run the report.');
      return;
    }
    setMessage('');
    setReport(evaluatePurchase(scenario, finances));
  }

  function saveScenario() {
    if (!report || !userId) { setMessage('Run the purchase report before saving this scenario.'); return; }
    const item: SavedScenario = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), scenario, decision: report.decision };
    const next = [item, ...saved].slice(0, 20);
    localStorage.setItem(`debtpilot:before-you-buy:${userId}`, JSON.stringify(next));
    setSaved(next);
    setMessage('Scenario saved to this account on this device.');
  }

  function deleteSaved(id: string) {
    const next = saved.filter(item => item.id !== id);
    localStorage.setItem(`debtpilot:before-you-buy:${userId}`, JSON.stringify(next));
    setSaved(next);
  }

  function dismiss() {
    setScenario(initialScenario());
    setReport(null);
    setMessage('Scenario dismissed. Your saved financial plan was not changed.');
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Preparing your decision report…</main>;

  const decisionStyle = report?.decision === 'Proceed' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : report?.decision === 'Wait' ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-rose-400/30 bg-rose-400/10 text-rose-200';

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><ShoppingBag size={16}/> Before You Buy</div><h1 className="text-4xl font-semibold">See the financial impact before you commit.</h1><p className="mt-3 max-w-3xl text-slate-400">DebtPilot compares the purchase with your saved cash, obligations, debts, goals, and Pilot plan. Calculations are deterministic and never change your live financial data.</p></header>
    {message && <p role="status" className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}

    <Section title="1. Purchase Details"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <TextField label="Item Name" value={scenario.itemName} onChange={value => update('itemName', value)}/>
      <NumberField label="Purchase Price" value={scenario.purchasePrice} onChange={value => update('purchasePrice', value)}/>
      <label className="text-xs text-slate-400">Cash or Finance<select className="field mt-1 w-full" value={scenario.method} onChange={event => update('method', event.target.value as PurchaseScenario['method'])}><option value="cash">Cash</option><option value="finance">Finance</option></select></label>
      <NumberField label={scenario.method === 'cash' ? 'Cash Due' : 'Down Payment'} value={scenario.method === 'cash' ? scenario.purchasePrice : scenario.downPayment} onChange={value => update('downPayment', value)} disabled={scenario.method === 'cash'}/>
      <NumberField label="Monthly Payment" value={scenario.monthlyPayment} onChange={value => update('monthlyPayment', value)} disabled={scenario.method === 'cash'} help="Leave at $0 to calculate the amortized payment from rate and term."/>
      <NumberField label="Interest Rate (%)" value={scenario.interestRate} onChange={value => update('interestRate', value)} disabled={scenario.method === 'cash'} step="0.1"/>
      <NumberField label="Loan Length (months)" value={scenario.loanLength} onChange={value => update('loanLength', Math.round(value))} disabled={scenario.method === 'cash'}/>
      <label className="text-xs text-slate-400">Purchase Date<input type="date" className="field mt-1 w-full" value={scenario.purchaseDate} onChange={event => update('purchaseDate', event.target.value)}/></label>
    </div></Section>

    {report && <>
      <section className="mt-6"><Section title="2. Financial Impact Report">
        <div className={`rounded-2xl border p-6 ${decisionStyle}`}><p className="text-xs uppercase tracking-[0.2em]">Recommendation</p><p className="mt-2 text-4xl font-semibold">{report.decision}</p><p className="mt-3 text-sm">{report.expectedBenefit} · {report.timeHorizon}</p></div>
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="text-slate-500"><tr><th className="pb-3">Impact</th><th>Before</th><th>After</th></tr></thead><tbody>
          <CompareText label="Financial Health" before={`${report.healthBefore}/100`} after={`${report.healthAfter}/100`}/>
          <CompareMoney label="Checking Balance" before={report.checkingBefore} after={report.checkingAfter}/>
          <CompareMoney label="Emergency Fund" before={report.emergencyBefore} after={report.emergencyAfter}/>
          <CompareText label="Debt-Free Date" before={report.debtFreeBefore ?? 'Not projected'} after={report.debtFreeAfter ?? 'Not projected'}/>
        </tbody></table></div>
        <div className="mt-6"><h3 className="text-xl font-semibold">Goal delays</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{report.goalDelays.map(goal => <div key={goal.label} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><p className="text-sm text-slate-500">{goal.label}</p><p className="mt-2 font-semibold">{goal.status}</p></div>)}</div></div>
      </Section></section>

      <section className="mt-6"><Section title="3. Pilot Explanation"><div className="grid gap-6 lg:grid-cols-2">
        <Explanation title="Why" items={report.why}/><Explanation title="Benefits" items={report.benefits} positive/><Explanation title="Risks" items={report.risks} warning/>
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5"><p className="text-xs uppercase tracking-widest text-cyan-300">Confidence</p><p className="mt-2 text-3xl font-semibold">{report.confidence}%</p><p className="mt-5 text-xs uppercase tracking-widest text-cyan-300">Next Best Alternative</p><p className="mt-2 text-sm leading-6 text-slate-300">{report.nextBestAlternative}</p></div>
      </div></Section></section>
    </>}

    <section className="mt-6"><Section title="4. Actions"><div className="flex flex-col gap-3 sm:flex-row"><button onClick={saveScenario} disabled={!report} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-40"><Save size={17}/>Save Scenario</button><button onClick={run} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 px-5 py-3 font-semibold text-cyan-300"><RotateCcw size={17}/>{report ? 'Run Again' : 'Run Analysis'}</button><button onClick={dismiss} className="rounded-xl border border-slate-700 px-5 py-3 text-slate-300">Dismiss</button></div></Section></section>

    {saved.length > 0 && <section className="mt-6"><Section title="Saved scenarios"><div className="grid gap-3 md:grid-cols-2">{saved.map(item => <article key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-800 p-4"><button className="min-w-0 flex-1 text-left" onClick={() => { setScenario(item.scenario); setReport(finances ? evaluatePurchase(item.scenario, finances) : null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><p className="truncate font-medium">{item.scenario.itemName}</p><p className="mt-1 text-sm text-slate-500">{money.format(item.scenario.purchasePrice)} · {item.decision} · {new Date(item.savedAt).toLocaleDateString()}</p></button><button aria-label={`Delete ${item.scenario.itemName}`} onClick={() => deleteSaved(item.id)} className="rounded-xl border border-rose-400/20 p-3 text-rose-300"><Trash2 size={17}/></button></article>)}</div></Section></section>}

    <p className="mt-6 text-xs leading-5 text-slate-500">Decision support only. Confirm final pricing, fees, lender disclosures, and your current balances before purchasing.</p>
  </div></main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6"><h2 className="mb-5 text-2xl font-semibold">{title}</h2>{children}</div>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-slate-400">{label}<input className="field mt-1 w-full" value={value} onChange={event => onChange(event.target.value)}/></label>; }
function NumberField({ label, value, onChange, disabled = false, step = '1', help }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean; step?: string; help?: string }) { return <label className="text-xs text-slate-400">{label}<input type="number" min="0" step={step} disabled={disabled} className="field mt-1 w-full disabled:cursor-not-allowed disabled:opacity-50" value={value} onChange={event => onChange(Number(event.target.value))}/>{help && <span className="mt-1 block text-[11px] leading-4 text-slate-600">{help}</span>}</label>; }
function CompareMoney({ label, before, after }: { label: string; before: number; after: number }) { return <tr className="border-t border-slate-800"><td className="py-4 font-medium">{label}</td><td>{money.format(before)}</td><td className={after < before ? 'text-amber-300' : 'text-slate-200'}>{money.format(after)}</td></tr>; }
function CompareText({ label, before, after }: { label: string; before: string; after: string }) { return <tr className="border-t border-slate-800"><td className="py-4 font-medium">{label}</td><td>{before}</td><td>{after}</td></tr>; }
function Explanation({ title, items, positive = false, warning = false }: { title: string; items: string[]; positive?: boolean; warning?: boolean }) { const Icon = positive ? CheckCircle2 : warning ? ShieldAlert : CircleDollarSign; return <div className="rounded-2xl border border-slate-800 p-5"><div className="flex items-center gap-2"><Icon className={positive ? 'text-emerald-300' : warning ? 'text-amber-300' : 'text-cyan-300'} size={18}/><h3 className="font-semibold">{title}</h3></div><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-400">{items.map(item => <li key={item}>{item}</li>)}</ul></div>; }
