'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Confirming your account…');

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setMessage('Supabase is not configured.');
      return;
    }

    const finish = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data.session) {
        window.location.replace('/');
        return;
      }
      setMessage('Your email was confirmed. Return to the sign-in page to continue.');
    };

    finish();
  }, []);

  return <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-6">
    <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 text-center">
      <p className="text-sm text-cyan-300">DebtPilot</p>
      <h1 className="mt-2 text-2xl font-semibold">Account confirmation</h1>
      <p className="mt-4 text-slate-300">{message}</p>
      <a href="/login" className="mt-6 inline-block rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950">Go to sign in</a>
    </div>
  </main>;
}
