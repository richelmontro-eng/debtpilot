'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Beaker, CalendarRange, Car, Gauge, Inbox, Menu, Settings, Target, X } from 'lucide-react';
import { useState } from 'react';

const links = [
  { href: '/', label: 'Dashboard', icon: Gauge },
  { href: '/inbox', label: 'Financial inbox', icon: Inbox },
  { href: '/forecast', label: 'Cash flow', icon: CalendarRange },
  { href: '/insights', label: 'Net worth & health', icon: Activity },
  { href: '/payoff', label: 'Payoff planner', icon: BarChart3 },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/vehicles', label: 'Vehicle planner', icon: Car },
  { href: '/what-if', label: 'What-If Lab', icon: Beaker },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isPublic = pathname === '/login' || pathname.startsWith('/auth/');

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
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs leading-5 text-slate-500">
          <p className="font-medium text-slate-300">DebtPilot v0.10.0</p>
          <p>Net worth, health scoring, snapshots, trends, and weekly brief.</p>
        </div>
      </div>
    </aside>

    <div className="lg:pl-72">{children}</div>
  </div>;
}
