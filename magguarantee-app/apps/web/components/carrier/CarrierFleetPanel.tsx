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
  AlertTriangle,
  Car,
  Check,
  Container,
  Mail,
  PauseCircle,
  SearchX,
  Truck,
  UserRound,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { DriverDto, TrailerDto, VehicleDto } from '@magguarantee/shared';

import { DriverDetailModal } from '@/components/drivers/DriverDetailModal';
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
import { useTrailers } from '@/lib/hooks/useTrailers';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';
import { useVehicles } from '@/lib/hooks/useVehicles';

/** 7 days in milliseconds — the single «stojące > 7 dni» cutoff. */
const IDLE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Valid in-page tab ids; also the values honoured via `?tab=`. */
type FleetTab = 'vehicles' | 'drivers' | 'trailers';
const TAB_VALUES: readonly FleetTab[] = ['vehicles', 'drivers', 'trailers'];

/** Compact boolean cell — a success check when set, em-dash otherwise. */
function PermitCell({ value, label }: { value: boolean | null | undefined; label: string }) {
  return value ? (
    <Check size={16} className="text-success" aria-label={label} />
  ) : (
    <span aria-hidden className="text-text-sub">
      —
    </span>
  );
}

export function CarrierFleetPanel() {
  const t = useTranslations('carrier.fleet');
  const tKpi = useTranslations('carrier.fleet.kpi');
  const tIdle = useTranslations('carrier.fleet.idle');
  const tTabs = useTranslations('carrier.fleetTabs');
  const tVehicles = useTranslations('carrier.fleet.vehicles');
  const tVehCols = useTranslations('carrier.fleet.vehicles.columns');
  const tDrivers = useTranslations('carrier.fleet.drivers');
  const tDrvCols = useTranslations('carrier.fleet.drivers.columns');
  const tTrailers = useTranslations('carrier.fleet.trailers');
  const tTrlCols = useTranslations('carrier.fleet.trailers.columns');
  const tCommon = useTranslations('common');
  const tA11y = useTranslations('fleet.a11y');

  // Honour `?tab=drivers|trailers` (set by the redirecting old sub-routes), else
  // default to «Auta». Uncontrolled afterwards — the user can switch freely.
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab: FleetTab = TAB_VALUES.includes(tabParam as FleetTab)
    ? (tabParam as FleetTab)
    : 'vehicles';

  // ── Fleet payloads — carrier-scoped server-side. High limit so the KPI
  //    counts + tables are complete (the KPI strip cannot paginate). ────────
  const vehiclesQ = useVehicles({ limit: 200 });
  const driversAllQ = useDrivers({ limit: 200 });
  const trailersAllQ = useTrailers({ limit: 200 });

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

  // ── KPI buckets (client-computed). «stojące > 7 dni» rule mirrors planista
  //    / Code.gs: a vehicle with NO lastDroveAt is assumed to be driving. A
  //    single cutoff is computed once. Only ACTIVE vehicles can be idle. ─────
  const kpi = useMemo(() => {
    const cutoff = Date.now() - IDLE_THRESHOLD_MS;
    let driving = 0;
    let idle = 0;
    const idleList: { plateNumber: string; daysIdle: number }[] = [];
    for (const v of vehicles) {
      if (!v.active) continue;
      const last = v.lastDroveAt ? new Date(v.lastDroveAt).getTime() : null;
      if (last !== null && last < cutoff) {
        idle += 1;
        idleList.push({
          plateNumber: v.plateNumber,
          daysIdle: Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000)),
        });
      } else {
        // No lastDroveAt OR within 7 days ⇒ assumed driving.
        driving += 1;
      }
    }
    idleList.sort((a, b) => b.daysIdle - a.daysIdle);
    return { driving, idle, idleList };
  }, [vehicles]);

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
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'side',
        header: tVehCols('side'),
        cell: (row) => row.sideNumber ?? '—',
      },
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
        id: 'active',
        header: tVehCols('status'),
        cell: (row) =>
          row.active ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
    ],
    [tVehCols, tCommon],
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

      {/* KPI strip — five tiles. Tones per DS §6.3.3: totals neutral, JEŻDŻĄ
          green, STOJĄ>7DNI orange, KIEROWCY blue. Always rendered so the layout
          doesn't jump between loading states. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard
          label={tKpi('vehicles')}
          value={vehicles.length}
          tone="neutral"
          icon={Truck}
          loading={vehiclesQ.isLoading}
        />
        <KpiCard
          label={tKpi('driving')}
          value={kpi.driving}
          tone="green"
          icon={Car}
          loading={vehiclesQ.isLoading}
        />
        <KpiCard
          label={tKpi('idle')}
          value={kpi.idle}
          tone="orange"
          icon={PauseCircle}
          loading={vehiclesQ.isLoading}
        />
        <KpiCard
          label={tKpi('drivers')}
          value={drivers.length}
          tone="blue"
          icon={User}
          loading={driversAllQ.isLoading}
        />
        <KpiCard
          label={tKpi('trailers')}
          value={trailers.length}
          tone="neutral"
          icon={Container}
          loading={trailersAllQ.isLoading}
        />
      </div>

      {/* «Stojące > 7 dni» warning sub-list — only when count > 0 (DS §6.3.3:
          warning-toned panel, inert chips, meaning carried by icon + «X dni»). */}
      {kpi.idleList.length > 0 && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <AlertTriangle size={15} aria-hidden />
            {tIdle('title')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {kpi.idleList.map((v) => (
              <li key={v.plateNumber}>
                <span className="inline-flex items-center gap-1 rounded-sm border border-warning/40 bg-card px-2 py-0.5 text-xs font-medium text-text">
                  <span className="font-mono">{v.plateNumber}</span>
                  <span className="text-text-sub">
                    · {tIdle('daysIdle', { days: v.daysIdle })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList aria-label={tTabs('ariaLabel')} className="mb-4">
          <TabsTrigger value="vehicles">{tTabs('vehicles')}</TabsTrigger>
          <TabsTrigger value="drivers">{tTabs('drivers')}</TabsTrigger>
          <TabsTrigger value="trailers">{tTabs('trailers')}</TabsTrigger>
        </TabsList>

        {/* ── Auta ──────────────────────────────────────────────────────── */}
        <TabsContent value="vehicles">
          <DataTable
            rows={vehicles}
            columns={vehicleColumns}
            rowKey={(r) => r.id}
            onRowClick={setVehicleTarget}
            rowAriaLabel={(r) => tA11y('showDetails', { name: r.plateNumber })}
            isLoading={vehiclesQ.isLoading}
            empty={
              <EmptyState
                icon={Truck}
                title={tVehicles('emptyTitle')}
                message={tVehicles('emptyMessage')}
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
