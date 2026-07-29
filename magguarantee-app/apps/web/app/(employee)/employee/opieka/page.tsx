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

import {
  Building2,
  CircleParking,
  HeartHandshake,
  PauseCircle,
  Trash2,
  Truck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { KpiCard } from '@/components/dashboard/KpiCard';
import { OpiekaTabsNav } from '@/components/opieka/OpiekaTabsNav';
import OpiekunCarrierCard, {
  OpiekunCarrierCardSkeleton,
} from '@/components/opieka/OpiekunCarrierCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useOpiekunFleet } from '@/lib/hooks/useOpiekunFleet';
import { vehiclesListHref } from '@/lib/vehicles-filter';

export default function OpiekaPage() {
  const t = useTranslations('opieka');
  const tVehStatus = useTranslations('vehicleStatus');
  const { data, isLoading } = useOpiekunFleet();

  const carriers = data?.carriers ?? [];
  const totals = data?.totals;

  // §6.3.6 — the AUTA tile is the ENABLED fleet (the four idle-clock buckets);
  // `wylaczone` is excluded, matching the dyspozytor/carrier strips.
  const v = totals?.vehicles;
  const autaEnabled = v
    ? v.aktywne + v.stojace + v.nieaktywne + v.doUsuniecia
    : 0;

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

      {/* Totals strip — Przewoźnicy + the delegation-driven 5-state vehicle ramp
          (§6.3.6): AUTA (enabled) · AKTYWNE · STOJĄCE · DŁUGO STOJĄCE · DO
          USUNIĘCIA. `potencjalne` is dropped; `wylaczone` is omitted here to
          keep the 6-tile grid (the Przewoźnicy tile occupies the 6th slot).
          Always rendered so the layout doesn't jump between loading states.

          §15 — every tile is a DRILL-DOWN link. The two totals open the plain
          lists (the counts are totals, not a filter the list can express); each
          status tile opens the vehicles list pre-filtered to that bucket via
          `?status=`, where the API applies the SAME classification that produced
          the count here — tile and list can't disagree. Both targets are
          ownership-scoped server-side, so an opiekun lands on their own set. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard
          label={t('totals.carriers')}
          value={totals?.liczbaPrzewoznikow ?? 0}
          tone="purple"
          icon={Building2}
          loading={isLoading}
          href="/employee/carriers"
          ariaLabel={t('totals.openCarriersAria', {
            count: totals?.liczbaPrzewoznikow ?? 0,
          })}
        />
        <KpiCard
          label={t('totals.vehicles')}
          value={autaEnabled}
          tone="neutral"
          icon={Truck}
          loading={isLoading}
          href={vehiclesListHref({})}
          ariaLabel={t('totals.openVehiclesAria', { count: autaEnabled })}
        />
        <KpiCard
          label={tVehStatus('aktywna.tile')}
          value={v?.aktywne ?? 0}
          tone="green"
          icon={Truck}
          loading={isLoading}
          href={vehiclesListHref({ status: 'aktywna' })}
          ariaLabel={t('totals.openStatusAria', {
            label: tVehStatus('aktywna.tile'),
            count: v?.aktywne ?? 0,
          })}
        />
        <KpiCard
          label={tVehStatus('stojaca.tile')}
          value={v?.stojace ?? 0}
          tone="neutral"
          icon={CircleParking}
          loading={isLoading}
          href={vehiclesListHref({ status: 'stojaca' })}
          ariaLabel={t('totals.openStatusAria', {
            label: tVehStatus('stojaca.tile'),
            count: v?.stojace ?? 0,
          })}
        />
        <KpiCard
          label={tVehStatus('nieaktywna.tile')}
          value={v?.nieaktywne ?? 0}
          tone="orange"
          icon={PauseCircle}
          loading={isLoading}
          href={vehiclesListHref({ status: 'nieaktywna' })}
          ariaLabel={t('totals.openStatusAria', {
            label: tVehStatus('nieaktywna.tile'),
            count: v?.nieaktywne ?? 0,
          })}
        />
        <KpiCard
          label={tVehStatus('do_usuniecia.tile')}
          value={v?.doUsuniecia ?? 0}
          tone="red"
          icon={Trash2}
          loading={isLoading}
          href={vehiclesListHref({ status: 'do_usuniecia' })}
          ariaLabel={t('totals.openStatusAria', {
            label: tVehStatus('do_usuniecia.tile'),
            count: v?.doUsuniecia ?? 0,
          })}
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
