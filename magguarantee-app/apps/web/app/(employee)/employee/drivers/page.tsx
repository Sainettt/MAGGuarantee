'use client';

// Admin CRUD — drivers.

import { Pencil, Plus, SearchX, Trash2, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { DriverDto } from '@magguarantee/shared';

import { DriverDetailModal } from '@/components/drivers/DriverDetailModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteWithReasonDialog } from '@/components/ui/ConfirmDeleteWithReasonDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ApiResponseError } from '@/lib/api/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCarriers } from '@/lib/hooks/useCarriers';
import {
  useDeleteDriver,
  useDrivers,
  useHardDeleteDriver,
} from '@/lib/hooks/useDrivers';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import { SUPPRESS_GLOBAL_ERROR } from '@/lib/query/globalErrors';

import { DriverFormDialog } from './DriverFormDialog';

export default function DriversPage() {
  const t = useTranslations('drivers');
  const tCommon = useTranslations('common');
  const tConfirm = useTranslations('confirmDelete');
  const { user } = useAuth();
  // The delete row-action renders for both admin and opiekun, but they hit
  // DIFFERENT endpoints (docs/13-api-design.md): admin runs a physical
  // hard-delete with a mandatory powód (`DELETE /drivers/:id/hard`, admin-only),
  // opiekun runs a SOFT delete of their own driver (`DELETE /drivers/:id`,
  // sets `deletedAt`, restorable server-side). Carriers are the exception —
  // there opiekun gets no delete at all (see carriers/page.tsx).
  const isAdmin = user?.role === 'admin';
  const isOpiekun = user?.role === 'opiekun';
  const canDelete = isAdmin || isOpiekun;
  const [search, setSearch] = useState('');
  const [carrierId, setCarrierId] = useState<string>('');

  const listQ = useDrivers({
    q: search.length >= 2 ? search : undefined,
    carrierId: carrierId || undefined,
    limit: 50,
  });
  const { data, isLoading } = listQ;

  const carriersQ = useCarriers({ limit: 200 });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<DriverDto | null>(null);

  // Phase 6 — read-only detail modal. A plain row click opens this; its
  // «Edytuj» action closes it and opens the edit Sheet (docs/14 §6.11). It
  // mirrors the sheetOpen/target pair and is never open at the same time as
  // the Sheet (the modal closes before the Sheet opens).
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DriverDto | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DriverDto | null>(null);
  const hardDeleteM = useHardDeleteDriver({ meta: SUPPRESS_GLOBAL_ERROR });
  const softDeleteM = useDeleteDriver({ meta: SUPPRESS_GLOBAL_ERROR });

  const hasActiveFilters = Boolean(search.length >= 2 || carrierId);
  const clearFilters = () => {
    setSearch('');
    setCarrierId('');
  };

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: DriverDto) => {
    setTarget(row);
    setSheetOpen(true);
  };
  // A plain row click opens the read-only detail modal (not the edit Sheet);
  // the action-column pencil button still jumps straight to edit.
  const openDetail = (row: DriverDto) => {
    setDetailTarget(row);
    setDetailOpen(true);
  };
  // Detail modal «Edytuj» — the modal has already closed itself; open the
  // existing edit Sheet for the same driver.
  const editFromDetail = () => {
    if (detailTarget) openEdit(detailTarget);
  };

  // Opens whichever delete dialog matches the current role (reason dialog for
  // admin, bare confirm for opiekun) — both share this target/open pair.
  const openDelete = useCallback((row: DriverDto) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }, []);

  const columns = useMemo<DataTableColumn<DriverDto>[]>(
    () => [
      {
        id: 'name',
        header: `${t('fields.firstName')} ${t('fields.lastName')}`,
        cell: (row) => (
          <span className="font-semibold">
            {row.firstName} {row.lastName}
          </span>
        ),
      },
      {
        id: 'carrier',
        header: t('fields.carrier'),
        cell: (row) => row.carrier?.name ?? row.carrier?.login ?? '—',
      },
      {
        id: 'phone',
        header: t('fields.phone'),
        cell: (row) => row.phone ?? '—',
      },
      {
        id: 'idDocument',
        header: t('fields.idDocumentNumber'),
        cell: (row) => row.idDocumentNumber ?? '—',
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
        cell: (row) => {
          const actions: RowAction[] = [
            {
              key: 'edit',
              label: tCommon('edit'),
              icon: Pencil,
              onSelect: () => openEdit(row),
            },
          ];
          if (canDelete) {
            actions.push({
              key: 'delete',
              label: isAdmin ? tConfirm('confirm') : tConfirm('softConfirm'),
              icon: Trash2,
              destructive: true,
              onSelect: () => openDelete(row),
            });
          }
          return (
            <div className="flex items-center justify-end">
              <RowActionsMenu
                label={`${tCommon('actions')} — ${row.firstName} ${row.lastName}`}
                actions={actions}
              />
            </div>
          );
        },
      },
    ],
    [t, tCommon, tConfirm, canDelete, isAdmin, openDelete],
  );

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          {t('newDriver')}
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
          aria-label={t('filters.carrierLabel')}
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
        onRowClick={openDetail}
        isLoading={isLoading}
        {...queryErrorProps(listQ)}
        hasActiveFilters={hasActiveFilters}
        empty={
          <EmptyState
            icon={UserRound}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} />
                {t('newDriver')}
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

      <DriverDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        driver={detailTarget}
        onEdit={editFromDetail}
      />

      <DriverFormDialog
        open={sheetOpen}
        driver={target}
        onClose={() => setSheetOpen(false)}
      />

      {/* Admin — physical hard-delete with a mandatory powód. */}
      {isAdmin && (
        <ConfirmDeleteWithReasonDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          entityLabel={tConfirm('entityLabel.driver')}
          entityName={
            deleteTarget
              ? `${deleteTarget.firstName} ${deleteTarget.lastName}`
              : ''
          }
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
              // 409 = record still has referencing rows; the backend sends a
              // human-readable Polish «Nie można trwale usunąć…». Show it verbatim.
              if (err instanceof ApiResponseError && err.status === 409) {
                toast.error(err.message);
              } else {
                toast.error(tConfirm('errorToast'));
              }
              throw err;
            }
          }}
        />
      )}

      {/* Opiekun — soft delete (restorable), no powód. */}
      {isOpiekun && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={tConfirm('softTitle', {
            entityLabel: tConfirm('entityLabel.driver'),
          })}
          body={tConfirm('softBody', {
            entityName: deleteTarget
              ? `${deleteTarget.firstName} ${deleteTarget.lastName}`
              : '',
          })}
          confirmLabel={tConfirm('softConfirm')}
          cancelLabel={tConfirm('cancel')}
          onConfirm={async () => {
            if (!deleteTarget) return;
            try {
              await softDeleteM.mutateAsync(deleteTarget.id);
              toast.success(tConfirm('deletedToast'));
            } catch (err) {
              toast.error(tConfirm('errorToast'));
              throw err;
            }
          }}
        />
      )}
    </section>
  );
}
