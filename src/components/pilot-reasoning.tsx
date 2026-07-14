'use client';

export default function PilotReasoning({ open, onToggle, reasoning, panelId = 'pilot-reasoning' }: { open: boolean; onToggle: () => void; reasoning: string[]; panelId?: string }) {
  return <>
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle} className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-medium text-cyan-300 outline-none transition hover:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">{open ? 'Hide details' : 'Why?'}</button>
    {open && <section id={panelId} tabIndex={-1} role="region" aria-label="Why this recommendation was generated" className="mt-4 scroll-mt-24 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4 outline-none focus:ring-2 focus:ring-cyan-300">
      <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Why this recommendation</p>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{reasoning.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </section>}
  </>;
}
