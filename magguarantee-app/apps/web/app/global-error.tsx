'use client';

// Last-resort boundary: replaces the ROOT layout when it (or `app/error.tsx`)
// throws. Because the root layout is gone, none of its providers exist here —
// no next-intl, no next-themes, no QueryClient — so this file is deliberately
// self-contained:
//   * copy lives in a tiny inline PL/EN dictionary (mirrors `errors.boundary.*`
//     in messages/*.json; the full bundles are not shipped into this chunk),
//   * locale comes from the same `mt_lang` cookie next-intl reads server-side,
//     falling back to the browser language, then PL (default),
//   * theme follows the `mt_theme` storage key next-themes writes,
//   * retry is a full reload — the root layout itself failed, so a client
//     `reset()` would re-render the same broken tree.
//
// No stack or raw message is rendered; only the digest (support handle).

import { AlertTriangle, RotateCw } from 'lucide-react';
import { DM_Sans } from 'next/font/google';
import { useEffect, useState } from 'react';

import { LOCALE_COOKIE, defaultLocale, isLocale, type Locale } from '@/i18n/config';

import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

const COPY: Record<
  Locale,
  { title: string; message: string; retry: string; reference: string }
> = {
  pl: {
    title: 'Nie udało się wyświetlić aplikacji',
    message:
      'Wystąpił nieoczekiwany błąd albo serwis jest chwilowo niedostępny. Spróbuj ponownie za chwilę.',
    retry: 'Spróbuj ponownie',
    reference: 'Identyfikator błędu:',
  },
  en: {
    title: 'The application could not be displayed',
    message:
      'An unexpected error occurred or the service is temporarily unavailable. Please try again in a moment.',
    retry: 'Try again',
    reference: 'Error reference:',
  },
};

function detectLocale(): Locale {
  const fromCookie = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  if (isLocale(fromCookie)) return fromCookie;
  const fromBrowser = navigator.language.split('-')[0]?.toLowerCase();
  return isLocale(fromBrowser) ? fromBrowser : defaultLocale;
}

function prefersDark(): boolean {
  try {
    const stored = window.localStorage.getItem('mt_theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
  } catch {
    // storage blocked — fall through to the OS preference
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setLocale(detectLocale());
    setDark(prefersDark());
  }, []);

  useEffect(() => {
    console.error('[global-error]', {
      digest: error.digest,
      name: error.name,
      message: error.message,
    });
  }, [error]);

  const copy = COPY[locale];

  return (
    <html lang={locale} className={`${dmSans.variable}${dark ? ' dark' : ''}`}>
      <body className="font-sans bg-bg text-text antialiased min-h-screen">
        <main className="flex min-h-screen items-center justify-center px-4 py-12">
          <div
            role="alert"
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-card sm:p-8"
          >
            <span
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-bg text-danger dark:bg-danger/15"
              aria-hidden
            >
              <AlertTriangle size={24} />
            </span>
            <h1 className="text-lg font-bold text-text">{copy.title}</h1>
            <p className="mt-2 text-sm text-text-sub">{copy.message}</p>
            {error.digest && (
              <p className="mt-3 font-mono text-xs text-text-sub">
                {copy.reference} {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex h-9 items-center justify-center gap-2 rounded-[10px] bg-brand px-3 text-[13px] font-bold text-white transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
            >
              <RotateCw size={14} aria-hidden />
              {copy.retry}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
