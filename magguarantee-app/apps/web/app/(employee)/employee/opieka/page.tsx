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
// A row click navigates to the carrier-detail drill-down at
// `/employee/opieka/carriers/[login]` for a per-entity (vehicles / drivers /
// trailers) read-only inspection view.

import { Building2, Car, CircleSlash2, HeartHandshake, Plus, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo } from 'react';
import type { OpiekunCarrierStats } from '@magguarantee/shared';

import { KpiCard } from '@/components/dashboard/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { useOpiekunFleet } from '@/lib/hooks/useOpiekunFleet';

export default function OpiekaPage() {
  const t = useTranslations('opieka');
  const tCommon = useTranslations('common');
  const { data, isLoading } = useOpiekunFleet();

  const carriers = data?.carriers ?? [];
  const totals = data?.totals;

  const columns = useMemo<DataTableColumn<OpiekunCarrierStats>[]>(
    () => [
      {
        id: 'firma',
        header: t('table.firma'),
        width: 'flex',
        className: 'min-w-[220px]',
        cell: (row) => (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span
              className="font-semibold truncate"
              title={row.firma ?? row.nazwa ?? row.login}
            >
              {row.firma ?? row.nazwa ?? row.login}
            </span>
            <span className="text-xs text-text-sub font-mono truncate">
              {row.login}
            </span>
          </div>
        ),
      },
      {
        id: 'nip',
        header: t('table.nip'),
        width: 'tight',
        cell: (row) => (
          <span className="font-mono tabular-nums">{row.nip}</span>
        ),
      },
      {
        id: 'active',
        header: t('table.active'),
        width: 'tight',
        cell: (row) =>
          row.aktywny ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
      {
        id: 'jezdzace',
        header: t('table.jezdzace'),
        align: 'right',
        width: 'tight',
        cell: (row) => (
          <span className="tabular-nums font-semibold text-success">
            {row.vehicles.jezdzace}
          </span>
        ),
      },
      {
        id: 'stojace',
        header: t('table.stojace'),
        align: 'right',
        width: 'tight',
        cell: (row) => (
          <span className="tabular-nums font-semibold text-warning">
            {row.vehicles.stojace}
          </span>
        ),
      },
      {
        id: 'nieaktywne',
        header: t('table.nieaktywne'),
        align: 'right',
        width: 'tight',
        cell: (row) => (
          <span className="tabular-nums text-text-sub">
            {row.vehicles.nieaktywne}
          </span>
        ),
      },
      {
        id: 'potencjalne',
        header: t('table.potencjalne'),
        align: 'right',
        width: 'tight',
        cell: (row) => (
          <span className="tabular-nums text-info">
            {row.vehicles.potencjalne}
          </span>
        ),
      },
      {
        id: 'actions',
        header: <span className="sr-only">{t('table.actions')}</span>,
        align: 'right',
        width: 'tight',
        cell: (row) => (
          <Link
            href={`/employee/opieka/carriers/${encodeURIComponent(row.login)}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-text hover:bg-brand-50 dark:hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 transition-colors"
            aria-label={t('table.openDetailAria', {
              firma: row.firma ?? row.nazwa ?? row.login,
            })}
            onClick={(e) => e.stopPropagation()}
          >
            {t('table.openDetail')}
          </Link>
        ),
      },
    ],
    [t, tCommon],
  );

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="text-sm text-text-sub">{t('subtitle')}</p>
      </div>

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

      <DataTable
        rows={carriers}
        columns={columns}
        rowKey={(r) => r.carrierId}
        isLoading={isLoading}
        loadingLabel={tCommon('loading')}
        empty={
          <EmptyState
            icon={HeartHandshake}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
      />
    </section>
  );
}
