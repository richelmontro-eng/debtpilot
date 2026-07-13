'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { RESET_SENT_MESSAGE } from '@/lib/password-management';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    const supabase = createClient();
    if (supabase) {
      try { await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/recovery` }); } catch { /* Keep account existence and provider details private. */ }
    }
    setSent(true);
    setBusy(false);
  }

  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7">
      <p className="text-sm font-semibold text-cyan-300">DebtPilot</p><h1 className="mt-2 text-3xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">Enter your email and we’ll send secure reset instructions.</p>
      <label htmlFor="recovery-email" className="mt-6 block text-sm text-slate-300">Email address</label>
      <input id="recovery-email" className="field mt-2 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" type="email" inputMode="email" autoComplete="email" required disabled={busy || sent} value={email} onChange={e => setEmail(e.target.value)}/>
      {sent && <p role="status" className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-200">{RESET_SENT_MESSAGE}</p>}
      <button disabled={busy || sent} className="mt-5 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:opacity-60">{busy ? 'Sending…' : sent ? 'Reset link sent' : 'Send reset link'}</button>
      <Link href="/login" className="mt-4 block text-center text-sm text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">Return to sign in</Link>
    </form>
  </main>;
}
