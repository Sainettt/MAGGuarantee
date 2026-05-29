'use client';

// Phase 5 — opiekun drill-down for a single carrier.
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
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import type {
  CarrierDto,
  DriverDto,
  TrailerDto,
  VehicleDto,
} from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { CarrierDocumentsTab } from './CarrierDocumentsTab';
import { listDrivers } from '@/lib/api/drivers';
import { listTrailers } from '@/lib/api/trailers';
import { listVehicles } from '@/lib/api/vehicles';
import { useCarrier } from '@/lib/hooks/useCarriers';
import { DRIVERS_KEY } from '@/lib/hooks/useDrivers';
import { useOpiekunFleet } from '@/lib/hooks/useOpiekunFleet';
import { TRAILERS_KEY } from '@/lib/hooks/useTrailers';
import { VEHICLES_KEY } from '@/lib/hooks/useVehicles';

export default function OpiekaCarrierDetailPage() {
  const params = useParams<{ login: string }>();
  const login = decodeURIComponent(params.login ?? '');
  const t = useTranslations('opieka');
  const tCommon = useTranslations('common');

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

  const carrier: CarrierDto | undefined = carrierQ.data;

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
        <Tabs defaultValue="vehicles" className="w-full">
          <TabsList aria-label={t('tabs.ariaLabel')} className="mb-4">
            <TabsTrigger value="vehicles">{t('tabs.vehicles')}</TabsTrigger>
            <TabsTrigger value="drivers">{t('tabs.drivers')}</TabsTrigger>
            <TabsTrigger value="trailers">{t('tabs.trailers')}</TabsTrigger>
            <TabsTrigger value="documents">{t('tabs.documents')}</TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles">
            <VehiclesTable
              rows={vehiclesQ.data?.items ?? []}
              isLoading={vehiclesQ.isLoading}
            />
          </TabsContent>

          <TabsContent value="drivers">
            <DriversTable
              rows={driversQ.data?.items ?? []}
              isLoading={driversQ.isLoading}
            />
          </TabsContent>

          <TabsContent value="trailers">
            <TrailersTable
              rows={trailersQ.data?.items ?? []}
              isLoading={trailersQ.isLoading}
            />
          </TabsContent>

          {carrierId && (
            <TabsContent value="documents">
              <CarrierDocumentsTab carrierId={carrierId} />
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
    </section>
  );
}

// ─── Sub-tables (read-only) ─────────────────────────────────
//
// We do NOT pull in the admin VehiclesPage / DriversPage / TrailersPage
// components because those are interactive (edit Sheet, hard-delete dialog,
// filters tied to admin-only carrier dropdowns). Instead, we render the same
// DataTable primitive with a curated read-only column set — same row height,
// same hover state, same a11y guarantees.

interface VehiclesTableProps {
  rows: VehicleDto[];
  isLoading: boolean;
}

function VehiclesTable({ rows, isLoading }: VehiclesTableProps) {
  const t = useTranslations('opieka.vehicles');
  const tCommon = useTranslations('common');

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
        id: 'brand',
        header: t('columns.brandModel'),
        cell: (row) =>
          [row.brand, row.model].filter(Boolean).join(' ') || '—',
      },
      {
        id: 'type',
        header: t('columns.type'),
        cell: (row) => row.type ?? '—',
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
      isLoading={isLoading}
      loadingLabel={tCommon('loading')}
      empty={
        <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
      }
    />
  );
}

interface DriversTableProps {
  rows: DriverDto[];
  isLoading: boolean;
}

function DriversTable({ rows, isLoading }: DriversTableProps) {
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
        id: 'passport',
        header: t('columns.passport'),
        cell: (row) => row.passportNumber ?? '—',
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
      isLoading={isLoading}
      loadingLabel={tCommon('loading')}
      empty={
        <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
      }
    />
  );
}

interface TrailersTableProps {
  rows: TrailerDto[];
  isLoading: boolean;
}

function TrailersTable({ rows, isLoading }: TrailersTableProps) {
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
        id: 'brand',
        header: t('columns.brandModel'),
        cell: (row) =>
          [row.brand, row.model].filter(Boolean).join(' ') || '—',
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
      isLoading={isLoading}
      loadingLabel={tCommon('loading')}
      empty={
        <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
      }
    />
  );
}
