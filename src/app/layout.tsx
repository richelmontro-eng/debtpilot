import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "DebtPilot",
  description: "Paycheck financial command center and debt decision engine",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <nav className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 px-5 py-3 text-slate-100 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <Link href="/" className="font-semibold text-cyan-300">DebtPilot</Link>
            <div className="flex items-center gap-1 overflow-x-auto text-sm">
              <Link href="/" className="whitespace-nowrap rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white">Dashboard</Link>
              <Link href="/goals" className="whitespace-nowrap rounded-lg px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white">Goals</Link>
              <Link href="/payoff" className="whitespace-nowrap rounded-lg border border-cyan-400/30 px-3 py-2 text-cyan-300 hover:bg-cyan-400/10">Payoff planner</Link>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
