'use client';

// Phase 3 — top-level tab nav for the carrier shell. Per docs/14 § Phase 3
// "Carrier shell": Wnioski / Nowy / Flota / Wyjazdy / Porozumienie / Przebieg
// with emoji prefixes (per project voice rules), plus — last, only for a
// carrier granted `carrier_documents.read` (docs/25 B6, docs/14 B.1 / B.2) —
// «Dokumenty». `Flota` matches `/carrier/fleet/*` so the sub-tabs inside fleet
// keep the parent active. The tab list lives in `./carrierTabsConfig.ts`.
//
// «Dokumenty» follows the EFFECTIVE permissions of `/auth/me` (per-user, so
// the edge does not gate it): a grant or a revocation shows up at the next
// `/auth/me` refresh; `/carrier/dokumenty` re-checks on the server.

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { carrierDocumentsCarrierId } from '@/lib/auth/carrierDocuments';
import { useActiveNavRefresh } from '@/lib/hooks/useActiveNavRefresh';
import { useAuth } from '@/lib/hooks/useAuth';
import { useMyGuaranteeCompliance } from '@/lib/hooks/useGuarantee';
import { cn } from '@/lib/utils';

import { carrierTabsFor } from './carrierTabsConfig';

export function CarrierTabs() {
  const pathname = usePathname();
  const t = useTranslations('carrier.tabs');
  const tMyKm = useTranslations('myKm');
  const tCommon = useTranslations('common');
  const tGuarantee = useTranslations('guarantee.tab');

  // Повторный клик по активной вкладке = рефреш её данных (docs/14 §14).
  const { isRefreshing, onActiveNavClick } = useActiveNavRefresh();

  // «Dokumenty» — panel.carrier ∧ carrier_documents.read ∧ an own company
  // (admin, who also reaches this shell, never qualifies).
  const { user } = useAuth();
  const tabs = carrierTabsFor(user !== null && carrierDocumentsCarrierId(user) !== null);

  // Attention badge on «Porozumienie» — owed vehicles (violated + dueSoon) from
  // the SAME cached `/me` query the strip + cards read (`GUARANTEE_KEY`), so a
  // reported wyjazd shrinks it on the next refetch with no extra fetch. Hidden
  // at 0 and while loading (`summary` undefined) — silence is good (§12.3.1).
  const { data: guaranteeData, isLoading: guaranteeLoading } =
    useMyGuaranteeCompliance();
  const owedViolated = guaranteeData?.summary.violated ?? 0;
  const owedDueSoon = guaranteeData?.summary.dueSoon ?? 0;
  const owedCount = owedViolated + owedDueSoon;
  const showGuaranteeBadge = !guaranteeLoading && owedCount > 0;

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
        {tabs.map((tab) => {
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

          const isPorozumienie = tab.labelKey === 'porozumienie';
          const withBadge = isPorozumienie && showGuaranteeBadge;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              // When the attention badge is shown, fold its count into the tab's
              // accessible name so it's announced as words, never colour alone.
              aria-label={
                withBadge
                  ? tGuarantee('badgeAria', { count: owedCount })
                  : undefined
              }
              title={active ? tCommon('refreshHint') : undefined}
              aria-busy={(active && isRefreshing) || undefined}
              onClick={active ? onActiveNavClick : undefined}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap',
                'border-b-2 -mb-px transition-colors',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 rounded-sm',
                active
                  ? 'text-brand border-brand'
                  : 'text-text-sub border-transparent hover:text-text',
              )}
            >
              {active && isRefreshing ? (
                <RefreshCw size={14} className="animate-spin" aria-hidden />
              ) : (
                <span aria-hidden>{tab.emoji}</span>
              )}
              {tab.labelKey === 'km' ? tMyKm('tab') : t(tab.labelKey)}
              {withBadge ? (
                <span
                  aria-hidden
                  className={cn(
                    'ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1',
                    'rounded-full text-[11px] font-bold text-white',
                    owedViolated > 0 ? 'bg-danger' : 'bg-warning',
                  )}
                >
                  {owedCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
