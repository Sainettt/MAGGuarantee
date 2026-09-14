'use client';

// 2026-06-26 — `<CarrierFleetPanel>`. The unified, planista-style carrier fleet
// surface (docs/14-design-system.md «Carrier fleet panel (unified,
// planista-style)»). Replaces the three cramped route-based pages
// (`/carrier/fleet/{vehicles,drivers,trailers}`) + the retired `<FleetSubTabs>`
// with ONE full-width page: a 5-tile KPI strip + an optional «stojące > 7 dni»
// highlight + in-page `<Tabs>` (Auta / Kierowcy / Naczepy) over read-only
// `<DataTable>`s, mirroring the planista panel (§6.3) as its visual reference.
//
// READ-ONLY throughout: a row click opens a VIEW modal (vehicles → the full
// `<VehicleDetailModal>` with `hideCarrier`; drivers / trailers → their detail
// modals), never an edit surface — carriers are backend-locked out of fleet
// mutations, so no create/edit/delete affordance appears here.
//
// The carrier already holds its FULL `VehicleDto` / `DriverDto` / `TrailerDto`
// payload (the existing carrier-scoped hooks), so the five KPI counts are
// computed CLIENT-SIDE — no API change, no new endpoint.

import {
  CircleParking,
  Container,
  Mail,
  PauseCircle,
  SearchX,
  Trash2,
  Truck,
  UserRound,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type {
  DriverDto,
  GuaranteeComplianceItem,
  TrailerDto,
  VehicleDto,
  VehicleLifecycleStatus,
} from '@magguarantee/shared';

import { GuaranteeCountdownBadge } from '@/components/carrier/GuaranteeCountdownBadge';
import { VehicleStatusBadge } from '@/components/carrier/VehicleStatusBadge';
import { DriverDetailModal } from '@/components/drivers/DriverDetailModal';
import { PermitCell } from '@/components/fleet/PermitCell';
import { VehicleStatusFilterBar } from '@/components/fleet/VehicleStatusFilterBar';
import { TrailerDetailModal } from '@/components/trailers/TrailerDetailModal';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { VehicleDetailModal } from '@/components/vehicles/VehicleDetailModal';
import { formatDateFull } from '@/lib/format/numbers';
import { useDrivers } from '@/lib/hooks/useDrivers';
import { useMyGuaranteeCompliance } from '@/lib/hooks/useGuarantee';
import { useTrailers } from '@/lib/hooks/useTrailers';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';
import { useVehicles } from '@/lib/hooks/useVehicles';
import { queryErrorProps } from '@/lib/query/queryErrorProps';

/** Valid in-page tab ids; also the values honoured via `?tab=`. */
type FleetTab = 'vehicles' | 'drivers' | 'trailers';
const TAB_VALUES: readonly FleetTab[] = ['vehicles', 'drivers', 'trailers'];

export function CarrierFleetPanel() {
  const t = useTranslations('carrier.fleet');
  const tKpi = useTranslations('carrier.fleet.kpi');
  const tVehStatus = useTranslations('vehicleStatus');
  const tTabs = useTranslations('carrier.fleetTabs');
  const tVehicles = useTranslations('carrier.fleet.vehicles');
  const tVehCols = useTranslations('carrier.fleet.vehicles.columns');
  const tDrivers = useTranslations('carrier.fleet.drivers');
  const tDrvCols = useTranslations('carrier.fleet.drivers.columns');
  const tTrailers = useTranslations('carrier.fleet.trailers');
  const tTrlCols = useTranslations('carrier.fleet.trailers.columns');
  const tCommon = useTranslations('common');
  const tA11y = useTranslations('fleet.a11y');
  const tGuarantee = useTranslations('guarantee.fleet');
  const tVeh = useTranslations('vehicles');

  const tFilter = useTranslations('fleet.statusFilter');

  // Honour `?tab=drivers|trailers` (set by the redirecting old sub-routes), else
  // default to «Auta». Controlled from here on: a KPI-tile filter (§15) pulls
  // the user back onto «Auta» so the click always has a visible effect.
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<FleetTab>(
    TAB_VALUES.includes(tabParam as FleetTab)
      ? (tabParam as FleetTab)
      : 'vehicles',
  );

  // ── KPI-tile drill-down (§15) — in-page filter over the «Auta» table. The
  //    carrier has no admin vehicles route to link out to, so the tile toggles;
  //    pressing the applied tile again clears it. ─────────────────────────────
  const [statusFilter, setStatusFilter] =
    useState<VehicleLifecycleStatus | null>(null);
  const toggleStatus = (status: VehicleLifecycleStatus) => {
    setStatusFilter((prev) => (prev === status ? null : status));
    setTab('vehicles');
  };

  // ── Fleet payloads — carrier-scoped server-side. High limit so the KPI
  //    counts + tables are complete (the KPI strip cannot paginate). ────────
  const vehiclesQ = useVehicles({ limit: 200 });
  const driversAllQ = useDrivers({ limit: 200 });
  const trailersAllQ = useTrailers({ limit: 200 });

  // ── Phase 12 — guarantee-watchdog compliance for the carrier's own fleet.
  //    Keyed by vehicleId, joined onto the «Auta» rows for the GWARANCJA
  //    column (§12.3). A vehicle absent from `/me` is not guaranteed → dash.
  const complianceQ = useMyGuaranteeCompliance();
  const guaranteeByVehicle = useMemo(() => {
    const map = new Map<string, GuaranteeComplianceItem>();
    for (const item of complianceQ.data?.items ?? []) {
      map.set(item.vehicleId, item);
    }
    return map;
  }, [complianceQ.data]);

  const vehicles = useMemo(
    () => vehiclesQ.data?.items ?? [],
    [vehiclesQ.data],
  );
  const drivers = useMemo(
    () => driversAllQ.data?.items ?? [],
    [driversAllQ.data],
  );
  const trailers = useMemo(
    () => trailersAllQ.data?.items ?? [],
    [trailersAllQ.data],
  );

  // ── KPI buckets (client-computed) — the delegation-driven 5-state ramp
  //    (§6.3.6). Each vehicle already carries a server-computed
  //    `lifecycleStatus` + `daysSinceReturn`, so the carrier strip counts by
  //    status (no `lastDroveAt` arithmetic). AUTA = the ENABLED fleet (the four
  //    idle-clock buckets); `wylaczona` is excluded. The needs-attention set is
  //    split into «Do usunięcia» (≥29 dni) + «Długo stojące» (15–28 dni). ─────
  const kpi = useMemo(() => {
    let aktywne = 0;
    let stojace = 0;
    let nieaktywne = 0;
    let doUsuniecia = 0;
    const removeList: { plateNumber: string; days: number }[] = [];
    const longIdleList: { plateNumber: string; days: number }[] = [];
    for (const v of vehicles) {
      switch (v.lifecycleStatus) {
        case 'aktywna':
          aktywne += 1;
          break;
        case 'stojaca':
          stojace += 1;
          break;
        case 'nieaktywna':
          nieaktywne += 1;
          longIdleList.push({
            plateNumber: v.plateNumber,
            days: v.daysSinceReturn ?? 0,
          });
          break;
        case 'do_usuniecia':
          doUsuniecia += 1;
          removeList.push({
            plateNumber: v.plateNumber,
            days: v.daysSinceReturn ?? 0,
          });
          break;
        // `wylaczona` — excluded from the enabled counts + idle clock.
      }
    }
    removeList.sort((a, b) => b.days - a.days);
    longIdleList.sort((a, b) => b.days - a.days);
    const total = aktywne + stojace + nieaktywne + doUsuniecia;
    return { total, aktywne, stojace, nieaktywne, doUsuniecia, removeList, longIdleList };
  }, [vehicles]);

  const shownVehicles = useMemo(
    () =>
      statusFilter
        ? vehicles.filter((v) => v.lifecycleStatus === statusFilter)
        : vehicles,
    [vehicles, statusFilter],
  );

  // ── Per-tab filter controls (preserve the legacy per-entity search/filter) ─
  const [driverSearch, setDriverSearch] = useState('');
  const [trailerSearch, setTrailerSearch] = useState('');
  const [trailerTypeId, setTrailerTypeId] = useState('');
  const typesQ = useTrailerTypes({ active: true });

  const driverQ = driverSearch.trim().toLowerCase();
  const filteredDrivers = useMemo(() => {
    if (driverQ.length < 2) return drivers;
    return drivers.filter((d) =>
      `${d.firstName} ${d.lastName}`.toLowerCase().includes(driverQ),
    );
  }, [drivers, driverQ]);

  const trailerQ = trailerSearch.trim().toLowerCase();
  const filteredTrailers = useMemo(() => {
    return trailers.filter((tr) => {
      if (trailerTypeId && tr.trailerType?.id !== trailerTypeId) return false;
      if (trailerQ.length >= 2 && !tr.plateNumber.toLowerCase().includes(trailerQ))
        return false;
      return true;
    });
  }, [trailers, trailerQ, trailerTypeId]);

  // ── Read-only detail modals (vehicles / drivers / trailers) ──────────────
  const [vehicleTarget, setVehicleTarget] = useState<VehicleDto | null>(null);
  const [driverTarget, setDriverTarget] = useState<DriverDto | null>(null);
  const [trailerTarget, setTrailerTarget] = useState<TrailerDto | null>(null);

  // ── «Auta» columns — enriched, the carrier holds the full VehicleDto ─────
  const vehicleColumns = useMemo<DataTableColumn<VehicleDto>[]>(
    () => [
      {
        id: 'plate',
        header: tVehCols('plate'),
        cell: (row) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold">{row.plateNumber}</span>
            {row.agreementScanMissing && (
              <Badge variant="warning">{tVeh('agreementScanMissing')}</Badge>
            )}
          </span>
        ),
      },
      {
        id: 'fuelCard',
        header: tVeh('fields.fuelCard'),
        align: 'center',
        cell: (row) =>
          row.fuelCard ? (
            row.fuelCardBlocked ? (
              <Badge variant="danger">{tVeh('fuelCardStatus.blocked')}</Badge>
            ) : (
              <Badge variant="success">{tVeh('fuelCardStatus.active')}</Badge>
            )
          ) : (
            <span className="text-text-sub">—</span>
          ),
      },
      // «Numer boczny» column removed (§12.8) — the internal MAGTRANS
      // designation must never surface to a carrier (same gating as the
      // §12.3.2 status rows / §12.7 episode history / vehicle detail modal).
      {
        id: 'type',
        header: tVehCols('type'),
        cell: (row) => row.type ?? '—',
      },
      {
        id: 'euro',
        header: tVehCols('euro'),
        align: 'center',
        cell: (row) =>
          row.euro ? <Badge variant="muted">{row.euro}</Badge> : '—',
      },
      {
        id: 'adr',
        header: tVehCols('adr'),
        align: 'center',
        cell: (row) =>
          row.adr ? <Badge variant="warning">ADR</Badge> : <span className="text-text-sub">—</span>,
      },
      {
        id: 'gb',
        header: tVehCols('gb'),
        align: 'center',
        cell: (row) => <PermitCell value={row.gb} label={tVehCols('gb')} />,
      },
      {
        id: 'it',
        header: tVehCols('it'),
        align: 'center',
        cell: (row) => <PermitCell value={row.it} label={tVehCols('it')} />,
      },
      {
        id: 'fr',
        header: tVehCols('fr'),
        align: 'center',
        cell: (row) => <PermitCell value={row.fr} label={tVehCols('fr')} />,
      },
      {
        id: 'lastDroveAt',
        header: tVehCols('lastDroveAt'),
        cell: (row) => (
          <span className="tabular-nums">{formatDateFull(row.lastDroveAt)}</span>
        ),
      },
      {
        // Vehicle-status rework §6.3.6 — delegation-driven lifecycle badge
        // (the old active/inactive flag is retired; `active=false` surfaces as
        // «Wyłączona»). Numer boczny stays hidden — the badge exposes no
        // internal designation.
        id: 'status',
        header: tVehCols('status'),
        cell: (row) => (
          <VehicleStatusBadge
            status={row.lifecycleStatus}
            daysSinceReturn={row.daysSinceReturn}
          />
        ),
      },
      {
        // Phase 12 — GWARANCJA watchdog cell (§12.3). Right-most, grouped with
        // STATUS as an oversight signal. Information-only: the row click still
        // opens the read-only detail modal; the actionable CTA lives in the
        // banner. Non-guaranteed vehicles (absent from `/me`) show a dash.
        id: 'guarantee',
        header: tGuarantee('column'),
        cell: (row) => {
          const g = guaranteeByVehicle.get(row.id);
          if (!g) return <span className="text-text-sub">—</span>;
          if (g.state === 'inactive') {
            return <Badge variant="muted">{tGuarantee('inactive')}</Badge>;
          }
          if (g.state === 'ok_active') {
            return <Badge variant="success">{tGuarantee('active')}</Badge>;
          }
          // counting / violated → worded countdown chip (its own tone).
          return <GuaranteeCountdownBadge daysLeft={g.daysLeft ?? 0} />;
        },
      },
    ],
    [tVehCols, tVeh, tGuarantee, guaranteeByVehicle],
  );

  const driverColumns = useMemo<DataTableColumn<DriverDto>[]>(
    () => [
      {
        id: 'name',
        header: tDrvCols('name'),
        cell: (row) => (
          <span className="font-semibold">
            {row.firstName} {row.lastName}
          </span>
        ),
      },
      {
        id: 'phone',
        header: tDrvCols('phone'),
        cell: (row) => row.phone ?? '—',
      },
      {
        id: 'idDocument',
        header: tDrvCols('idDocument'),
        cell: (row) => row.idDocumentNumber ?? '—',
      },
      {
        id: 'active',
        header: tDrvCols('status'),
        cell: (row) =>
          row.active ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
    ],
    [tDrvCols, tCommon],
  );

  const trailerColumns = useMemo<DataTableColumn<TrailerDto>[]>(
    () => [
      {
        id: 'plate',
        header: tTrlCols('plate'),
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'type',
        header: tTrlCols('type'),
        cell: (row) =>
          row.trailerType?.shortCode
            ? `[${row.trailerType.shortCode}] ${row.trailerType.name}`
            : (row.trailerType?.name ?? '—'),
      },
      {
        id: 'active',
        header: tTrlCols('status'),
        cell: (row) =>
          row.active ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
    ],
    [tTrlCols, tCommon],
  );

  const mailtoSubject = encodeURIComponent(t('contactOpiekunSubject'));

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {t('title')}
          </h1>
          <p className="text-sm text-text-sub">{t('subtitle')}</p>
        </div>
        <a
          href={`mailto:opiekun@magtrans.eu?subject=${mailtoSubject}`}
          className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-brand hover:text-brand-dark"
        >
          <Mail size={14} aria-hidden />
          {t('contactOpiekun')}
        </a>
      </div>

      {/* Inert resource sub-line — kierowcy / naczepy moved OUT of the hero KPI
          strip (§6.3.6); the strip is now a focused 5-state vehicle ramp. */}
      <p className="mb-4 flex items-center gap-1.5 text-xs text-text-sub">
        <Users size={13} aria-hidden />
        {t('resources', { drivers: drivers.length, trailers: trailers.length })}
      </p>

      {/* KPI strip — the delegation-driven 5-state vehicle ramp (§6.3.6), 100%
          client-computed from the full VehicleDto payload the carrier holds.
          Two neutral tiles (AUTA total + STOJĄCE calm); only problem states pop
          — DŁUGO STOJĄCE amber, DO USUNIĘCIA red, AKTYWNE green. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {/* AUTA doubles as the reset tile (§15). */}
        <KpiCard
          label={tKpi('vehicles')}
          value={kpi.total}
          tone="neutral"
          icon={Truck}
          loading={vehiclesQ.isLoading}
          onClick={() => {
            setStatusFilter(null);
            setTab('vehicles');
          }}
          selected={statusFilter === null}
          ariaLabel={tFilter('showAllAria', { count: kpi.total })}
        />
        <KpiCard
          label={tVehStatus('aktywna.tile')}
          value={kpi.aktywne}
          tone="green"
          icon={Truck}
          loading={vehiclesQ.isLoading}
          onClick={() => toggleStatus('aktywna')}
          selected={statusFilter === 'aktywna'}
          ariaLabel={tFilter('toggleAria', {
            label: tVehStatus('aktywna.tile'),
            count: kpi.aktywne,
          })}
        />
        <KpiCard
          label={tVehStatus('stojaca.tile')}
          value={kpi.stojace}
          tone="neutral"
          icon={CircleParking}
          loading={vehiclesQ.isLoading}
          onClick={() => toggleStatus('stojaca')}
          selected={statusFilter === 'stojaca'}
          ariaLabel={tFilter('toggleAria', {
            label: tVehStatus('stojaca.tile'),
            count: kpi.stojace,
          })}
        />
        <KpiCard
          label={tVehStatus('nieaktywna.tile')}
          value={kpi.nieaktywne}
          tone="orange"
          icon={PauseCircle}
          loading={vehiclesQ.isLoading}
          onClick={() => toggleStatus('nieaktywna')}
          selected={statusFilter === 'nieaktywna'}
          ariaLabel={tFilter('toggleAria', {
            label: tVehStatus('nieaktywna.tile'),
            count: kpi.nieaktywne,
          })}
        />
        <KpiCard
          label={tVehStatus('do_usuniecia.tile')}
          value={kpi.doUsuniecia}
          tone="red"
          icon={Trash2}
          loading={vehiclesQ.isLoading}
          onClick={() => toggleStatus('do_usuniecia')}
          selected={statusFilter === 'do_usuniecia'}
          ariaLabel={tFilter('toggleAria', {
            label: tVehStatus('do_usuniecia.tile'),
            count: kpi.doUsuniecia,
          })}
        />
      </div>

      {/* «Do usunięcia» highlight (§6.3.6) — removal-eligible set (≥29 dni),
          danger-toned; inert chips, meaning carried by icon + «X dni» text. */}
      {kpi.removeList.length > 0 && (
        <div className="mb-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-danger">
            <Trash2 size={15} aria-hidden />
            {t('needsAttention.removeTitle')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {kpi.removeList.map((v) => (
              <li key={v.plateNumber}>
                <span className="inline-flex items-center gap-1 rounded-sm border border-danger/40 bg-card px-2 py-0.5 text-xs font-medium text-text">
                  <span className="font-mono">{v.plateNumber}</span>
                  <span className="text-text-sub">
                    · {t('needsAttention.days', { days: v.days })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* «Długo stojące» secondary watchlist (§6.3.6) — 15–28 dni, warning. */}
      {kpi.longIdleList.length > 0 && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <PauseCircle size={15} aria-hidden />
            {t('needsAttention.longIdleTitle')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {kpi.longIdleList.map((v) => (
              <li key={v.plateNumber}>
                <span className="inline-flex items-center gap-1 rounded-sm border border-warning/40 bg-card px-2 py-0.5 text-xs font-medium text-text">
                  <span className="font-mono">{v.plateNumber}</span>
                  <span className="text-text-sub">
                    · {t('needsAttention.days', { days: v.days })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as FleetTab)}
        className="w-full"
      >
        <TabsList aria-label={tTabs('ariaLabel')} className="mb-4">
          <TabsTrigger value="vehicles">{tTabs('vehicles')}</TabsTrigger>
          <TabsTrigger value="drivers">{tTabs('drivers')}</TabsTrigger>
          <TabsTrigger value="trailers">{tTabs('trailers')}</TabsTrigger>
        </TabsList>

        {/* ── Auta ──────────────────────────────────────────────────────── */}
        <TabsContent value="vehicles">
          {statusFilter && (
            <VehicleStatusFilterBar
              status={statusFilter}
              count={shownVehicles.length}
              onClear={() => setStatusFilter(null)}
            />
          )}
          <DataTable
            rows={shownVehicles}
            columns={vehicleColumns}
            rowKey={(r) => r.id}
            onRowClick={setVehicleTarget}
            rowAriaLabel={(r) => tA11y('showDetails', { name: r.plateNumber })}
            isLoading={vehiclesQ.isLoading}
            {...queryErrorProps(vehiclesQ)}
            hasActiveFilters={statusFilter !== null}
            empty={
              <EmptyState
                icon={Truck}
                title={tVehicles('emptyTitle')}
                message={tVehicles('emptyMessage')}
              />
            }
            emptyFiltered={
              <EmptyState
                icon={SearchX}
                title={tFilter('emptyTitle')}
                message={tFilter('emptyMessage')}
              />
            }
          />
        </TabsContent>

        {/* ── Kierowcy ──────────────────────────────────────────────────── */}
        <TabsContent value="drivers">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              type="search"
              className="h-10 sm:max-w-xs"
              placeholder={tDrivers('searchPlaceholder')}
              value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)}
            />
          </div>
          <DataTable
            rows={filteredDrivers}
            columns={driverColumns}
            rowKey={(r) => r.id}
            onRowClick={setDriverTarget}
            rowAriaLabel={(r) =>
              tA11y('showDetails', { name: `${r.firstName} ${r.lastName}` })
            }
            isLoading={driversAllQ.isLoading}
            {...queryErrorProps(driversAllQ)}
            hasActiveFilters={driverQ.length >= 2}
            empty={
              <EmptyState
                icon={UserRound}
                title={tDrivers('emptyTitle')}
                message={tDrivers('emptyMessage')}
              />
            }
            emptyFiltered={
              <EmptyState
                icon={SearchX}
                title={tDrivers('emptyFiltered.title')}
                message={tDrivers('emptyFiltered.message')}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDriverSearch('')}
                  >
                    {tCommon('clearFilters')}
                  </Button>
                }
              />
            }
          />
        </TabsContent>

        {/* ── Naczepy ───────────────────────────────────────────────────── */}
        <TabsContent value="trailers">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              type="search"
              className="h-10 sm:max-w-xs"
              placeholder={tTrailers('searchPlaceholder')}
              value={trailerSearch}
              onChange={(e) => setTrailerSearch(e.target.value)}
            />
            <Select
              className="sm:max-w-xs"
              value={trailerTypeId}
              onChange={(e) => setTrailerTypeId(e.target.value)}
              aria-label={tTrailers('filterByType')}
            >
              <option value="">{tTrailers('allTypes')}</option>
              {(typesQ.data ?? []).map((tt) => (
                <option key={tt.id} value={tt.id}>
                  {tt.shortCode ? `[${tt.shortCode}] ` : ''}
                  {tt.name}
                </option>
              ))}
            </Select>
          </div>
          <DataTable
            rows={filteredTrailers}
            columns={trailerColumns}
            rowKey={(r) => r.id}
            onRowClick={setTrailerTarget}
            rowAriaLabel={(r) => tA11y('showDetails', { name: r.plateNumber })}
            isLoading={trailersAllQ.isLoading}
            {...queryErrorProps(trailersAllQ)}
            hasActiveFilters={Boolean(trailerQ.length >= 2 || trailerTypeId)}
            empty={
              <EmptyState
                icon={Container}
                title={tTrailers('emptyTitle')}
                message={tTrailers('emptyMessage')}
              />
            }
            emptyFiltered={
              <EmptyState
                icon={SearchX}
                title={tTrailers('emptyFiltered.title')}
                message={tTrailers('emptyFiltered.message')}
                action={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTrailerSearch('');
                      setTrailerTypeId('');
                    }}
                  >
                    {tCommon('clearFilters')}
                  </Button>
                }
              />
            }
          />
        </TabsContent>
      </Tabs>

      {/* ── Read-only detail modals ─────────────────────────────────────── */}
      <VehicleDetailModal
        open={vehicleTarget !== null}
        onOpenChange={(o) => {
          if (!o) setVehicleTarget(null);
        }}
        vehicle={vehicleTarget}
        hideCarrier
      />
      <DriverDetailModal
        open={driverTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDriverTarget(null);
        }}
        driver={driverTarget}
      />
      <TrailerDetailModal
        open={trailerTarget !== null}
        onOpenChange={(o) => {
          if (!o) setTrailerTarget(null);
        }}
        trailer={trailerTarget}
      />
    </section>
  );
}
