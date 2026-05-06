'use client';

// Phase 3 — top-level tab nav for the carrier shell. Per docs/14 § Phase 3
// "Carrier shell": Wnioski / Nowy / Flota / Wyjazdy with emoji prefixes (per
// project voice rules). `Flota` matches `/carrier/fleet/*` so the sub-tabs
// inside fleet keep the parent active.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

interface Tab {
  href: string;
  /** Match `pathname.startsWith(matchPrefix)` for active state. */
  matchPrefix: string;
  emoji: string;
  label: string;
}

const TABS: readonly Tab[] = [
  {
    href: '/carrier/claims',
    matchPrefix: '/carrier/claims',
    emoji: '📋',
    label: 'Wnioski',
  },
  {
    href: '/carrier/claims/new',
    matchPrefix: '/carrier/claims/new',
    emoji: '➕',
    label: 'Nowy',
  },
  {
    href: '/carrier/fleet/vehicles',
    matchPrefix: '/carrier/fleet',
    emoji: '🚛',
    label: 'Flota',
  },
  {
    href: '/carrier/delegations',
    matchPrefix: '/carrier/delegations',
    emoji: '🚀',
    label: 'Wyjazdy',
  },
];

export function CarrierTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Carrier sections"
      className="sticky top-16 z-10 bg-card/90 backdrop-blur border-b border-border"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto">
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
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
