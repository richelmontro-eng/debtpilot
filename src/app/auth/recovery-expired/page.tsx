import Link from 'next/link';

export default function RecoveryExpiredPage() {
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100"><section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 text-center"><p className="text-sm font-semibold text-cyan-300">DebtPilot</p><h1 className="mt-3 text-3xl font-semibold">This reset link has expired</h1><p className="mt-3 text-sm leading-6 text-slate-400">Request a new one to securely update your password.</p><Link href="/forgot-password" className="mt-6 block rounded-xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">Request a new reset link</Link></section></main>;
}
