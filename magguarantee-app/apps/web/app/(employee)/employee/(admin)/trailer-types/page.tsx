'use client';

// Admin CRUD — trailer types. Smallest of the five Phase 2 admin pages
// (trailer types are a global lookup, no carrier filter, no pagination —
// API returns the flat list).

import { Pencil, Plus, SearchX, Shapes, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { TrailerTypeDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteWithReasonDialog } from '@/components/ui/ConfirmDeleteWithReasonDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  useHardDeleteTrailerType,
  useTrailerTypes,
} from '@/lib/hooks/useTrailerTypes';

import { TrailerTypeSheet } from './TrailerTypeSheet';

export default function TrailerTypesPage() {
  const t = useTranslations('trailerTypes');
  const tCommon = useTranslations('common');
  const tConfirm = useTranslations('confirmDelete');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [search, setSearch] = useState('');

  const { data, isLoading } = useTrailerTypes({
    q: search.length >= 2 ? search : undefined,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<TrailerTypeDto | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrailerTypeDto | null>(null);
  const hardDeleteM = useHardDeleteTrailerType();

  const hasActiveFilters = search.length >= 2;
  const clearFilters = () => setSearch('');

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: TrailerTypeDto) => {
    setTarget(row);
    setSheetOpen(true);
  };
  const openHardDelete = useCallback((row: TrailerTypeDto) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }, []);

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
        width: 'tight',
        cell: (row) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(row);
              }}
              aria-label={`${tCommon('edit')} ${row.name}`}
            >
              <Pencil size={14} aria-hidden="true" />
              <span className="hidden lg:inline">{tCommon('edit')}</span>
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-danger hover:bg-danger-bg"
                onClick={(e) => {
                  e.stopPropagation();
                  openHardDelete(row);
                }}
                aria-label={`${tConfirm('confirm')} ${row.name}`}
              >
                <Trash2 size={14} aria-hidden="true" />
                <span className="hidden lg:inline">{tConfirm('confirm')}</span>
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, tCommon, tConfirm, isAdmin, openHardDelete],
  );

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
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

      {/* Filter bar — flex container matches the layout-parity used by the
          other 4 admin pages (single-input case keeps the same outer shape
          so the page rhythm stays consistent). */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="search"
          className="sm:max-w-xs"
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
        hasActiveFilters={hasActiveFilters}
        empty={
          <EmptyState
            icon={Shapes}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} />
                {t('newType')}
              </Button>
            }
          />
        }
        emptyFiltered={
          <EmptyState
            icon={SearchX}
            title={t('emptyFiltered.title')}
            message={t('emptyFiltered.message')}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                {tCommon('clearFilters')}
              </Button>
            }
          />
        }
      />

      <TrailerTypeSheet
        open={sheetOpen}
        trailerType={target}
        onClose={() => setSheetOpen(false)}
      />

      <ConfirmDeleteWithReasonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityLabel={tConfirm('entityLabel.trailerType')}
        entityName={deleteTarget?.name ?? ''}
        isLoading={hardDeleteM.isPending}
        onConfirm={async (reason) => {
          if (!deleteTarget) return;
          try {
            await hardDeleteM.mutateAsync({
              id: deleteTarget.id,
              body: { reason },
            });
            toast.success(tConfirm('deletedToast'));
          } catch (err) {
            toast.error(tConfirm('errorToast'));
            throw err;
          }
        }}
      />
    </section>
  );
}
