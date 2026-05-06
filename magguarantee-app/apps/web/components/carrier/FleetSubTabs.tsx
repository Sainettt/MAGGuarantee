'use client';

// Phase 3 — sub-nav rendered inside `/carrier/fleet/*` pages. Per docs/14 §
// Phase 3: "Auta (read-only) / Kierowcy (CRUD) / Naczepy (CRUD)" with the
// uppercase-tracked label style.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

interface SubTab {
  href: string;
  label: string;
}

const SUBTABS: readonly SubTab[] = [
  { href: '/carrier/fleet/vehicles', label: 'Auta' },
  { href: '/carrier/fleet/drivers', label: 'Kierowcy' },
  { href: '/carrier/fleet/trailers', label: 'Naczepy' },
];

export function FleetSubTabs() {
  const pathname = usePathname();

  return (
    <div
      role="tablist"
      aria-label="Fleet sections"
      className="border-b border-border bg-card/40"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto">
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
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
