import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DebtPilot",
  description: "Weekly-pay financial command center and debt decision engine",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
