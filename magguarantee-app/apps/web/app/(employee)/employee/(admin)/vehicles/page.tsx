'use client';

// Admin CRUD — vehicles. The list table only shows the most useful 6 columns
// (per the Phase 2 spec — don't gold-plate). The full 36-field edit happens
// in the sheet.

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { VehicleDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useVehicles } from '@/lib/hooks/useVehicles';

import { VehicleSheet } from './VehicleSheet';

// TODO: GpsStatus column when Phase 5 fleet UI lands
// (locked spec in docs/14-design-system.md § GPS status indicator).

export default function VehiclesPage() {
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const [carrierId, setCarrierId] = useState<string>('');

  const { data, isLoading } = useVehicles({
    q: search.length >= 2 ? search : undefined,
    carrierId: carrierId || undefined,
    limit: 50,
  });

  const carriersQ = useCarriers({ limit: 200 });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<VehicleDto | null>(null);

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: VehicleDto) => {
    setTarget(row);
    setSheetOpen(true);
  };

  const columns = useMemo<DataTableColumn<VehicleDto>[]>(
    () => [
      {
        id: 'plate',
        header: t('fields.plateNumber'),
        cell: (row) => (
          <span className="font-mono font-semibold">{row.plateNumber}</span>
        ),
      },
      {
        id: 'carrier',
        header: t('fields.carrier'),
        cell: (row) => row.carrier?.name ?? row.carrier?.login ?? '—',
      },
      {
        id: 'planner',
        header: t('fields.planner'),
        cell: (row) => row.planner?.name ?? row.planner?.login ?? '—',
      },
      {
        id: 'dispatcher',
        header: t('fields.dispatcher'),
        cell: (row) => row.dispatcher?.name ?? row.dispatcher?.login ?? '—',
      },
      {
        id: 'type',
        header: t('fields.type'),
        cell: (row) => row.type ?? '—',
      },
      {
        id: 'active',
        header: t('fields.active'),
        cell: (row) =>
          row.active ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
      {
        id: 'actions',
        header: <span className="sr-only">{tCommon('actions')}</span>,
        align: 'right',
        cell: (row) => (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
            aria-label={`${tCommon('edit')} ${row.plateNumber}`}
          >
            <Pencil size={14} />
            {tCommon('edit')}
          </Button>
        ),
      },
    ],
    [t, tCommon],
  );

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          {t('newVehicle')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="search"
          className="h-10 sm:max-w-xs"
          placeholder={t('filters.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="sm:max-w-xs"
          value={carrierId}
          onChange={(e) => setCarrierId(e.target.value)}
        >
          <option value="">{t('filters.allCarriers')}</option>
          {(carriersQ.data?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.login}
              {c.name ? ` — ${c.name}` : ''}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        isLoading={isLoading}
        empty={
          <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
        }
      />

      <VehicleSheet
        open={sheetOpen}
        vehicle={target}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
