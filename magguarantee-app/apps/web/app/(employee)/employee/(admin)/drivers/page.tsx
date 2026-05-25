'use client';

// Admin CRUD — drivers.

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { DriverDto } from '@magguarantee/shared';

import { DriverDetailModal } from '@/components/drivers/DriverDetailModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteWithReasonDialog } from '@/components/ui/ConfirmDeleteWithReasonDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useDrivers, useHardDeleteDriver } from '@/lib/hooks/useDrivers';

import { DriverSheet } from './DriverSheet';

export default function DriversPage() {
  const t = useTranslations('drivers');
  const tCommon = useTranslations('common');
  const tConfirm = useTranslations('confirmDelete');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [search, setSearch] = useState('');
  const [carrierId, setCarrierId] = useState<string>('');

  const { data, isLoading } = useDrivers({
    q: search.length >= 2 ? search : undefined,
    carrierId: carrierId || undefined,
    limit: 50,
  });

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
  const hardDeleteM = useHardDeleteDriver();

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

  const openHardDelete = useCallback((row: DriverDto) => {
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
        id: 'license',
        header: t('fields.driverLicenseNumber'),
        cell: (row) => row.driverLicenseNumber ?? '—',
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
              aria-label={`${tCommon('edit')} ${row.firstName} ${row.lastName}`}
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
                aria-label={`${tConfirm('confirm')} ${row.firstName} ${row.lastName}`}
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
        loadingLabel={tCommon('loading')}
        empty={
          <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
        }
      />

      <DriverDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        driver={detailTarget}
        onEdit={editFromDetail}
      />

      <DriverSheet
        open={sheetOpen}
        driver={target}
        onClose={() => setSheetOpen(false)}
      />

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
            toast.error(tConfirm('errorToast'));
            throw err;
          }
        }}
      />
    </section>
  );
}
