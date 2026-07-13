'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) return setMessage('DebtPilot is temporarily unavailable. Please try again later.');

    setBusy(true);
    setMessage('');

    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        });

    setBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === 'signup' && !result.data.session) {
      setMessage('Check your email to confirm your account. The confirmation link will return you to DebtPilot.');
      return;
    }

    window.location.replace('/');
  }

  return <main className="min-h-screen bg-slate-950 text-slate-100 lg:grid lg:grid-cols-2">
    <section className="hidden border-r border-slate-800 bg-slate-900/50 p-12 lg:flex lg:flex-col lg:justify-center">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">DebtPilot</p>
      <h1 className="mt-5 max-w-xl text-5xl font-semibold leading-tight">Your personal financial operating system.</h1>
      <p className="mt-5 max-w-xl text-lg leading-8 text-slate-400">Plan every paycheck, eliminate debt faster, and make confident financial decisions.</p>
      <div className="mt-10 space-y-4 text-sm text-slate-300">
        {['Know what needs attention today', 'See the impact before moving money', 'Build a clear path toward your goals'].map(item => <div key={item} className="flex items-center gap-3"><CheckCircle2 className="text-emerald-300" size={19}/><span>{item}</span></div>)}
      </div>
    </section>

    <section className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl shadow-black/20">
        <p className="text-sm font-semibold text-cyan-300 lg:hidden">DebtPilot</p>
        <h1 className="mt-2 text-3xl font-semibold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{mode === 'login' ? 'Sign in to see where you stand and what to do next.' : 'Start building a clearer, more confident financial plan.'}</p>
        <label className="mt-6 block text-sm text-slate-300">Email<input className="field mt-2 w-full" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>
        <label className="mt-4 block text-sm text-slate-300">Password<input className="field mt-2 w-full" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 10 : undefined} required value={password} onChange={e => setPassword(e.target.value)}/></label>
        {mode === 'login' && <Link href="/forgot-password" className="mt-3 block text-right text-sm text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Forgot password?</Link>}
        {message && <p role="status" className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}
        <button disabled={busy} className="mt-5 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }} className="mt-4 w-full text-sm text-cyan-300">{mode === 'login' ? 'Need an account? Create one' : 'Already registered? Sign in'}</button>
      </form>
    </section>
  </main>;
}
