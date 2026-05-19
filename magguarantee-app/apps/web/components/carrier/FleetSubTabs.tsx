'use client';

// Phase 3 — sub-nav rendered inside `/carrier/fleet/*` pages. Per docs/14 §
// Phase 3: "Auta (read-only) / Kierowcy (CRUD) / Naczepy (CRUD)" with the
// uppercase-tracked label style.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

interface SubTab {
  href: string;
  /** i18n key under `carrier.fleetTabs.*`. */
  labelKey: 'vehicles' | 'drivers' | 'trailers';
}

const SUBTABS: readonly SubTab[] = [
  { href: '/carrier/fleet/vehicles', labelKey: 'vehicles' },
  { href: '/carrier/fleet/drivers', labelKey: 'drivers' },
  { href: '/carrier/fleet/trailers', labelKey: 'trailers' },
];

export function FleetSubTabs() {
  const pathname = usePathname();
  const t = useTranslations('carrier.fleetTabs');

  return (
    <div
      role="tablist"
      aria-label={t('ariaLabel')}
      className="border-b border-border bg-card/40"
    >
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 flex items-center gap-1 overflow-x-auto">
        {SUBTABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={cn(
                'inline-flex items-center px-3 py-2 text-xs font-bold uppercase tracking-wider whitespace-nowrap',
                'border-b-2 -mb-px transition-colors',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 rounded-sm',
                active
                  ? 'text-brand border-brand'
                  : 'text-text-sub border-transparent hover:text-text',
              )}
            >
              {t(tab.labelKey)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
