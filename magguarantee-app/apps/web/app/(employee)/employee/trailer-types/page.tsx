'use client';

// Admin CRUD — trailer types. Smallest of the five Phase 2 admin pages
// (trailer types are a global lookup, no carrier filter, no pagination —
// API returns the flat list).

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { TrailerTypeDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';

import { TrailerTypeSheet } from './TrailerTypeSheet';

export default function TrailerTypesPage() {
  const t = useTranslations('trailerTypes');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useTrailerTypes({
    q: search.length >= 2 ? search : undefined,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<TrailerTypeDto | null>(null);

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: TrailerTypeDto) => {
    setTarget(row);
    setSheetOpen(true);
  };

  const columns = useMemo<DataTableColumn<TrailerTypeDto>[]>(
    () => [
      {
        id: 'name',
        header: t('fields.name'),
        cell: (row) => <span className="font-semibold">{row.name}</span>,
      },
      {
        id: 'shortCode',
        header: t('fields.shortCode'),
        cell: (row) => row.shortCode ?? '—',
      },
      {
        id: 'description',
        header: t('fields.description'),
        cell: (row) => (
          <span className="text-text-sub line-clamp-1">
            {row.description ?? ''}
          </span>
        ),
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
            aria-label={`${tCommon('edit')} ${row.name}`}
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
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {t('title')}
          </h1>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          {t('newType')}
        </Button>
      </div>

      <div className="mb-4">
        <Input
          type="search"
          className="h-10 max-w-xs"
          placeholder={tCommon('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        rows={data ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        isLoading={isLoading}
        empty={
          <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
        }
      />

      <TrailerTypeSheet
        open={sheetOpen}
        trailerType={target}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
