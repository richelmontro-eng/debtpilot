'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    if (!supabase) return setMessage('Add the Supabase environment variables in Vercel first.');

    setBusy(true);
    setMessage('');

    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
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

  return <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-6">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7">
      <p className="text-sm text-cyan-300">DebtPilot</p>
      <h1 className="mt-2 text-3xl font-semibold">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      <p className="mt-2 text-sm text-slate-400">Your financial data is stored under your Supabase account.</p>
      <label className="mt-6 block text-sm text-slate-300">Email<input className="field mt-2 w-full" type="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>
      <label className="mt-4 block text-sm text-slate-300">Password<input className="field mt-2 w-full" type="password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)}/></label>
      {message && <p className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}
      <button disabled={busy} className="mt-5 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }} className="mt-4 w-full text-sm text-cyan-300">{mode === 'login' ? 'Need an account? Sign up' : 'Already registered? Sign in'}</button>
    </form>
  </main>;
}
