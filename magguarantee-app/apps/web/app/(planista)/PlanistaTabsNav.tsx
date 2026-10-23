'use client';

// docs/14 §17.4.2 (D2) — the planista shell's route-based tab bar, a copy of
// the <WeryfikatorTabsNav> recipe (role="tablist", arrow / Home / End roving,
// click on the active tab = refresh its data, §14).
//
//   Flota             /planista                 everyone in the shell
//   Przebieg          /planista/moje-pojazdy    everyone in the shell
//   Moje wnioski      /planista/przekazania     role === 'planista'
//   Do zatwierdzenia  /planista/zatwierdzenia   role === 'planista' &&
//                                               vehicles.planner_transfer.decide
//
// Admin (debug access to the shell) sees only Flota / Przebieg: both his
// decisions and his own requests (the «Moje wnioski» tab there, docs/14
// §17.5.8 / D9) live in /employee/przekazania. The lider tab is decided on the
// CLIENT from the user's effective permissions (`/auth/me` — a planista gets
// `decide` through the leader flag, docs/25 §3 B4): the edge middleware knows
// nothing about leadership (the JWT carries the role only, docs/28 §9.2 #18).
// It is the first menu entry that depends on the flag (docs/29 §4).
//
// «Do zatwierdzenia» carries the pending pill: the rows this lider can decide
// (§17.4.3), `bg-warning-dark text-white` (D8 — 5.2:1), hidden at 0 / loading.

import {
  ArrowLeftRight,
  ClipboardCheck,
  Gauge,
  RefreshCw,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';

import { useActiveNavRefresh } from '@/lib/hooks/useActiveNavRefresh';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCan } from '@/lib/hooks/useCan';
import { usePendingDecideCount } from '@/lib/hooks/usePlannerTransfers';
import { cn } from '@/lib/utils';

interface PlanistaTab {
  key: 'fleet' | 'km' | 'myTransfers' | 'approvals';
  href: string;
  icon: LucideIcon;
  /** `/planista` must not light up for its children. */
  exact?: boolean;
}

const FLEET: PlanistaTab = { key: 'fleet', href: '/planista', icon: Truck, exact: true };
const KM: PlanistaTab = { key: 'km', href: '/planista/moje-pojazdy', icon: Gauge };
const MY_TRANSFERS: PlanistaTab = {
  key: 'myTransfers',
  href: '/planista/przekazania',
  icon: ArrowLeftRight,
};
const APPROVALS: PlanistaTab = {
  key: 'approvals',
  href: '/planista/zatwierdzenia',
  icon: ClipboardCheck,
};

export function PlanistaTabsNav() {
  const t = useTranslations('planista.nav');
  const tMyKm = useTranslations('myKm');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const { user } = useAuth();
  const { isRefreshing, onActiveNavClick } = useActiveNavRefresh();

  // scope: the two transfer tabs are the PLANISTA's own screens — the admin
  // (who may decide too) works in /employee/przekazania instead.
  const isPlanista = user?.role === 'planista';
  const canDecide = useCan('vehicles.planner_transfer.decide');
  const isLider = isPlanista && canDecide;
  const tabs: PlanistaTab[] = [
    FLEET,
    KM,
    ...(isPlanista ? [MY_TRANSFERS] : []),
    ...(isLider ? [APPROVALS] : []),
  ];

  const approvalsCount = usePendingDecideCount({ enabled: isLider });

  const activeIndex = tabs.findIndex((tab) =>
    tab.exact
      ? pathname === tab.href
      : pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );

  const label = (tab: PlanistaTab): string =>
    tab.key === 'km' ? tMyKm('tab') : t(tab.key);

  return (
    <div className="mx-auto max-w-screen-2xl px-4 pt-6 sm:px-6 lg:px-10 xl:px-12">
      <div
        role="tablist"
        aria-label={t('ariaLabel')}
        className="flex items-center gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((tab, idx) => {
          const selected = idx === activeIndex;
          const spinning = selected && isRefreshing;
          const Icon = spinning ? RefreshCw : tab.icon;
          const count =
            tab.key === 'approvals' && approvalsCount !== undefined && approvalsCount > 0
              ? approvalsCount
              : null;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              role="tab"
              aria-selected={selected}
              // Roving tabindex; with no active tab (unknown child route) the
              // first one stays reachable.
              tabIndex={selected || (activeIndex === -1 && idx === 0) ? 0 : -1}
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
                if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
                else if (e.key === 'ArrowLeft')
                  next = (idx - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = tabs.length - 1;
                refs.current[next]?.focus();
              }}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
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
              {label(tab)}
              {count !== null ? (
                <span
                  className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-warning-dark px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums text-white"
                  aria-label={t('approvalsBadge', { count })}
                  title={t('approvalsBadge', { count })}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default PlanistaTabsNav;
