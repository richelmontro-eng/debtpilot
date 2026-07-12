'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Plus, ReceiptText, Search, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type TransactionType = 'income' | 'expense' | 'bill_payment' | 'debt_payment' | 'transfer' | 'refund' | 'bonus';

type Transaction = {
  id: string;
  date: string;
  type: TransactionType;
  description: string;
  category: string;
  account: string;
  amount: number;
  notes: string;
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const typeLabels: Record<TransactionType, string> = {
  income: 'Income',
  expense: 'Expense',
  bill_payment: 'Bill payment',
  debt_payment: 'Debt payment',
  transfer: 'Transfer',
  refund: 'Refund',
  bonus: 'Bonus',
};

const positiveTypes = new Set<TransactionType>(['income', 'refund', 'bonus']);

export default function TransactionsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: 'expense' as TransactionType,
    description: '',
    category: 'Other',
    account: 'Checking',
    amount: 0,
    notes: '',
  });

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
      setUserId(user.id);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) setMessage(`Load failed: ${error.message}`);
      setTransactions((data ?? []).map(row => ({
        id: row.id,
        date: row.transaction_date,
        type: row.transaction_type,
        description: row.description,
        category: row.category,
        account: row.account,
        amount: Number(row.amount),
        notes: row.notes ?? '',
      })));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter(transaction => {
      const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
      const matchesSearch = !query || [transaction.description, transaction.category, transaction.account, transaction.notes]
        .some(value => value.toLowerCase().includes(query));
      return matchesType && matchesSearch;
    });
  }, [transactions, search, typeFilter]);

  const summary = useMemo(() => {
    return transactions.reduce((totals, transaction) => {
      if (positiveTypes.has(transaction.type)) totals.income += transaction.amount;
      else if (transaction.type !== 'transfer') totals.outflow += transaction.amount;
      return totals;
    }, { income: 0, outflow: 0 });
  }, [transactions]);

  async function addTransaction() {
    const supabase = createClient();
    if (!supabase || !userId || saving) return;
    if (!form.description.trim() || form.amount <= 0) {
      setMessage('Enter a description and an amount greater than zero.');
      return;
    }

    setSaving(true);
    setMessage('Saving transaction…');
    const payload = {
      user_id: userId,
      transaction_date: form.date,
      transaction_type: form.type,
      description: form.description.trim(),
      category: form.category.trim() || 'Other',
      account: form.account.trim() || 'Checking',
      amount: form.amount,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('transactions').insert(payload).select('*').single();
    if (error) {
      setMessage(`Save failed: ${error.message}`);
    } else {
      const created: Transaction = {
        id: data.id,
        date: data.transaction_date,
        type: data.transaction_type,
        description: data.description,
        category: data.category,
        account: data.account,
        amount: Number(data.amount),
        notes: data.notes ?? '',
      };
      setTransactions(items => [created, ...items]);
      setForm(current => ({ ...current, description: '', amount: 0, notes: '' }));
      setMessage('Transaction saved.');
    }
    setSaving(false);
  }

  async function removeTransaction(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId);
    if (error) setMessage(`Delete failed: ${error.message}`);
    else {
      setTransactions(items => items.filter(item => item.id !== id));
      setMessage('Transaction removed.');
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Loading your transaction ledger…</main>;

  return <main className="min-h-screen bg-slate-950 text-slate-100"><div className="mx-auto max-w-7xl px-5 py-8">
    <header className="mb-8">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-300"><ReceiptText size={16}/> Transactions</div>
      <h1 className="text-4xl font-semibold">Track what actually happened.</h1>
      <p className="mt-3 max-w-3xl text-slate-400">Record major income, expenses, bill payments, and debt payments. This first release keeps the ledger separate from saved account balances so entries can be reviewed safely before automatic reconciliation is added.</p>
    </header>

    {message && <p role="status" className="mb-6 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300">{message}</p>}

    <section className="grid gap-4 md:grid-cols-3">
      <Metric label="Recorded inflow" value={money.format(summary.income)} positive/>
      <Metric label="Recorded outflow" value={money.format(summary.outflow)}/>
      <Metric label="Net recorded activity" value={money.format(summary.income - summary.outflow)} positive={summary.income >= summary.outflow}/>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-2"><Plus className="text-cyan-300" size={20}/><h2 className="text-2xl font-semibold">Add transaction</h2></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-slate-400">Date<input className="field mt-1 w-full" type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))}/></label>
          <label className="text-xs text-slate-400">Type<select className="field mt-1 w-full" value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value as TransactionType }))}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Description<input className="field mt-1 w-full" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Example: Electric bill or weekly paycheck"/></label>
          <label className="text-xs text-slate-400">Category<input className="field mt-1 w-full" value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}/></label>
          <label className="text-xs text-slate-400">Account<input className="field mt-1 w-full" value={form.account} onChange={event => setForm(current => ({ ...current, account: event.target.value }))}/></label>
          <label className="text-xs text-slate-400">Amount<input className="field mt-1 w-full" type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: Number(event.target.value) }))}/></label>
          <label className="text-xs text-slate-400 sm:col-span-2">Notes<textarea className="field mt-1 min-h-24 w-full" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))}/></label>
        </div>
        <button onClick={addTransaction} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"><Plus size={18}/>{saving ? 'Saving…' : 'Add transaction'}</button>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-2xl font-semibold">Ledger</h2><div className="flex gap-2"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16}/><input className="field w-full pl-9 sm:w-56" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search"/></label><select className="field" value={typeFilter} onChange={event => setTypeFilter(event.target.value as 'all' | TransactionType)}><option value="all">All types</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
        <div className="mt-5 space-y-3">{filtered.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">No transactions match this view.</p>}{filtered.map(transaction => {
          const positive = positiveTypes.has(transaction.type);
          return <article key={transaction.id} className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3">{positive ? <ArrowUpCircle className="mt-1 shrink-0 text-emerald-300" size={21}/> : <ArrowDownCircle className="mt-1 shrink-0 text-rose-300" size={21}/>}<div><p className="font-medium">{transaction.description}</p><p className="mt-1 text-xs text-slate-500">{new Date(transaction.date + 'T00:00:00').toLocaleDateString()} · {typeLabels[transaction.type]} · {transaction.category} · {transaction.account}</p>{transaction.notes && <p className="mt-2 text-sm text-slate-400">{transaction.notes}</p>}</div></div><div className="flex items-center justify-between gap-3 sm:justify-end"><p className={`text-lg font-semibold ${positive ? 'text-emerald-300' : transaction.type === 'transfer' ? 'text-slate-300' : 'text-rose-300'}`}>{positive ? '+' : transaction.type === 'transfer' ? '' : '-'}{money.format(transaction.amount)}</p><button aria-label={`Delete ${transaction.description}`} onClick={() => removeTransaction(transaction.id)} className="rounded-lg border border-rose-400/20 p-2 text-rose-300"><Trash2 size={16}/></button></div></article>;
        })}</div>
      </div>
    </section>

    <p className="mt-6 text-xs leading-5 text-slate-500">Transactions are manual records in this version. They do not yet change your saved checking, savings, debt, or goal balances automatically. Reconciliation and balance-posting controls are the next transaction milestone.</p>
  </div></main>;
}

function Metric({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <div className={`rounded-2xl border p-5 ${positive ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-slate-800 bg-slate-900'}`}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}
