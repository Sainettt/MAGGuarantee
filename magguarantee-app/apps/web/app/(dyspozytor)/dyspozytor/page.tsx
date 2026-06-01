'use client';

// Phase 6.5 — dyspozytor read-only fleet panel.
//
// The route-group `layout.tsx` already does `requireRoleAccess(['admin',
// 'dyspozytor'])` + wraps in `<RoleShell>`, so this page does NOT re-guard.
// Strictly read-only (DS §6.3.3): heading + read-only banner + KPI strip +
// conditional "stojące > 7 dni" warning sub-list + a 4-tab `<Tabs>`
// (Auta / Wyjazdy / Kierowcy / Naczepy).
//
// The Auta / Kierowcy / Naczepy tabs reuse the shared read-only fleet
// sub-tables; the Wyjazdy (delegacje) tab is fed by the existing
// `useDelegations()` hook with NO params — the API auto-scopes the list to the
// dispatcher's own vehicles server-side from the JWT identity. Delegation rows
// render a STATIC `<StatusBadge>` — no status-change control (that is
// weryfikator / Phase 7 territory).
//
// Backed by `GET /fleet/dyspozytor` (`useDyspozytorFleet`): three slim lists +
// a `stats` KPI block + the `stojaceList` idle-vehicle highlight rows.

import { AlertTriangle, Car, Container, MapPin, PauseCircle, Truck, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { DelegationDto } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { KpiCard } from '@/components/dashboard/KpiCard';
import {
  FleetDriversTable,
  FleetTrailersTable,
  FleetVehiclesTable,
} from '@/components/fleet/FleetTables';
import { ReadOnlyBanner } from '@/components/fleet/ReadOnlyBanner';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { formatDateShort } from '@/lib/format/numbers';
import { useDelegations } from '@/lib/hooks/useDelegations';
import { useDyspozytorFleet } from '@/lib/hooks/useDyspozytorFleet';

export default function DyspozytorPanelPage() {
  const t = useTranslations('dyspozytor');
  const tCommon = useTranslations('common');
  const tDeleg = useTranslations('dyspozytor.delegations');

  const { data, isLoading } = useDyspozytorFleet();
  // No params — the API auto-scopes delegations to the dispatcher's vehicles.
  const delegationsQ = useDelegations({ limit: 50 });

  const stats = data?.stats;
  const idle = data?.stojaceList ?? [];

  const delegationColumns = useMemo<DataTableColumn<DelegationDto>[]>(
    () => [
      {
        id: 'vehicle',
        header: tDeleg('columns.vehicle'),
        cell: (row) => (
          <span className="font-mono font-semibold">
            {row.vehicle?.plateNumber ?? '—'}
          </span>
        ),
      },
      {
        id: 'driver',
        header: tDeleg('columns.driver'),
        cell: (row) => (
          <span className="font-semibold">
            {row.driver
              ? `${row.driver.firstName} ${row.driver.lastName}`
              : (row.driverNameSnapshot ?? '—')}
          </span>
        ),
      },
      {
        id: 'route',
        header: tDeleg('columns.route'),
        width: 'flex',
        truncate: 'ellipsis',
        cell: (row) => (
          <span title={`${row.departureCountry} → ${row.returnCountry}`}>
            {row.departureCountry} → {row.returnCountry}
          </span>
        ),
      },
      {
        id: 'period',
        header: tDeleg('columns.period'),
        width: 'tight',
        cell: (row) => (
          <span className="tabular-nums">
            {formatDateShort(row.departureAt)} – {formatDateShort(row.plannedReturnAt)}
          </span>
        ),
      },
      {
        id: 'status',
        header: tDeleg('columns.status'),
        width: 'tight',
        // Static indicator — read-only. No dropdown / mutation control.
        cell: (row) => <StatusBadge status={row.status} />,
      },
    ],
    [tDeleg],
  );

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="text-sm text-text-sub">{t('subtitle')}</p>
      </div>

      <ReadOnlyBanner message={t('readOnlyBanner')} />

      {/* KPI strip — five tiles. Bucket→tone per DS §6.3.3 (no purple): totals
          are neutral, JEŻDŻĄ green, STOJĄ>7DNI orange, KIEROWCY blue.
          Always rendered so the layout doesn't jump between loading states. */}
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
          warning-toned panel composed from token-with-opacity (bg-warning/10 +
          border-warning/40), inert chips, meaning carried by icon + "X dni"
          text (not colour alone). */}
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
            namespace="dyspozytor.vehicles"
          />
        </TabsContent>

        <TabsContent value="delegations">
          <DataTable
            rows={delegationsQ.data?.items ?? []}
            columns={delegationColumns}
            rowKey={(r) => r.id}
            isLoading={delegationsQ.isLoading}
            loadingLabel={tCommon('loading')}
            empty={
              <EmptyState
                icon={MapPin}
                title={tDeleg('emptyTitle')}
                message={tDeleg('emptyMessage')}
              />
            }
          />
        </TabsContent>

        <TabsContent value="drivers">
          <FleetDriversTable
            rows={data?.drivers ?? []}
            isLoading={isLoading}
            namespace="dyspozytor.drivers"
          />
        </TabsContent>

        <TabsContent value="trailers">
          <FleetTrailersTable
            rows={data?.trailers ?? []}
            isLoading={isLoading}
            namespace="dyspozytor.trailers"
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
