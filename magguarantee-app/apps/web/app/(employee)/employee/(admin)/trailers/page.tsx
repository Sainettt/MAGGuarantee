'use client';

// Admin CRUD — trailers.

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { TrailerDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';
import { useTrailers } from '@/lib/hooks/useTrailers';

import { TrailerSheet } from './TrailerSheet';

export default function TrailersPage() {
  const t = useTranslations('trailers');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const [carrierId, setCarrierId] = useState<string>('');
  const [trailerTypeId, setTrailerTypeId] = useState<string>('');

  const { data, isLoading } = useTrailers({
    q: search.length >= 2 ? search : undefined,
    carrierId: carrierId || undefined,
    trailerTypeId: trailerTypeId || undefined,
    limit: 50,
  });

  const carriersQ = useCarriers({ limit: 200 });
  const typesQ = useTrailerTypes({ active: true });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<TrailerDto | null>(null);

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: TrailerDto) => {
    setTarget(row);
    setSheetOpen(true);
  };

  const columns = useMemo<DataTableColumn<TrailerDto>[]>(
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
        id: 'type',
        header: t('fields.trailerType'),
        cell: (row) =>
          row.trailerType?.shortCode
            ? `[${row.trailerType.shortCode}] ${row.trailerType.name}`
            : (row.trailerType?.name ?? '—'),
      },
      {
        id: 'brand',
        header: t('fields.brand'),
        cell: (row) =>
          [row.brand, row.model].filter(Boolean).join(' ') || '—',
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
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          {t('newTrailer')}
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
        <Select
          className="sm:max-w-xs"
          value={trailerTypeId}
          onChange={(e) => setTrailerTypeId(e.target.value)}
        >
          <option value="">{t('filters.allTypes')}</option>
          {(typesQ.data ?? []).map((tt) => (
            <option key={tt.id} value={tt.id}>
              {tt.shortCode ? `[${tt.shortCode}] ` : ''}
              {tt.name}
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

      <TrailerSheet
        open={sheetOpen}
        trailer={target}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
