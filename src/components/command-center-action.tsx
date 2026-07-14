'use client';

import Link from 'next/link';

export function commandCenterTarget(href: string) {
  return href.startsWith('/#') ? href.slice(2) : href.startsWith('#') ? href.slice(1) : null;
}

export function focusCommandCenterTarget(target: string, root: Pick<Document, 'getElementById'> = document) {
  const element = root.getElementById(target);
  if (!element) return false;
  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  element.focus({ preventScroll: true });
  return true;
}

export function CommandCenterAction({ label, href, onInPage }: { label: string; href: string; onInPage: (target: string) => void }) {
  const target = commandCenterTarget(href);
  const styles = 'mt-4 inline-flex rounded-lg text-sm font-medium text-cyan-300 outline-none transition hover:text-cyan-200 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';
  if (target) return <button type="button" onClick={() => onInPage(target)} className={styles}>{label}</button>;
  return <Link href={href} className={styles}>{label}</Link>;
}
