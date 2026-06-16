'use client';

// Admin CRUD — vehicles. The list table only shows the most useful 6 columns
// (per the Phase 2 spec — don't gold-plate). The full 36-field edit happens
// in the sheet.

import { Pencil, Plus, SearchX, Truck, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { VehicleDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteWithReasonDialog } from '@/components/ui/ConfirmDeleteWithReasonDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { VehicleDetailModal } from '@/components/vehicles/VehicleDetailModal';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useHardDeleteVehicle, useVehicles } from '@/lib/hooks/useVehicles';

import { VehicleSheet } from './VehicleSheet';

// TODO: GpsStatus column when Phase 5 fleet UI lands
// (locked spec in docs/14-design-system.md § GPS status indicator).

export default function VehiclesPage() {
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const tConfirm = useTranslations('confirmDelete');
  const { user } = useAuth();
  // Phase 5.1 — admin OR opiekun can hard-delete (opiekun limited to their
  // own entities; backend re-verifies and 403s any foreign id).
  const canHardDelete = user?.role === 'admin' || user?.role === 'opiekun';
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

  // Phase 6 — read-only detail modal. A plain row click opens this; its
  // «Edytuj» action closes it and opens the edit Sheet (docs/14 §6.11). It
  // mirrors the sheetOpen/target pair and is never open at the same time as
  // the Sheet (the modal closes before the Sheet opens).
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<VehicleDto | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VehicleDto | null>(null);
  const hardDeleteM = useHardDeleteVehicle();

  const hasActiveFilters = Boolean(search.length >= 2 || carrierId);
  const clearFilters = () => {
    setSearch('');
    setCarrierId('');
  };

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: VehicleDto) => {
    setTarget(row);
    setSheetOpen(true);
  };
  // A plain row click opens the read-only detail modal (not the edit Sheet);
  // the action-column pencil button still jumps straight to edit.
  const openDetail = (row: VehicleDto) => {
    setDetailTarget(row);
    setDetailOpen(true);
  };
  // Detail modal «Edytuj» — the modal has already closed itself; open the
  // existing edit Sheet for the same vehicle.
  const editFromDetail = () => {
    if (detailTarget) openEdit(detailTarget);
  };

  const openHardDelete = useCallback((row: VehicleDto) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }, []);

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
          if (canHardDelete) {
            actions.push({
              key: 'delete',
              label: tConfirm('confirm'),
              icon: Trash2,
              destructive: true,
              onSelect: () => openHardDelete(row),
            });
          }
          return (
            <div className="flex items-center justify-end">
              <RowActionsMenu
                label={`${tCommon('actions')} — ${row.plateNumber}`}
                actions={actions}
              />
            </div>
          );
        },
      },
    ],
    [t, tCommon, tConfirm, canHardDelete, openHardDelete],
  );

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
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
        hasActiveFilters={hasActiveFilters}
        empty={
          <EmptyState
            icon={Truck}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} />
                {t('newVehicle')}
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

      <VehicleDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        vehicle={detailTarget}
        onEdit={editFromDetail}
      />

      <VehicleSheet
        open={sheetOpen}
        vehicle={target}
        onClose={() => setSheetOpen(false)}
      />

      <ConfirmDeleteWithReasonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityLabel={tConfirm('entityLabel.vehicle')}
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
