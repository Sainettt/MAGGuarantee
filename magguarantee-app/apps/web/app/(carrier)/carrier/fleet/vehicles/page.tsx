'use client';

// Phase 3 — carrier-scoped vehicle list. READ-ONLY: vehicles are managed by
// the opiekun, the carrier can only see them. Per docs/14 "Auta" sub-tab.

import { Mail, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { VehicleListItem } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { useMyFleet } from '@/lib/hooks/useMyFleet';

export default function CarrierVehiclesPage() {
  const t = useTranslations('carrier.fleet.vehicles');
  const tColumns = useTranslations('carrier.fleet.vehicles.columns');
  const tCommon = useTranslations('common');
  const { data, isLoading } = useMyFleet();
  const vehicles = data?.vehicles ?? [];

  const columns = useMemo<DataTableColumn<VehicleListItem>[]>(
    () => [
      {
        id: 'plate',
        header: tColumns('plate'),
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'side',
        header: tColumns('side'),
        cell: (row) => row.sideNumber ?? '—',
      },
      {
        id: 'brand',
        header: tColumns('brandModel'),
        cell: (row) =>
          [row.brand, row.model].filter(Boolean).join(' ') || '—',
      },
      {
        id: 'type',
        header: tColumns('type'),
        cell: (row) => row.type ?? '—',
      },
      {
        id: 'active',
        header: tColumns('status'),
        cell: (row) =>
          row.active ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
    ],
    [tColumns, tCommon],
  );

  const mailtoSubject = encodeURIComponent(t('contactOpiekunSubject'));

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <a
          href={`mailto:opiekun@magtrans.eu?subject=${mailtoSubject}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-dark"
        >
          <Mail size={14} />
          {t('contactOpiekun')}
        </a>
      </div>

      <DataTable
        rows={vehicles}
        columns={columns}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        empty={
          <EmptyState
            icon={Truck}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
      />
    </section>
  );
}
