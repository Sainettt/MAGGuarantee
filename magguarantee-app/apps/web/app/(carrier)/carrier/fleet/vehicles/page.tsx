'use client';

// Phase 3 — carrier-scoped vehicle list. READ-ONLY: vehicles are managed by
// the opiekun, the carrier can only see them. Per docs/14 "Auta" sub-tab.
//
// The table is fed by `useVehicles()` (full `VehicleDto`) — `GET /vehicles` is
// carrier-scoped server-side to the carrier's own vehicles, matching how the
// trailers/drivers carrier pages already use full-DTO hooks. The full DTO is
// needed so a row click can open the read-only <VehicleDetailModal>.

import { Mail, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { VehicleDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { VehicleDetailModal } from '@/components/vehicles/VehicleDetailModal';
import { useVehicles } from '@/lib/hooks/useVehicles';

export default function CarrierVehiclesPage() {
  const t = useTranslations('carrier.fleet.vehicles');
  const tColumns = useTranslations('carrier.fleet.vehicles.columns');
  const tCommon = useTranslations('common');
  const { data, isLoading } = useVehicles({ limit: 50 });
  const vehicles = data?.items ?? [];

  // Read-only detail modal — a plain row click opens it. Carriers cannot edit
  // vehicles, so no `onEdit` is passed (footer shows only «Zamknij», §6.6).
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<VehicleDto | null>(null);

  const openDetail = (row: VehicleDto) => {
    setDetailTarget(row);
    setDetailOpen(true);
  };

  const columns = useMemo<DataTableColumn<VehicleDto>[]>(
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
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
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
        onRowClick={openDetail}
        isLoading={isLoading}
        empty={
          <EmptyState
            icon={Truck}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
      />

      <VehicleDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        vehicle={detailTarget}
        hideCarrier
      />
    </section>
  );
}
