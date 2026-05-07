'use client';

// Admin CRUD — carriers.

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { CarrierDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useOpiekuni } from '@/lib/hooks/useLookups';

import { CarrierSheet } from './CarrierSheet';

export default function CarriersPage() {
  const t = useTranslations('carriers');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const [opiekunId, setOpiekunId] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');

  const { data, isLoading } = useCarriers({
    q: search.length >= 2 ? search : undefined,
    opiekunId: opiekunId || undefined,
    active: activeFilter === '' ? undefined : activeFilter === 'true',
    limit: 50,
  });

  const opiekuniQ = useOpiekuni();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<CarrierDto | null>(null);

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: CarrierDto) => {
    setTarget(row);
    setSheetOpen(true);
  };

  const columns = useMemo<DataTableColumn<CarrierDto>[]>(
    () => [
      {
        id: 'login',
        header: t('fields.login'),
        cell: (row) => <span className="font-mono">{row.login}</span>,
      },
      {
        id: 'name',
        header: t('fields.name'),
        cell: (row) => <span className="font-semibold">{row.name ?? '—'}</span>,
      },
      {
        id: 'company',
        header: t('fields.company'),
        cell: (row) => row.company ?? '—',
      },
      {
        id: 'nip',
        header: t('fields.nip'),
        cell: (row) => row.nip ?? '—',
      },
      {
        id: 'opiekun',
        header: t('fields.opiekun'),
        cell: (row) =>
          row.opiekun?.name ?? row.opiekun?.login ?? '—',
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
            aria-label={`${tCommon('edit')} ${row.login}`}
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
          {t('newCarrier')}
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
          value={opiekunId}
          onChange={(e) => setOpiekunId(e.target.value)}
        >
          <option value="">{t('filters.allOpiekun')}</option>
          {(opiekuniQ.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ?? u.login}
            </option>
          ))}
        </Select>
        <Select
          className="sm:max-w-xs"
          value={activeFilter}
          onChange={(e) =>
            setActiveFilter(e.target.value as '' | 'true' | 'false')
          }
        >
          <option value="">{t('filters.allActive')}</option>
          <option value="true">{t('filters.onlyActive')}</option>
          <option value="false">{t('filters.onlyInactive')}</option>
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

      <CarrierSheet
        open={sheetOpen}
        carrier={target}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
