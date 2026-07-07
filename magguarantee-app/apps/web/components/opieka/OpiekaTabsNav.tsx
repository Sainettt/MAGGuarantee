'use client';

// Phase 12 — secondary in-page nav for the opieka surface (docs/14 §12.4).
//
// A route-backed tab strip (Link-based, not the in-page <Tabs> state machine)
// shared by both `/employee/opieka` (Przewoźnicy — the carrier card grid) and
// `/employee/opieka/porozumienia` (the watchdog compliance board). Real routes
// keep the board deep-linkable and back-button friendly; the strip only styles
// the active/inactive pill off the current pathname.
//
// Rendered identically for opiekun and admin — both reach the same routes and
// the API scopes what each sees. No role branching here.

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const TABS = [
  { key: 'tabCarriers', href: '/employee/opieka' },
  { key: 'tabAgreements', href: '/employee/opieka/porozumienia' },
] as const;

export function OpiekaTabsNav() {
  const t = useTranslations('guarantee.board');
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('tabsAriaLabel')}
      className="mb-6 flex items-center gap-1 border-b border-border"
    >
      {TABS.map((tab) => {
        // Exact match for the carriers root; prefix match for the board so any
        // nested drill-down keeps the correct tab lit.
        const active =
          tab.href === '/employee/opieka'
            ? pathname === '/employee/opieka'
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 rounded-sm',
              active
                ? 'border-brand text-brand'
                : 'border-transparent text-text-sub hover:text-text',
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
