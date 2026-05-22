'use client';

// Phase 3 — carrier-scoped driver list. READ-ONLY: drivers are managed by
// admin/opiekun, the carrier can only see them (mirror of the vehicles and
// trailers carrier pages). Carriers are backend-locked out of driver
// mutations, so this page exposes no create/edit surface.

import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { DriverDto } from '@magguarantee/shared';

import { DriverDetailModal } from '@/components/drivers/DriverDetailModal';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { useDrivers } from '@/lib/hooks/useDrivers';

export default function CarrierDriversPage() {
  const t = useTranslations('carrier.fleet.drivers');
  const tColumns = useTranslations('carrier.fleet.drivers.columns');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useDrivers({
    q: search.length >= 2 ? search : undefined,
    limit: 50,
  });

  // Read-only detail modal — a plain row click opens it. Carriers cannot edit
  // drivers, so no `onEdit` is passed (footer shows only «Zamknij», §6.6).
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DriverDto | null>(null);

  const openDetail = (row: DriverDto) => {
    setDetailTarget(row);
    setDetailOpen(true);
  };

  const columns = useMemo<DataTableColumn<DriverDto>[]>(
    () => [
      {
        id: 'name',
        header: tColumns('name'),
        cell: (row) => (
          <span className="font-semibold">
            {row.firstName} {row.lastName}
          </span>
        ),
      },
      {
        id: 'phone',
        header: tColumns('phone'),
        cell: (row) => row.phone ?? '—',
      },
      {
        id: 'license',
        header: tColumns('license'),
        cell: (row) => row.driverLicenseNumber ?? '—',
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

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="search"
          className="h-10 sm:max-w-xs"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openDetail}
        isLoading={isLoading}
        empty={
          <EmptyState
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
      />

      <DriverDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        driver={detailTarget}
      />
    </section>
  );
}
