'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Beaker, Bot, CalendarRange, Car, Gauge, Inbox, LogOut, Menu, ReceiptText, Settings, ShoppingBag, Target, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabase';
import { APP_VERSION } from '../lib/version';

const links = [
  { href: '/', label: 'Dashboard', icon: Gauge },
  { href: '/before-you-buy', label: 'Before You Buy', icon: ShoppingBag },
  { href: '/pilot', label: 'Pilot advisor', icon: Bot },
  { href: '/transactions', label: 'Transactions', icon: ReceiptText },
  { href: '/inbox', label: 'Financial inbox', icon: Inbox },
  { href: '/forecast', label: 'Cash flow', icon: CalendarRange },
  { href: '/insights', label: 'Net worth & health', icon: Activity },
  { href: '/payoff', label: 'Payoff planner', icon: BarChart3 },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/vehicles', label: 'Vehicle planner', icon: Car },
  { href: '/what-if', label: 'What-If Lab', icon: Beaker },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState({ displayName: '', email: '' });
  const isPublic = pathname === '/login' || pathname === '/welcome' || pathname === '/forgot-password' || pathname === '/reset-password' || pathname.startsWith('/auth/');

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || isPublic) return;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('display_name').eq('user_id', user.id).maybeSingle();
      setAccount({ displayName: data?.display_name || user.email?.split('@')[0] || 'DebtPilot user', email: user.email ?? '' });
    })();
  }, [isPublic]);

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
    window.location.assign('/login');
  }

  if (isPublic) return <>{children}</>;

  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur lg:hidden">
      <Link href="/" className="font-semibold text-cyan-300">DebtPilot</Link>
      <button type="button" aria-label="Open navigation" onClick={() => setOpen(true)} className="rounded-lg border border-slate-700 p-2 text-slate-300"><Menu size={20}/></button>
    </header>

    {open && <button aria-label="Close navigation overlay" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/60 lg:hidden"/>}

    <aside className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-800 bg-slate-950 p-5 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between">
        <Link href="/" onClick={() => setOpen(false)} className="text-xl font-semibold text-cyan-300">DebtPilot</Link>
        <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 lg:hidden"><X size={20}/></button>
      </div>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-600">Financial operating system</p>

      <nav className="mt-8 space-y-1.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return <Link key={href} href={href} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? 'bg-cyan-400/10 text-cyan-300' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'}`}><Icon size={18}/>{label}</Link>;
        })}
      </nav>

      <div className="absolute inset-x-5 bottom-5">
        <AccountPanel displayName={account.displayName} email={account.email} onSignOut={signOut}/>
      </div>
    </aside>

    <div className="lg:pl-72">{children}</div>
  </div>;
}

export function AccountPanel({ displayName, email, onSignOut }: { displayName: string; email: string; onSignOut: () => void }) {
  const initial = (displayName || email || 'D').charAt(0).toUpperCase();
  return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan-400 font-semibold text-slate-950">{initial}</div><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-200">{displayName || 'DebtPilot user'}</p><p className="truncate text-xs text-slate-500">{email}</p></div></div><div className="mt-4 grid gap-2"><Link href="/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-cyan-300"><Settings size={15}/>Settings</Link><button type="button" onClick={onSignOut} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-rose-300 hover:bg-rose-400/10 focus-visible:ring-2 focus-visible:ring-cyan-300"><LogOut size={15}/>Sign Out</button></div><p className="mt-3 border-t border-slate-800 pt-3 text-center text-[11px] text-slate-600">DebtPilot v{APP_VERSION}</p></div>;
}
