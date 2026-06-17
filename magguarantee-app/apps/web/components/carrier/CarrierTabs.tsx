'use client';

// Phase 3 — top-level tab nav for the carrier shell. Per docs/14 § Phase 3
// "Carrier shell": Wnioski / Nowy / Flota / Wyjazdy with emoji prefixes (per
// project voice rules). `Flota` matches `/carrier/fleet/*` so the sub-tabs
// inside fleet keep the parent active.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface Tab {
  href: string;
  /** Match `pathname.startsWith(matchPrefix)` for active state. */
  matchPrefix: string;
  emoji: string;
  /** i18n key — `carrier.tabs.*` except `myKm` which reuses the `myKm.tab` key. */
  labelKey: 'claims' | 'newClaim' | 'fleet' | 'delegations' | 'km';
}

const TABS: readonly Tab[] = [
  {
    href: '/carrier/claims',
    matchPrefix: '/carrier/claims',
    emoji: '📋',
    labelKey: 'claims',
  },
  {
    href: '/carrier/claims/new',
    matchPrefix: '/carrier/claims/new',
    emoji: '➕',
    labelKey: 'newClaim',
  },
  {
    href: '/carrier/fleet/vehicles',
    matchPrefix: '/carrier/fleet',
    emoji: '🚛',
    labelKey: 'fleet',
  },
  {
    href: '/carrier/delegations',
    matchPrefix: '/carrier/delegations',
    emoji: '🗺️',
    labelKey: 'delegations',
  },
  // Phase 7.8 — «Przebieg» (docs/14 §7.8): the read-only weekly km tab scoped
  // to the carrier's own vehicles. Label reuses the `myKm.tab` key.
  {
    href: '/carrier/km',
    matchPrefix: '/carrier/km',
    emoji: '📈',
    labelKey: 'km',
  },
];

export function CarrierTabs() {
  const pathname = usePathname();
  const t = useTranslations('carrier.tabs');
  const tMyKm = useTranslations('myKm');

  return (
    <nav
      aria-label={t('ariaLabel')}
      // App-chrome layer (`z-20`) — same family as the global <Header>, which
      // sits at `top-0 z-20` while this nav sits at `top-16`, so they never
      // vertically overlap. The previous `z-10` tied with the in-page
      // DataTable's sticky `<thead>` (also `z-10`); since the table comes later
      // in DOM order the tie broke in its favour and the scrolling table painted
      // OVER the nav. Lifting the nav to `z-20` keeps app-chrome strictly above
      // page content (`z-10`).
      className="sticky top-16 z-20 bg-card/90 backdrop-blur border-b border-border"
    >
      {/* `overflow-y-hidden` pins the cross-axis: `overflow-x-auto` alone makes
          the browser compute `overflow-y: auto`, and the active tab's
          `border-b-2 -mb-px` spills 1px past the content box — enough to summon
          a stray vertical scrollbar on the nav. Horizontal tab-scroll on narrow
          viewports is preserved. */}
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 flex items-center gap-1 overflow-x-auto overflow-y-hidden">
        {TABS.map((tab) => {
          // `Wnioski` is `/carrier/claims` but `Nowy` is `/carrier/claims/new`
          // — give the more specific match priority so the user clearly
          // sees which tab they're on.
          const isNew = tab.href === '/carrier/claims/new';
          const isList = tab.href === '/carrier/claims';
          let active = pathname === tab.href;
          if (!active) {
            if (isNew) {
              active = pathname.startsWith('/carrier/claims/new');
            } else if (isList) {
              active =
                pathname.startsWith('/carrier/claims') &&
                !pathname.startsWith('/carrier/claims/new');
            } else {
              active = pathname.startsWith(tab.matchPrefix);
            }
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap',
                'border-b-2 -mb-px transition-colors',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 rounded-sm',
                active
                  ? 'text-brand border-brand'
                  : 'text-text-sub border-transparent hover:text-text',
              )}
            >
              <span aria-hidden>{tab.emoji}</span>
              {tab.labelKey === 'km' ? tMyKm('tab') : t(tab.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
