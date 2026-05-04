import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { Providers } from '@/components/providers/Providers';

import './globals.css';
// Side-effect import: installs the Polish Zod error map globally so every
// form's "this field is required" / "too short" etc. shows logist-friendly
// Polish text instead of Zod's English defaults.
import '@/lib/zod-locale';

const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MAGGuarantee',
  description: 'Kilometer guarantee management for MAGTRANS',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning className={dmSans.variable}>
      <body className="font-sans bg-bg text-text antialiased min-h-screen">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
