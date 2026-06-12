'use client';

// Phase 6.4 — <FleetPanel>. The shared read-only fleet-panel body used by BOTH
// the planista and the dyspozytor pages (docs/14-design-system.md §6.4 / §6.3).
//
// TEMPORARY PARITY (product-owner decision): planista and dyspozytor render an
// IDENTICAL panel for now — KPI strip + "stojące > 7 dni" highlight + a 4-tab
// surface (Auta / Wyjazdy / Kierowcy / Naczepy) over the shared read-only fleet
// sub-tables, with clickable rows opening read-only detail modals. The two
// roles WILL diverge later; this shared component is a convenience to avoid
// duplicating ~all the markup, NOT a contract. When they diverge, inline the
// relevant half back into the role page rather than over-parameterising here.
//
// `PlanistaFleetResponse` and `DyspozytorFleetResponse` now share the same
// shape (vehicles/drivers/trailers + `stats` + `stojaceList`), so the panel is
// typed over that common shape. Scope is server-side (JWT) for both the fleet
// query and the delegations query — no client filter params.
//
// Read-only throughout: a row click opens a VIEW modal (§6.4.2 / §6.4.1),
// never an edit surface. The panel owns the per-modal open + target state.

import {
  AlertTriangle,
  Car,
  Container,
  Gauge,
  PauseCircle,
  Truck,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import type {
  DelegationDto,
  DriverListItem,
  DyspozytorFleetStats,
  DyspozytorStojacyItem,
  TrailerListItem,
  VehicleListItem,
} from '@magguarantee/shared';

import { KpiCard } from '@/components/dashboard/KpiCard';
import { DelegationsTable } from '@/components/delegations/DelegationsTable';
import { FleetDriverDetailModal } from '@/components/fleet/FleetDriverDetailModal';
import {
  FleetDriversTable,
  FleetTrailersTable,
  FleetVehiclesTable,
} from '@/components/fleet/FleetTables';
import { FleetTrailerDetailModal } from '@/components/fleet/FleetTrailerDetailModal';
import { FleetVehicleDetailModal } from '@/components/fleet/FleetVehicleDetailModal';
import { ReadOnlyBanner } from '@/components/fleet/ReadOnlyBanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

/** The fleet payload the panel reads — shared by planista + dyspozytor. */
interface FleetData {
  vehicles: VehicleListItem[];
  drivers: DriverListItem[];
  trailers: TrailerListItem[];
  stats: DyspozytorFleetStats;
  stojaceList: DyspozytorStojacyItem[];
}

interface Props {
  /** Page heading. */
  title: string;
  /** Page sub-heading. */
  subtitle: string;
  /** Non-dismissible read-only banner message. */
  readOnlyBanner: string;
  /**
   * The role-scoped i18n namespace (`'planista'` or `'dyspozytor'`). Both
   * expose the SAME key shape (kpi/idle/tabs/vehicles/drivers/trailers/
   * delegations), so the panel reads them positionally and stays role-agnostic.
   */
  namespace: 'planista' | 'dyspozytor';
  /** Fleet payload (`undefined` while loading). */
  data: FleetData | undefined;
  /** Fleet query loading flag. */
  isLoading: boolean;
  /** Wyjazdy (delegations) list — server-scoped by JWT. */
  delegations: DelegationDto[];
  /** Delegations query loading flag. */
  delegationsLoading: boolean;
  /** Optional «Raport km» link target (the role's read-only km-report, §7.7). */
  kmReportHref?: string;
}

export function FleetPanel({
  title,
  subtitle,
  readOnlyBanner,
  namespace,
  data,
  isLoading,
  delegations,
  delegationsLoading,
  kmReportHref,
}: Props) {
  const t = useTranslations(namespace);
  const tKm = useTranslations('weryfikator.km');
  const tCommon = useTranslations('common');
  const tA11y = useTranslations('fleet.a11y');

  const stats = data?.stats;
  const idle = data?.stojaceList ?? [];

  // ── Per-modal open + target state (read-only VIEW surfaces) ───────────
  // The delegations VIEW modal lives inside <DelegationsTable> now; the panel
  // only owns the vehicle / driver / trailer modal targets.
  const [vehicleTarget, setVehicleTarget] = useState<VehicleListItem | null>(
    null,
  );
  const [driverTarget, setDriverTarget] = useState<DriverListItem | null>(null);
  const [trailerTarget, setTrailerTarget] = useState<TrailerListItem | null>(
    null,
  );

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {title}
          </h1>
          <p className="text-sm text-text-sub">{subtitle}</p>
        </div>
        {kmReportHref ? (
          <Link
            href={kmReportHref}
            className="inline-flex h-9 items-center gap-1.5 self-start rounded-[10px] border border-border bg-transparent px-3 text-[13px] font-bold text-text transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
          >
            <Gauge size={15} aria-hidden="true" />
            {tKm('title.report')}
          </Link>
        ) : null}
      </div>

      <ReadOnlyBanner message={readOnlyBanner} />

      {/* KPI strip — five tiles. Bucket→tone per DS §6.3.3 (no purple): totals
          neutral, JEŻDŻĄ green, STOJĄ>7DNI orange, KIEROWCY blue. Always
          rendered so the layout doesn't jump between loading states. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label={t('kpi.vehicles')}
          value={stats?.liczbaAut ?? 0}
          tone="neutral"
          icon={Truck}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.driving')}
          value={stats?.autaJezdzace ?? 0}
          tone="green"
          icon={Car}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.idle')}
          value={stats?.autaStojace7dni ?? 0}
          tone="orange"
          icon={PauseCircle}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.drivers')}
          value={stats?.liczbaKierowcow ?? 0}
          tone="blue"
          icon={User}
          loading={isLoading}
        />
        <KpiCard
          label={t('kpi.trailers')}
          value={stats?.liczbaNaczep ?? 0}
          tone="neutral"
          icon={Container}
          loading={isLoading}
        />
      </div>

      {/* "Stojące > 7 dni" warning sub-list — only when count > 0. DS §6.3.3:
          warning-toned panel (bg-warning/10 + border-warning/40), inert chips,
          meaning carried by icon + "X dni" text (not colour alone). */}
      {idle.length > 0 && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <AlertTriangle size={15} aria-hidden="true" />
            {t('idle.title')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {idle.map((v) => (
              <li key={v.plateNumber}>
                <span className="inline-flex items-center gap-1 rounded-sm border border-warning/40 bg-card px-2 py-0.5 text-xs font-medium text-text">
                  <span className="font-mono">{v.plateNumber}</span>
                  <span className="text-text-sub">
                    · {t('idle.daysIdle', { days: v.daysIdle })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Tabs defaultValue="vehicles" className="w-full">
        <TabsList aria-label={t('tabs.ariaLabel')} className="mb-4">
          <TabsTrigger value="vehicles">{t('tabs.vehicles')}</TabsTrigger>
          <TabsTrigger value="delegations">{t('tabs.delegations')}</TabsTrigger>
          <TabsTrigger value="drivers">{t('tabs.drivers')}</TabsTrigger>
          <TabsTrigger value="trailers">{t('tabs.trailers')}</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles">
          <FleetVehiclesTable
            rows={data?.vehicles ?? []}
            isLoading={isLoading}
            namespace={`${namespace}.vehicles`}
            onRowClick={setVehicleTarget}
            rowAriaLabel={(v) => tA11y('showDetails', { name: v.plateNumber })}
          />
        </TabsContent>

        <TabsContent value="delegations">
          <DelegationsTable
            rows={delegations}
            isLoading={delegationsLoading}
            namespace={`${namespace}.delegations`}
            loadingLabel={tCommon('loading')}
            rowAriaLabel={(r) =>
              tA11y('showDelegationDetails', {
                name: r.vehicle?.plateNumber ?? '—',
              })
            }
          />
        </TabsContent>

        <TabsContent value="drivers">
          <FleetDriversTable
            rows={data?.drivers ?? []}
            isLoading={isLoading}
            namespace={`${namespace}.drivers`}
            onRowClick={setDriverTarget}
            rowAriaLabel={(d) =>
              tA11y('showDetails', { name: `${d.firstName} ${d.lastName}` })
            }
          />
        </TabsContent>

        <TabsContent value="trailers">
          <FleetTrailersTable
            rows={data?.trailers ?? []}
            isLoading={isLoading}
            namespace={`${namespace}.trailers`}
            onRowClick={setTrailerTarget}
            rowAriaLabel={(tr) =>
              tA11y('showDetails', { name: tr.plateNumber })
            }
          />
        </TabsContent>
      </Tabs>

      {/* ── Read-only detail modals (§6.4.2 / §6.4.1) ───────────────────── */}
      <FleetVehicleDetailModal
        open={vehicleTarget !== null}
        onOpenChange={(o) => {
          if (!o) setVehicleTarget(null);
        }}
        vehicle={vehicleTarget}
      />
      <FleetDriverDetailModal
        open={driverTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDriverTarget(null);
        }}
        driver={driverTarget}
      />
      <FleetTrailerDetailModal
        open={trailerTarget !== null}
        onOpenChange={(o) => {
          if (!o) setTrailerTarget(null);
        }}
        trailer={trailerTarget}
      />
    </section>
  );
}
