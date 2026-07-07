'use client';

// Phase 5 — opiekun dashboard.
//
// Lists every carrier under the caller's supervision (or every carrier when
// the caller is admin) together with the four-bucket vehicle classification
// (jezdzące / stojące / nieaktywne / potencjalne) and a pre-aggregated totals
// strip up top. Backed by `GET /fleet/opiekun` — see
// `packages/shared/src/schemas/fleet.ts` for the full DTO shape.
//
// Page-level role gating is handled by the parent `/employee/layout.tsx`
// (admin + pracownik + opiekun all reach this layout); the API itself returns
// 403 for any other role, so we don't add a redundant guard here. Pracownik
// can technically resolve this URL but their nav doesn't show it; they would
// see a generic «failed to load» state — acceptable for now since direct
// typing is the only way to land here.
//
// Phase 5.2 redesign — carriers are now rendered as a responsive card grid
// (see `<OpiekunCarrierCard>`) instead of an 8-column DataTable. The KPI
// strip above is unchanged. Whole-card click navigates to the drill-down at
// `/employee/opieka/carriers/[login]` for a per-entity (vehicles / drivers /
// trailers) read-only inspection view.

import { Building2, Car, CircleSlash2, HeartHandshake, Plus, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { KpiCard } from '@/components/dashboard/KpiCard';
import { OpiekaTabsNav } from '@/components/opieka/OpiekaTabsNav';
import OpiekunCarrierCard, {
  OpiekunCarrierCardSkeleton,
} from '@/components/opieka/OpiekunCarrierCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useOpiekunFleet } from '@/lib/hooks/useOpiekunFleet';

export default function OpiekaPage() {
  const t = useTranslations('opieka');
  const { data, isLoading } = useOpiekunFleet();

  const carriers = data?.carriers ?? [];
  const totals = data?.totals;

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="text-sm text-text-sub">{t('subtitle')}</p>
      </div>

      {/* Phase 12 — secondary nav: Przewoźnicy (this grid) / Porozumienia
          (watchdog board). Route-backed so both tabs are deep-linkable. */}
      <OpiekaTabsNav />

      {/* Totals strip — six KPI tiles. Always rendered so the layout doesn't
          jump between loading / loaded states; values fall back to 0 while
          fetching and the cards show their own skeleton. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard
          label={t('totals.carriers')}
          value={totals?.liczbaPrzewoznikow ?? 0}
          tone="purple"
          icon={Building2}
          loading={isLoading}
        />
        <KpiCard
          label={t('totals.totalVehicles')}
          value={totals?.vehicles.total ?? 0}
          tone="neutral"
          icon={Truck}
          loading={isLoading}
        />
        <KpiCard
          label={t('totals.jezdzace')}
          value={totals?.vehicles.jezdzace ?? 0}
          tone="green"
          icon={Car}
          loading={isLoading}
        />
        <KpiCard
          label={t('totals.stojace')}
          value={totals?.vehicles.stojace ?? 0}
          tone="orange"
          icon={Car}
          loading={isLoading}
        />
        <KpiCard
          label={t('totals.nieaktywne')}
          value={totals?.vehicles.nieaktywne ?? 0}
          tone="red"
          icon={CircleSlash2}
          loading={isLoading}
        />
        <KpiCard
          label={t('totals.potencjalne')}
          value={totals?.vehicles.potencjalne ?? 0}
          tone="blue"
          icon={Plus}
          loading={isLoading}
        />
      </div>

      {/* Carrier list — Phase 5.2 card grid. Loading renders 6 skeleton
          cards in the same grid layout; empty state replaces the grid
          entirely (per docs/14 § 5.2.7). */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <OpiekunCarrierCardSkeleton key={i} />
          ))}
        </div>
      ) : carriers.length === 0 ? (
        <EmptyState
          icon={HeartHandshake}
          title={t('emptyTitle')}
          message={t('emptyMessage')}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {carriers.map((carrier) => (
            <OpiekunCarrierCard key={carrier.carrierId} carrier={carrier} />
          ))}
        </div>
      )}
    </section>
  );
}
