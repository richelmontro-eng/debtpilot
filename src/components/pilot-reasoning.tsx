'use client';

export default function PilotReasoning({ open, onToggle, reasoning }: { open: boolean; onToggle: () => void; reasoning: string[] }) {
  return <>
    <button type="button" aria-expanded={open} aria-controls="pilot-reasoning" onClick={onToggle} className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-medium text-cyan-300 outline-none transition hover:border-cyan-300 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900">{open ? 'Hide details' : 'Why?'}</button>
    {open && <section id="pilot-reasoning" role="region" aria-label="Why this recommendation was generated" className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Why this recommendation</p>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{reasoning.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </section>}
  </>;
}
