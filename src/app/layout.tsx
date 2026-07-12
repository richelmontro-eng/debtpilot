import type { Metadata } from 'next';
import AppShell from '@/components/app-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'DebtPilot',
  description: 'Paycheck financial command center and debt decision engine',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
