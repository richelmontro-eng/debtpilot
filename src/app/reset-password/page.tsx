'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { PasswordFields } from '@/components/password-fields';
import { createClient } from '@/lib/supabase';
import { mapPasswordError, validateNewPassword } from '@/lib/password-management';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false); const [ready, setReady] = useState<boolean | null>(null); const [message, setMessage] = useState(''); const [complete, setComplete] = useState(false);
  useEffect(() => { const supabase = createClient(); if (!supabase) return setReady(false); void supabase.auth.getUser().then(({ data, error }) => setReady(Boolean(data.user) && !error)).catch(() => setReady(false)); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || complete) return;
    const validation = validateNewPassword(password, confirmation); if (validation) return setMessage(validation);
    const supabase = createClient(); if (!supabase) return setMessage('We couldn’t update your password. Please try again.');
    setBusy(true); setMessage('');
    try { const { error } = await supabase.auth.updateUser({ password }); if (error) setMessage(mapPasswordError(error)); else { setComplete(true); setMessage('Your password has been updated.'); } } catch { setMessage('We couldn’t update your password. Please try again.'); }
    setBusy(false);
  }
  if (ready === null) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Checking reset link…</main>;
  if (!ready) return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 text-center"><h1 className="text-3xl font-semibold">This reset link has expired</h1><p className="mt-3 text-slate-400">Request a new one.</p><Link href="/forgot-password" className="mt-6 block rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950">Request a new reset link</Link></section></main>;
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7"><p className="text-sm font-semibold text-cyan-300">DebtPilot</p><h1 className="mt-2 text-3xl font-semibold">Choose a new password</h1><div className="mt-6"><PasswordFields password={password} confirmation={confirmation} onPassword={setPassword} onConfirmation={setConfirmation} disabled={busy || complete}/></div>{message && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}{complete ? <Link href="/" className="mt-5 block rounded-xl bg-cyan-400 px-4 py-3 text-center font-semibold text-slate-950">Continue to DebtPilot</Link> : <button disabled={busy} className="mt-5 w-full rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">{busy ? 'Updating…' : 'Update password'}</button>}</form></main>;
}
