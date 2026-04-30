'use client';

// Sun/moon theme toggle. Backed by `next-themes` (which writes the active
// theme to `localStorage` under the `mt_theme` key configured in
// `<Providers>`). We render only after mount to avoid hydration mismatch
// (server doesn't know which theme the user prefers).

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const t = useTranslations('theme');
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      aria-label={t('toggle')}
      title={isDark ? t('light') : t('dark')}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 backdrop-blur',
        'text-text hover:bg-input transition-colors',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
        className,
      )}
    >
      {/* Render both icons; reveal one to avoid layout shift. We only swap
          AFTER mount so SSR HTML matches client. */}
      {mounted ? (
        isDark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />
      ) : (
        <Moon size={16} aria-hidden />
      )}
    </button>
  );
}
