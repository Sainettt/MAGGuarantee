'use client';

// Admin CRUD — trailers.

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { TrailerDto } from '@magguarantee/shared';

import { TrailerDetailModal } from '@/components/trailers/TrailerDetailModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteWithReasonDialog } from '@/components/ui/ConfirmDeleteWithReasonDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';
import { useHardDeleteTrailer, useTrailers } from '@/lib/hooks/useTrailers';

import { TrailerSheet } from './TrailerSheet';

export default function TrailersPage() {
  const t = useTranslations('trailers');
  const tCommon = useTranslations('common');
  const tConfirm = useTranslations('confirmDelete');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
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

  // Phase 6 — read-only detail modal. A plain row click opens this; its
  // «Edytuj» action closes it and opens the edit Sheet (docs/14 §6.11). It
  // mirrors the sheetOpen/target pair and is never open at the same time as
  // the Sheet (the modal closes before the Sheet opens).
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<TrailerDto | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrailerDto | null>(null);
  const hardDeleteM = useHardDeleteTrailer();

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: TrailerDto) => {
    setTarget(row);
    setSheetOpen(true);
  };
  // A plain row click opens the read-only detail modal (not the edit Sheet);
  // the action-column pencil button still jumps straight to edit.
  const openDetail = (row: TrailerDto) => {
    setDetailTarget(row);
    setDetailOpen(true);
  };
  // Detail modal «Edytuj» — the modal has already closed itself; open the
  // existing edit Sheet for the same trailer.
  const editFromDetail = () => {
    if (detailTarget) openEdit(detailTarget);
  };

  const openHardDelete = useCallback((row: TrailerDto) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }, []);

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
              aria-label={`${tCommon('edit')} ${row.plateNumber}`}
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
                aria-label={`${tConfirm('confirm')} ${row.plateNumber}`}
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
          className="sm:max-w-xs"
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
        onRowClick={openDetail}
        isLoading={isLoading}
        loadingLabel={tCommon('loading')}
        empty={
          <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
        }
      />

      <TrailerDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        trailer={detailTarget}
        onEdit={editFromDetail}
      />

      <TrailerSheet
        open={sheetOpen}
        trailer={target}
        onClose={() => setSheetOpen(false)}
      />

      <ConfirmDeleteWithReasonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityLabel={tConfirm('entityLabel.trailer')}
        entityName={deleteTarget?.plateNumber ?? ''}
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
