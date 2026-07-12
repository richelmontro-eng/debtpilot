'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, Plus, ReceiptText, Search, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type TransactionType = 'income' | 'expense' | 'bill_payment' | 'debt_payment' | 'transfer' | 'refund' | 'bonus';
type Debt = { id: string; name: string; balance: number };

type Transaction = {
  id: string;
  date: string;
  type: TransactionType;
  description: string;
  category: string;
  account: string;
  amount: number;
  notes: string;
  postedAt: string | null;
  debtId: string | null;
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const typeLabels: Record<TransactionType, string> = {
  income: 'Income', expense: 'Expense', bill_payment: 'Bill payment', debt_payment: 'Debt payment', transfer: 'Transfer', refund: 'Refund', bonus: 'Bonus',
};
const positiveTypes = new Set<TransactionType>(['income', 'refund', 'bonus']);

function mapTransaction(row: any): Transaction {
  return {
    id: row.id,
    date: row.transaction_date,
    type: row.transaction_type,
    description: row.description,
    category: row.category,
    account: row.account,
    amount: Number(row.amount),
    notes: row.notes ?? '',
    postedAt: row.posted_at ?? null,
    debtId: row.debt_id ?? null,
  };
}

export default function TransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [postingId, setPostingId] = useState('');
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [debtSelections, setDebtSelections] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'expense' as TransactionType,
    description: '', category: 'Other', account: 'Checking', amount: 0, notes: '',
  });

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setMessage('Supabase is not configured.'); setLoading(false); return; }
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.assign('/login'); return; }
      setUserId(user.id);
      const [{ data: tx, error: txError }, { data: debtRows, error: debtError }] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', user.id).order('transaction_date', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('debts').select('id, name, balance').eq('user_id', user.id).gt('balance', 0).order('apr', { ascending: false }),
      ]);
      const error = txError || debtError;
      if (error) setMessage(`Load failed: ${error.message}`);
      setTransactions((tx ?? []).map(mapTransaction));
      setDebts((debtRows ?? []).map(row => ({ id: row.id, name: row.name, balance: Number(row.balance) })));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter(transaction => {
      const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
      const matchesSearch = !query || [transaction.description, transaction.category, transaction.account, transaction.notes].some(value => value.toLowerCase().includes(query));
      return matchesType && matchesSearch;
    });
  }, [transactions, search, typeFilter]);

  const summary = useMemo(() => transactions.reduce((totals, transaction) => {
    if (positiveTypes.has(transaction.type)) totals.income += transaction.amount;
    else if (transaction.type !== 'transfer') totals.outflow += transaction.amount;
    if (transaction.postedAt) totals.posted += 1;
    return totals;
  }, { income: 0, outflow: 0, posted: 0 }), [transactions]);

  async function addTransaction() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    if (!form.description.trim() || form.amount <= 0) { setMessage('Enter a description and an amount greater than zero.'); return; }
    setSaving(true);
    setMessage('Saving transaction…');
    const { data, error } = await supabase.from('transactions').insert({
      user_id: userId,
      transaction_date: form.date,
      transaction_type: form.type,
      description: form.description.trim(),
      category: form.category.trim() || 'Other',
      account: form.account,
      amount: form.amount,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).select('*').single();
    if (error) setMessage(`Save failed: ${error.message}`);
    else {
      setTransactions(items => [mapTransaction(data), ...items]);
      setForm(current => ({ ...current, description: '', amount: 0, notes: '' }));
      setMessage('Transaction saved. Review it before posting to your balances.');
    }
    setSaving(false);
  }

  async function postTransaction(transaction: Transaction) {
    const supabase = createClient();
    if (!supabase || postingId || transaction.postedAt) return;
    const debtId = transaction.type === 'debt_payment' ? debtSelections[transaction.id] : null;
    if (transaction.type === 'debt_payment' && !debtId) { setMessage('Choose the debt this payment applies to.'); return; }
    if (transaction.type === 'transfer') { setMessage('Transfers remain ledger-only until source and destination accounts are supported.'); return; }
    const confirmed = window.confirm(`Post ${money.format(transaction.amount)} for “${transaction.description}” to ${transaction.account}? This will update your saved balance${transaction.type === 'debt_payment' ? ' and debt' : ''}.`);
    if (!confirmed) return;
    setPostingId(transaction.id);
    setMessage('Posting transaction…');
    const { error } = await supabase.rpc('post_transaction', { p_transaction_id: transaction.id, p_debt_id: debtId });
    if (error) setMessage(`Post failed: ${error.message}`);
    else {
      setTransactions(items => items.map(item => item.id === transaction.id ? { ...item, postedAt: new Date().toISOString(), debtId } : item));
      setMessage('Transaction posted successfully. Your saved balances have been updated.');
    }
    setPostingId('');
  }

  async function removeTransaction(id: string) {
    const transaction = transactions.find(item => item.id === id);
    if (transaction?.postedAt) { setMessage('Posted transactions cannot be deleted. A reversal workflow will be added next.'); return; }
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId);
    if (error) setMessage(`Delete failed: ${error.message}`);
    else { setTransactions(items => items.filter(item => item.id !== id)); setMessage('Transaction removed.'); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading your transaction ledger…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><ReceiptText size={16}/> Transactions</div>
      <h1 className="text-4xl font-semibold">Track, review, then post.</h1>
      <p className="mt-3 max-w-3xl text-slate-400">New entries begin as ledger records. Posting is a separate confirmation step that safely updates checking, savings, and—when applicable—the selected debt balance.</p>
    </header>

    {message && <p role="status" className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}

    <section className="grid gap-4 md:grid-cols-4">
      <Metric label="Recorded inflow" value={money.format(summary.income)} positive/>
      <Metric label="Recorded outflow" value={money.format(summary.outflow)}/>
      <Metric label="Net recorded activity" value={money.format(summary.income - summary.outflow)} positive={summary.income >= summary.outflow}/>
      <Metric label="Posted transactions" value={String(summary.posted)} positive/>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-2"><Plus className="text-cyan-300" size={20}/><h2 className="text-2xl font-semibold">Add transaction</h2></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-slate-400">Date<input className="field mt-1 w-full" type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))}/></label>
          <label className="text-xs text-slate-400">Type<select className="field mt-1 w-full" value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value as TransactionType }))}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Description<input className="field mt-1 w-full" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Example: Electric bill or weekly paycheck"/></label>
          <label className="text-xs text-slate-400">Category<input className="field mt-1 w-full" value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}/></label>
          <label className="text-xs text-slate-400">Account<select className="field mt-1 w-full" value={form.account} onChange={event => setForm(current => ({ ...current, account: event.target.value }))}><option>Checking</option><option>Savings</option></select></label>
          <label className="text-xs text-slate-400">Amount<input className="field mt-1 w-full" type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: Number(event.target.value) }))}/></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Notes<textarea className="field mt-1 min-h-24 w-full" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}/></label>
        </div>
        <button onClick={addTransaction} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"><Plus size={18}/>{saving ? 'Saving…' : 'Add transaction'}</button>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-2xl font-semibold">Ledger</h2><div className="flex gap-2"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/><input className="field w-full pl-9 sm:w-56" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search"/></label><select className="field" value={typeFilter} onChange={event => setTypeFilter(event.target.value as 'all' | TransactionType)}><option value="all">All types</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
        <div className="mt-5 space-y-3">{filtered.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">No transactions match this view.</p>}{filtered.map(transaction => {
          const positive = positiveTypes.has(transaction.type);
          return <article key={transaction.id} className={`rounded-2xl border p-4 ${transaction.postedAt ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-slate-800 bg-slate-950/50'}`}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3">{positive ? <ArrowUpCircle className="mt-1 shrink-0 text-emerald-300" size={21}/> : <ArrowDownCircle className="mt-1 shrink-0 text-rose-300" size={21}/>}<div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{transaction.description}</p>{transaction.postedAt && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300"><CheckCircle2 size={12}/>Posted</span>}</div><p className="mt-1 text-xs text-slate-500">{new Date(transaction.date + 'T00:00:00').toLocaleDateString()} · {typeLabels[transaction.type]} · {transaction.category} · {transaction.account}</p>{transaction.notes && <p className="mt-2 text-sm text-slate-400">{transaction.notes}</p>}</div></div><p className={`text-lg font-semibold ${positive ? 'text-emerald-300' : transaction.type === 'transfer' ? 'text-slate-300' : 'text-rose-300'}`}>{positive ? '+' : transaction.type === 'transfer' ? '' : '-'}{money.format(transaction.amount)}</p></div>
          {!transaction.postedAt && <div className="mt-4 flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">{transaction.type === 'debt_payment' ? <select className="field sm:w-64" value={debtSelections[transaction.id] ?? ''} onChange={event => setDebtSelections(current => ({ ...current, [transaction.id]: event.target.value }))}><option value="">Choose debt to reduce</option>{debts.map(debt => <option key={debt.id} value={debt.id}>{debt.name} — {money.format(debt.balance)}</option>)}</select> : <p className="text-xs text-slate-500">Review the details before updating your saved balance.</p>}<div className="flex gap-2"><button onClick={() => removeTransaction(transaction.id)} className="rounded-lg border border-rose-400/20 p-2 text-rose-300" aria-label={`Delete ${transaction.description}`}><Trash2 size={16}/></button><button onClick={() => postTransaction(transaction)} disabled={postingId === transaction.id || transaction.type === 'transfer'} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{postingId === transaction.id ? 'Posting…' : transaction.type === 'transfer' ? 'Transfer posting soon' : 'Post to balances'}</button></div></div>}
        </article>;
        })}</div>
      </div>
    </section>

    <p className="mt-6 text-xs leading-5 text-slate-500">Posting is atomic: if any balance or debt update fails, the transaction remains unposted and no partial balance change is kept. Posted transactions are locked from deletion until a formal reversal workflow is added.</p>
  </div></main>;
}

function Metric({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${positive ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-slate-800 bg-slate-900'}`}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}
