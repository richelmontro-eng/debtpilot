'use client';

import { Info } from 'lucide-react';

export default function InfoTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return <span className="group relative inline-flex items-center gap-1.5">
    <span>{label}</span>
    <button
      type="button"
      aria-label={`About ${label}`}
      className="rounded-full text-slate-500 transition hover:text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
    >
      <Info size={14}/>
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-72 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-left text-xs font-normal leading-5 text-slate-300 shadow-xl group-hover:block group-focus-within:block"
    >
      {children}
    </span>
  </span>;
}
