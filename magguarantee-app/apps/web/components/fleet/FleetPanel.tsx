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
  CircleParking,
  Gauge,
  PauseCircle,
  Trash2,
  Truck,
  Users,
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
import { PlanistaVehicleDetailModal } from '@/components/fleet/PlanistaVehicleDetailModal';
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
  /**
   * Optional «Moje pojazdy — przebieg» link target — the §7.8 multi-carrier
   * read-only km tab (the more-presentable, grouped, full-fleet sibling of the
   * §7.7.7 report). Label reuses the `myKm.tab` key. This is the SINGLE km tab
   * planista/dyspozytor expose; the duplicate §7.7.7 «Raport km» link was
   * removed (its route was deleted).
   */
  myKmHref?: string;
  /**
   * When `true` (planista), a vehicle-row click opens the FULL admin-style
   * <VehicleDetailModal> (incl. «Stawki» rates + «Opiekun»), fetched by id from
   * the slim row's `id`. Default `false` (dyspozytor) keeps the slim
   * <FleetVehicleDetailModal>. Only the vehicle modal differs — driver/trailer
   * modals are identical for both roles.
   */
  fullVehicleDetail?: boolean;
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
  myKmHref,
  fullVehicleDetail = false,
}: Props) {
  const t = useTranslations(namespace);
  const tVehStatus = useTranslations('vehicleStatus');
  const tMyKm = useTranslations('myKm');
  const tA11y = useTranslations('fleet.a11y');

  const stats = data?.stats;
  const idle = data?.stojaceList ?? [];

  // §6.3.6 — the AUTA tile is the ENABLED fleet (the four idle-clock buckets
  // partition it); `wylaczona` vehicles are excluded from these counts.
  const autaTotal = stats
    ? stats.aktywne + stats.stojace + stats.nieaktywne + stats.doUsuniecia
    : 0;

  // Two-tier needs-attention watchlist (§6.3.6): «Do usunięcia» (≥29 dni,
  // danger) is the genuine act-now set; «Długo stojące» (15–28 dni, warning)
  // is the softer watchlist. Both come off the single needs-attention list.
  const removeList = idle.filter((v) => v.status === 'do_usuniecia');
  const longIdleList = idle.filter((v) => v.status === 'nieaktywna');

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
        {myKmHref ? (
          <div className="flex flex-wrap items-center gap-2 self-start">
            <Link
              href={myKmHref}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-transparent px-3 text-[13px] font-bold text-text transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
            >
              <Gauge size={15} aria-hidden="true" />
              {tMyKm('tab')}
            </Link>
          </div>
        ) : null}
      </div>

      <ReadOnlyBanner message={readOnlyBanner} />

      {/* Inert resource sub-line — kierowcy / naczepy moved OUT of the hero KPI
          strip (§6.3.6); the strip is now a focused 5-state vehicle ramp. */}
      {stats ? (
        <p className="-mt-4 mb-6 flex items-center gap-1.5 text-xs text-text-sub">
          <Users size={13} aria-hidden="true" />
          {t('resources', {
            drivers: stats.liczbaKierowcow,
            trailers: stats.liczbaNaczep,
          })}
        </p>
      ) : null}

      {/* KPI strip — the delegation-driven 5-state vehicle ramp (§6.3.6). Two
          neutral tiles by design (AUTA total + STOJĄCE calm); only the problem
          states pop — DŁUGO STOJĄCE amber, DO USUNIĘCIA red, AKTYWNE green
          (capacity). Always rendered so the layout doesn't jump. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label={t('kpi.vehicles')}
          value={autaTotal}
          tone="neutral"
          icon={Truck}
          loading={isLoading}
        />
        <KpiCard
          label={tVehStatus('aktywna.tile')}
          value={stats?.aktywne ?? 0}
          tone="green"
          icon={Truck}
          loading={isLoading}
        />
        <KpiCard
          label={tVehStatus('stojaca.tile')}
          value={stats?.stojace ?? 0}
          tone="neutral"
          icon={CircleParking}
          loading={isLoading}
        />
        <KpiCard
          label={tVehStatus('nieaktywna.tile')}
          value={stats?.nieaktywne ?? 0}
          tone="orange"
          icon={PauseCircle}
          loading={isLoading}
        />
        <KpiCard
          label={tVehStatus('do_usuniecia.tile')}
          value={stats?.doUsuniecia ?? 0}
          tone="red"
          icon={Trash2}
          loading={isLoading}
        />
      </div>

      {/* «Do usunięcia» highlight (§6.3.6) — the removal-eligible set (≥29 dni).
          Danger-toned (border-danger/40 + bg-danger/10 + Trash2), inert chips;
          meaning carried by icon + "X dni" text, not colour alone. */}
      {removeList.length > 0 && (
        <div className="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-danger">
            <Trash2 size={15} aria-hidden="true" />
            {t('needsAttention.removeTitle')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {removeList.map((v) => (
              <li key={v.plateNumber}>
                <span className="inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-card px-2 py-0.5 text-xs font-medium text-text">
                  <span className="font-mono">{v.plateNumber}</span>
                  <span className="text-text-sub">
                    · {t('needsAttention.days', { days: v.daysSinceReturn })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* «Długo stojące» secondary watchlist (§6.3.6) — 15–28 dni, warning-toned
          (border-warning/40 + bg-warning/10 + PauseCircle). */}
      {longIdleList.length > 0 && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <PauseCircle size={15} aria-hidden="true" />
            {t('needsAttention.longIdleTitle')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {longIdleList.map((v) => (
              <li key={v.plateNumber}>
                <span className="inline-flex items-center gap-1 rounded-sm border border-warning/40 bg-card px-2 py-0.5 text-xs font-medium text-text">
                  <span className="font-mono">{v.plateNumber}</span>
                  <span className="text-text-sub">
                    · {t('needsAttention.days', { days: v.daysSinceReturn })}
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
      {/* Vehicle modal — planista gets the FULL admin-style detail (rates +
          opiekun), fetched by id; dyspozytor stays on the slim list-item modal.
          Open/close wiring is identical for both. */}
      {fullVehicleDetail ? (
        <PlanistaVehicleDetailModal
          open={vehicleTarget !== null}
          onOpenChange={(o) => {
            if (!o) setVehicleTarget(null);
          }}
          vehicleId={vehicleTarget?.id ?? null}
        />
      ) : (
        <FleetVehicleDetailModal
          open={vehicleTarget !== null}
          onOpenChange={(o) => {
            if (!o) setVehicleTarget(null);
          }}
          vehicle={vehicleTarget}
        />
      )}
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
