'use client';

// §7.10.2 — weryfikator now has TWO screens: the km-board (§7.7) and the new
// delegation-status board (§7.10). The spec calls for the Phase 6.3 in-page
// `<Tabs>` bar (this overrides the §7.5 "single screen, no tabs" note now that
// the role has a second destination).
//
// We use a ROUTE-based tab bar (not in-page `<Tabs>` state) because each screen
// is its own route with its own URL state — the km-board owns `?week=` and is a
// heavy island, the wyjazdy board owns filter state. A route-based bar keeps
// both deep-linkable + back-button friendly while presenting the same two-tab
// chrome. It mirrors the <Tabs>/<TabsList> styling (`role="tab"`, brand
// underline on the active tab, arrow-key roving) for a11y parity.

import { Gauge, MapPin, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';

import { useActiveNavRefresh } from '@/lib/hooks/useActiveNavRefresh';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/weryfikator/km', key: 'km', icon: Gauge },
  { href: '/weryfikator/delegations', key: 'delegations', icon: MapPin },
] as const;

export function WeryfikatorTabsNav() {
  const t = useTranslations('weryfikator.tabs');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);

  // Повторный клик по активной вкладке = рефреш её данных (docs/14 §14).
  const { isRefreshing, onActiveNavClick } = useActiveNavRefresh();

  const activeIndex = TABS.findIndex((tab) => pathname.startsWith(tab.href));

  return (
    <div className="px-4 sm:px-6 lg:px-10 xl:px-12 pt-6">
      <div
        role="tablist"
        aria-label={t('ariaLabel')}
        className="flex items-center gap-1 border-b border-border"
      >
        {TABS.map((tab, idx) => {
          const selected = idx === activeIndex;
          const spinning = selected && isRefreshing;
          const Icon = spinning ? RefreshCw : tab.icon;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              title={selected ? tCommon('refreshHint') : undefined}
              aria-busy={spinning || undefined}
              onClick={selected ? onActiveNavClick : undefined}
              ref={(el) => {
                refs.current[idx] = el;
              }}
              onKeyDown={(e) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                  return;
                }
                e.preventDefault();
                let next = idx;
                if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
                else if (e.key === 'ArrowLeft')
                  next = (idx - 1 + TABS.length) % TABS.length;
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = TABS.length - 1;
                refs.current[next]?.focus();
              }}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 rounded-sm',
                selected
                  ? 'border-brand text-brand'
                  : 'border-transparent text-text-sub hover:text-text',
              )}
            >
              <Icon
                size={15}
                aria-hidden="true"
                className={cn(spinning && 'animate-spin')}
              />
              {t(tab.key)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
