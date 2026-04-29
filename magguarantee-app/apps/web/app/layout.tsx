import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MAGGuarantee',
  description: 'Kilometer guarantee management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
