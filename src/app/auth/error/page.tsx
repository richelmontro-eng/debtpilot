'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase';

export default function AuthErrorPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function resend(event: FormEvent) {
    event.preventDefault();
    if (!email || busy) return;
    const supabase = createClient();
    if (!supabase) {
      setMessage('Confirmation email could not be sent. Please try again later.');
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setBusy(false);
    setMessage(error
      ? 'Confirmation email could not be sent. Check the address and try again.'
      : 'If this address has a pending account, a new confirmation email is on its way.');
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
    <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center">
      <p className="text-sm font-semibold text-cyan-300">DebtPilot</p>
      <h1 className="mt-3 text-3xl font-semibold">Email confirmation unsuccessful</h1>
      <p className="mt-4 leading-7 text-slate-400">We couldn&apos;t confirm this email link. It may have expired or already been used.</p>
      <form onSubmit={resend} className="mt-7">
        <label className="block text-left text-sm text-slate-300">Email address<input className="field mt-2 w-full" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)}/></label>
        {message && <p role="status" className="mt-3 rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-sm text-slate-300">{message}</p>}
        <button disabled={busy} className="mt-4 w-full rounded-xl border border-cyan-400/30 px-4 py-3 font-semibold text-cyan-300 disabled:opacity-60">{busy ? 'Sending…' : 'Resend confirmation email'}</button>
      </form>
      <Link href="/login" className="mt-3 block rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950">Return to sign in</Link>
    </div>
  </main>;
}
