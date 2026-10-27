'use client';

// Phase 5 — opiekun drill-down for a single carrier.
//
// Client view of the route; the route's own `page.tsx` (same directory) gates
// it server-side with `requirePermission('panel.opiekun', { onDenied:
// 'forbidden' })`, mirrored at the edge by the `/employee/opieka` rule
// (`PATH_PERMISSIONS` in `lib/roles.ts`) — UWAGI #17.
//
// Route: `/employee/opieka/carriers/[login]`. We use the login (not the UUID)
// in the URL so the path is human-readable for opiekuni who know their
// carriers by login. The carrier UUID is then resolved client-side from the
// cached `/fleet/opiekun` response (the opiekun came from the list page, so
// the data is hot in the TanStack Query cache; refetch falls back gracefully
// if the user landed here directly).
//
// Why we don't add a `GET /carriers/by-login/:login` endpoint: it would
// duplicate the ownership scoping logic that `OpiekunService.listMyCarriers`
// already encodes, and the resolve-then-`getCarrier(id)` flow is one round
// trip in the warm-cache case (zero, actually — the list is cached) and two
// in the cold case. Acceptable for a navigation drill-down.
//
// The three sub-tables (Auta / Kierowcy / Naczepy) reuse the existing
// vehicles / drivers / trailers list endpoints scoped via `?carrierId=...`.
// Each renders the same `<DataTable>` columns as the admin tables, minus the
// edit / delete actions — opieka is a read-only oversight surface (carriers
// are edited from `/employee/carriers` if at all).

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type {
  CarrierDto,
  DriverDto,
  TrailerDto,
  VehicleDto,
} from '@magguarantee/shared';

import { VehicleStatusBadge } from '@/components/carrier/VehicleStatusBadge';
import { CarrierDocumentsTab } from '@/components/documents/CarrierDocumentsTab';
import { DelegationsTable } from '@/components/delegations/DelegationsTable';
import { DriverDetailModal } from '@/components/drivers/DriverDetailModal';
import { PermitCell } from '@/components/fleet/PermitCell';
import { TrailerDetailModal } from '@/components/trailers/TrailerDetailModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { VehicleDetailModal } from '@/components/vehicles/VehicleDetailModal';
import { CarrierPorozumieniaTab } from './CarrierPorozumieniaTab';
import { formatDateFull } from '@/lib/format/numbers';
import { listDrivers } from '@/lib/api/drivers';
import { listTrailers } from '@/lib/api/trailers';
import { listVehicles } from '@/lib/api/vehicles';
import { useCarrier } from '@/lib/hooks/useCarriers';
import { useDelegations } from '@/lib/hooks/useDelegations';
import { DRIVERS_KEY } from '@/lib/hooks/useDrivers';
import { useOpiekunFleet } from '@/lib/hooks/useOpiekunFleet';
import { TRAILERS_KEY } from '@/lib/hooks/useTrailers';
import { VEHICLES_KEY } from '@/lib/hooks/useVehicles';
import {
  queryErrorProps,
  type QueryErrorProps,
} from '@/lib/query/queryErrorProps';

export default function OpiekunCarrierDetailView() {
  const params = useParams<{ login: string }>();
  const login = decodeURIComponent(params.login ?? '');
  const t = useTranslations('opieka');
  const tCommon = useTranslations('common');
  const tHistory = useTranslations('guarantee.history');
  const tA11y = useTranslations('fleet.a11y');

  // Honour `?tab=porozumienia` (set by the board deep-link) as the initial
  // tab; else default to «Auta». Uncontrolled afterwards.
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const VALID_TABS = [
    'vehicles',
    'drivers',
    'trailers',
    'delegations',
    'documents',
    'porozumienia',
  ];
  const defaultTab = VALID_TABS.includes(tabParam ?? '')
    ? (tabParam as string)
    : 'vehicles';

  // Resolve login → carrierId from the cached opiekun fleet response. This is
  // already populated when the user clicked through from the list page; on a
  // cold load it fetches once and we wait for it.
  const fleetQ = useOpiekunFleet();
  const carrierStub = useMemo(
    () => fleetQ.data?.carriers.find((c) => c.login === login) ?? null,
    [fleetQ.data, login],
  );

  // Full carrier DTO (opiekun + identity headings, payment terms, etc.). Only
  // enabled once we have the id from the fleet response — `useCarrier`
  // already guards on a missing id, but being explicit keeps the wait state
  // single-source-of-truth.
  const carrierQ = useCarrier(carrierStub?.carrierId);

  // Sub-table data — filtered by carrierId server-side. Each list endpoint
  // already enforces opiekun ownership when the caller is an opiekun; admin
  // sees everything (also acceptable on this page).
  //
  // We don't reuse the `useVehicles/useDrivers/useTrailers` hooks directly:
  // they always fire, and an undefined `carrierId` would silently widen the
  // scope to "every vehicle the caller can see" — wrong for a per-carrier
  // drill-down. Instead we use `useQuery` with `enabled` so the call only
  // fires once we've resolved the id from the fleet stub.
  const carrierId = carrierStub?.carrierId;
  const enabled = Boolean(carrierId);

  const vehiclesQ = useQuery({
    queryKey: [...VEHICLES_KEY, 'list', { carrierId, limit: 100 }],
    queryFn: () => listVehicles({ carrierId, limit: 100 }),
    enabled,
  });
  const driversQ = useQuery({
    queryKey: [...DRIVERS_KEY, 'list', { carrierId, limit: 100 }],
    queryFn: () => listDrivers({ carrierId, limit: 100 }),
    enabled,
  });
  const trailersQ = useQuery({
    queryKey: [...TRAILERS_KEY, 'list', { carrierId, limit: 100 }],
    queryFn: () => listTrailers({ carrierId, limit: 100 }),
    enabled,
  });
  // «Wyjazdy» — same `enabled` gate as above: firing before `carrierId`
  // resolves would return every delegation the opiekun can see, not this
  // carrier's. Read-only — the shared <DelegationsTable> owns the row-click →
  // <DelegationDetailModal> (§6.4.1) and has no mutation controls.
  const delegationsQ = useDelegations({ carrierId, limit: 100 }, { enabled });

  const carrier: CarrierDto | undefined = carrierQ.data;

  // Read-only detail modals — one selected target per sub-table. We derive the
  // `open` flag from a non-null target (a single source of truth) so closing
  // the modal both hides it and clears the selection. `onEdit` is intentionally
  // omitted everywhere: opieka is an oversight surface, so the modal footer is
  // «Zamknij»-only (§6.6).
  const [vehicleDetail, setVehicleDetail] = useState<VehicleDto | null>(null);
  const [driverDetail, setDriverDetail] = useState<DriverDto | null>(null);
  const [trailerDetail, setTrailerDetail] = useState<TrailerDto | null>(null);

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      {/* Back link — kept visible while the page loads so the user is never
          stranded in a half-rendered detail view. */}
      <div className="mb-4">
        <Link
          href="/employee/opieka"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-dark"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          {t('detail.backToList')}
        </Link>
      </div>

      {/* Header — identity. Falls back through a defined hierarchy until the
          full carrier DTO arrives, so the heading isn't blank for the brief
          moment we only have the fleet-stub row. */}
      <header className="mb-6">
        {fleetQ.isLoading ? (
          <Skeleton className="h-9 w-72" />
        ) : fleetQ.isError && !fleetQ.data ? (
          <div className="rounded-xl border border-border bg-card shadow-card">
            <ErrorState {...queryErrorProps(fleetQ)} />
          </div>
        ) : !carrierStub ? (
          <EmptyState
            title={t('detail.notFoundTitle')}
            message={t('detail.notFoundMessage')}
          />
        ) : (
          <div className="rounded-xl border border-border border-l-2 border-l-brand bg-card shadow-card px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-text leading-tight">
                {carrier?.company ??
                  carrierStub.firma ??
                  carrierStub.nazwa ??
                  carrierStub.login}
              </h1>
              {(carrier?.active ?? carrierStub.aktywny) ? (
                <Badge variant="success">{tCommon('active')}</Badge>
              ) : (
                <Badge variant="muted">{tCommon('inactive')}</Badge>
              )}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-text-sub">
                    {t('detail.loginLabel')}
                  </dt>
                  <dd className="font-mono text-sm text-text">
                    {carrierStub.login}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-text-sub">
                    {t('detail.nipLabel')}
                  </dt>
                  <dd className="font-mono tabular-nums text-sm text-text">
                    {carrierStub.nip}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-text-sub">
                    {t('detail.opiekunLabel')}
                  </dt>
                  <dd className="text-sm text-text">
                    {carrier?.opiekun?.name ?? carrier?.opiekun?.login ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </header>

      {carrierStub && (
        <Tabs defaultValue={defaultTab} className="w-full">
          <TabsList aria-label={t('tabs.ariaLabel')} className="mb-4">
            <TabsTrigger value="vehicles">{t('tabs.vehicles')}</TabsTrigger>
            <TabsTrigger value="drivers">{t('tabs.drivers')}</TabsTrigger>
            <TabsTrigger value="trailers">{t('tabs.trailers')}</TabsTrigger>
            <TabsTrigger value="delegations">
              {t('tabs.delegations')}
            </TabsTrigger>
            <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
            <TabsTrigger value="porozumienia">{tHistory('tab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles">
            <VehiclesTable
              rows={vehiclesQ.data?.items ?? []}
              isLoading={vehiclesQ.isLoading}
              {...queryErrorProps(vehiclesQ)}
              onRowClick={setVehicleDetail}
            />
          </TabsContent>

          <TabsContent value="drivers">
            <DriversTable
              rows={driversQ.data?.items ?? []}
              isLoading={driversQ.isLoading}
              {...queryErrorProps(driversQ)}
              onRowClick={setDriverDetail}
            />
          </TabsContent>

          <TabsContent value="trailers">
            <TrailersTable
              rows={trailersQ.data?.items ?? []}
              isLoading={trailersQ.isLoading}
              {...queryErrorProps(trailersQ)}
              onRowClick={setTrailerDetail}
            />
          </TabsContent>

          <TabsContent value="delegations">
            <DelegationsTable
              rows={delegationsQ.data?.items ?? []}
              isLoading={delegationsQ.isLoading}
              {...queryErrorProps(delegationsQ)}
              namespace="opieka.delegations"
              rowAriaLabel={(r) =>
                tA11y('showDelegationDetails', {
                  name: r.vehicle?.plateNumber ?? '—',
                })
              }
            />
          </TabsContent>

          {carrierId && (
            <TabsContent value="documents">
              <CarrierDocumentsTab carrierId={carrierId} />
            </TabsContent>
          )}

          {carrierId && (
            <TabsContent value="porozumienia">
              <CarrierPorozumieniaTab carrierId={carrierId} />
            </TabsContent>
          )}
        </Tabs>
      )}

      {carrierQ.isError && carrierStub && (
        <div className="mt-4">
          <EmptyState
            title={t('detail.errorTitle')}
            message={t('detail.errorMessage')}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => carrierQ.refetch()}
              >
                {t('detail.retry')}
              </Button>
            }
          />
        </div>
      )}

      {/* Read-only detail modals. `open` is derived from a non-null target; on
          close we clear the target so the next click re-opens cleanly. No
          `onEdit` → footer is «Zamknij»-only. */}
      <VehicleDetailModal
        open={vehicleDetail !== null}
        onOpenChange={(o) => {
          if (!o) setVehicleDetail(null);
        }}
        vehicle={vehicleDetail}
      />
      <DriverDetailModal
        open={driverDetail !== null}
        onOpenChange={(o) => {
          if (!o) setDriverDetail(null);
        }}
        driver={driverDetail}
      />
      <TrailerDetailModal
        open={trailerDetail !== null}
        onOpenChange={(o) => {
          if (!o) setTrailerDetail(null);
        }}
        trailer={trailerDetail}
      />
    </section>
  );
}

// ─── Sub-tables (read-only) ─────────────────────────────────
//
// We do NOT pull in the admin VehiclesView / DriversView / TrailersView
// components because those are interactive (edit Sheet, hard-delete dialog,
// filters tied to admin-only carrier dropdowns). Instead, we render the same
// DataTable primitive with a curated read-only column set — same row height,
// same hover state, same a11y guarantees.

interface VehiclesTableProps extends Partial<QueryErrorProps> {
  rows: VehicleDto[];
  isLoading: boolean;
  onRowClick?: (row: VehicleDto) => void;
}

function VehiclesTable({
  rows,
  isLoading,
  onRowClick,
  ...errorProps
}: VehiclesTableProps) {
  const t = useTranslations('opieka.vehicles');

  const columns = useMemo<DataTableColumn<VehicleDto>[]>(
    () => [
      {
        id: 'plate',
        header: t('columns.plate'),
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'side',
        header: t('columns.side'),
        cell: (row) => row.sideNumber ?? '—',
      },
      {
        id: 'type',
        header: t('columns.type'),
        cell: (row) => row.type ?? '—',
      },
      {
        id: 'euro',
        header: t('columns.euro'),
        align: 'center',
        cell: (row) =>
          row.euro ? <Badge variant="muted">{row.euro}</Badge> : '—',
      },
      {
        id: 'adr',
        header: t('columns.adr'),
        align: 'center',
        cell: (row) =>
          row.adr ? (
            <Badge variant="warning">ADR</Badge>
          ) : (
            <span className="text-text-sub">—</span>
          ),
      },
      {
        id: 'gb',
        header: t('columns.gb'),
        align: 'center',
        cell: (row) => <PermitCell value={row.gb} label={t('columns.gb')} />,
      },
      {
        id: 'it',
        header: t('columns.it'),
        align: 'center',
        cell: (row) => <PermitCell value={row.it} label={t('columns.it')} />,
      },
      {
        id: 'fr',
        header: t('columns.fr'),
        align: 'center',
        cell: (row) => <PermitCell value={row.fr} label={t('columns.fr')} />,
      },
      {
        id: 'lastDroveAt',
        header: t('columns.lastDroveAt'),
        cell: (row) => (
          <span className="tabular-nums">{formatDateFull(row.lastDroveAt)}</span>
        ),
      },
      {
        // Vehicle-status rework §6.3.6 — delegation-driven lifecycle badge
        // (retires the active/inactive flag; `active=false` → «Wyłączona»).
        id: 'status',
        header: t('columns.active'),
        width: 'tight',
        cell: (row) => (
          <VehicleStatusBadge
            status={row.lifecycleStatus}
            daysSinceReturn={row.daysSinceReturn}
          />
        ),
      },
    ],
    [t],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={onRowClick}
      rowAriaLabel={(r) => r.plateNumber}
      isLoading={isLoading}
      {...errorProps}
      empty={
        <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
      }
    />
  );
}

interface DriversTableProps extends Partial<QueryErrorProps> {
  rows: DriverDto[];
  isLoading: boolean;
  onRowClick?: (row: DriverDto) => void;
}

function DriversTable({
  rows,
  isLoading,
  onRowClick,
  ...errorProps
}: DriversTableProps) {
  const t = useTranslations('opieka.drivers');
  const tCommon = useTranslations('common');

  const columns = useMemo<DataTableColumn<DriverDto>[]>(
    () => [
      {
        id: 'name',
        header: t('columns.name'),
        cell: (row) => (
          <span className="font-semibold">
            {row.firstName} {row.lastName}
          </span>
        ),
      },
      {
        id: 'phone',
        header: t('columns.phone'),
        cell: (row) => row.phone ?? '—',
      },
      {
        id: 'idDocument',
        header: t('columns.idDocument'),
        cell: (row) => row.idDocumentNumber ?? '—',
      },
      {
        id: 'active',
        header: t('columns.active'),
        width: 'tight',
        cell: (row) =>
          row.active ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
    ],
    [t, tCommon],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={onRowClick}
      rowAriaLabel={(r) => `${r.firstName} ${r.lastName}`}
      isLoading={isLoading}
      {...errorProps}
      empty={
        <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
      }
    />
  );
}

interface TrailersTableProps extends Partial<QueryErrorProps> {
  rows: TrailerDto[];
  isLoading: boolean;
  onRowClick?: (row: TrailerDto) => void;
}

function TrailersTable({
  rows,
  isLoading,
  onRowClick,
  ...errorProps
}: TrailersTableProps) {
  const t = useTranslations('opieka.trailers');
  const tCommon = useTranslations('common');

  const columns = useMemo<DataTableColumn<TrailerDto>[]>(
    () => [
      {
        id: 'plate',
        header: t('columns.plate'),
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'type',
        header: t('columns.type'),
        cell: (row) =>
          row.trailerType?.shortCode
            ? `[${row.trailerType.shortCode}] ${row.trailerType.name}`
            : (row.trailerType?.name ?? '—'),
      },
      {
        id: 'active',
        header: t('columns.active'),
        width: 'tight',
        cell: (row) =>
          row.active ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
    ],
    [t, tCommon],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={onRowClick}
      rowAriaLabel={(r) => r.plateNumber}
      isLoading={isLoading}
      {...errorProps}
      empty={
        <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
      }
    />
  );
}
