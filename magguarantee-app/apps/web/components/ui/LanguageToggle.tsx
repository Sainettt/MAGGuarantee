'use client';

// PL ⇄ EN switcher. Writes the chosen locale to the `mt_lang` cookie (1 year)
// and refreshes the router so Server Components re-render with the new
// messages picked up by `i18n/request.ts`. Two-state toggle is enough for
// Phase 1 — promote to a Radix dropdown if we ever add a third locale.

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { LOCALE_COOKIE, locales, type Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';

interface LanguageToggleProps {
  className?: string;
}

function setLocaleCookie(locale: Locale) {
  // 1-year persistence; matches typical "remember my language" expectation.
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

export function LanguageToggle({ className }: LanguageToggleProps) {
  const t = useTranslations('lang');
  const router = useRouter();
  const current = useLocale() as Locale;
  const [isPending, startTransition] = useTransition();

  const next: Locale = current === 'pl' ? 'en' : 'pl';

  return (
    <button
      type="button"
      aria-label={t('toggle')}
      title={t(next)}
      disabled={isPending}
      onClick={() => {
        setLocaleCookie(next);
        startTransition(() => router.refresh());
      }}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card/80 backdrop-blur px-3',
        'text-[13px] font-bold text-text uppercase hover:bg-input transition-colors',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
        'disabled:opacity-60 disabled:cursor-wait',
        className,
      )}
    >
      <Languages size={14} aria-hidden />
      <span>{(locales as readonly string[]).includes(current) ? current.toUpperCase() : 'PL'}</span>
    </button>
  );
}
