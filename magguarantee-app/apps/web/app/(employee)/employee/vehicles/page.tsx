'use client';

// Admin CRUD — vehicles. The list table only shows the most useful 6 columns
// (per the Phase 2 spec — don't gold-plate). The full 36-field edit happens
// in the sheet.
//
// docs/14 §15 — this list is the drill-down target of the «Moja opieka» KPI
// tiles, so its two deep-linkable filters (lifecycle status + carrier) live in
// the URL (`?status=` / `?carrier=`), not in component state: a tile link, the
// `<Select>`s and the back button then all describe the same view. `search`
// stays local — keystrokes must not write history. Both URL filters are applied
// SERVER-side (`GET /vehicles?lifecycleStatus=&carrierId=`), so the row set
// matches the tile count instead of being a slice of the first page.

import { Pencil, Plus, SearchX, Truck, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { VehicleDto } from '@magguarantee/shared';

import { VehicleStatusBadge } from '@/components/carrier/VehicleStatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { VehicleDetailModal } from '@/components/vehicles/VehicleDetailModal';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useDeleteVehicle, useVehicles } from '@/lib/hooks/useVehicles';
import {
  VEHICLE_CARRIER_PARAM,
  VEHICLE_STATUS_OPTIONS,
  VEHICLE_STATUS_PARAM,
  parseVehicleStatusParam,
} from '@/lib/vehicles-filter';

import { VehicleFormDialog } from './VehicleFormDialog';

// TODO: GpsStatus column when Phase 5 fleet UI lands
// (locked spec in docs/14-design-system.md § GPS status indicator).

export default function VehiclesPage() {
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const tConfirm = useTranslations('confirmDelete');
  const tVehStatus = useTranslations('vehicleStatus');
  const { user } = useAuth();
  // The delete row-action renders for both admin and opiekun, and since the
  // vehicle hard-delete endpoint was RETIRED (Vehicle-status rework), BOTH now
  // run the same SOFT delete (`DELETE /vehicles/:id`, sets `deletedAt`,
  // restorable server-side). Carriers are the exception — they get no delete at
  // all (backend-locked out of fleet mutations).
  const isAdmin = user?.role === 'admin';
  const isOpiekun = user?.role === 'opiekun';
  const canDelete = isAdmin || isOpiekun;
  const [search, setSearch] = useState('');

  // ── URL-backed filters (§15) ────────────────────────────────────────────
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = parseVehicleStatusParam(searchParams.get(VEHICLE_STATUS_PARAM));
  const carrierId = searchParams.get(VEHICLE_CARRIER_PARAM) ?? '';

  /** Writes one filter param (empty → removed). `replace`, not `push`: flipping
   *  a filter is a refinement of the current view, not a new destination — the
   *  back button should leave the list, not walk back through every filter. */
  const setFilterParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const { data, isLoading } = useVehicles({
    q: search.length >= 2 ? search : undefined,
    carrierId: carrierId || undefined,
    lifecycleStatus: status ?? undefined,
    // 200 (the schema max), not 50: a status-filtered view has to hold every
    // vehicle the KPI tile counted, and the table has no pagination control.
    limit: 200,
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
  const softDeleteM = useDeleteVehicle();

  const hasActiveFilters = Boolean(search.length >= 2 || carrierId || status);
  const clearFilters = useCallback(() => {
    setSearch('');
    // One navigation for both params — two `setFilterParam` calls in a row
    // would race on the same (stale) `searchParams` snapshot.
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

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

  // Opens whichever delete dialog matches the current role (reason dialog for
  // admin, bare confirm for opiekun) — both share this target/open pair.
  const openDelete = useCallback((row: VehicleDto) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }, []);

  const columns = useMemo<DataTableColumn<VehicleDto>[]>(
    () => [
      {
        id: 'plate',
        header: t('fields.plateNumber'),
        cell: (row) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold">{row.plateNumber}</span>
            {/* Amber «Brak skanu porozumienia» — non-blocking (§13.2.3). */}
            {row.agreementScanMissing && (
              <Badge variant="warning">{t('agreementScanMissing')}</Badge>
            )}
          </span>
        ),
      },
      {
        id: 'fuelCard',
        header: t('fields.fuelCard'),
        align: 'center',
        cell: (row) =>
          row.fuelCard ? (
            row.fuelCardBlocked ? (
              <Badge variant="danger">{t('fuelCardStatus.blocked')}</Badge>
            ) : (
              <Badge variant="success">{t('fuelCardStatus.active')}</Badge>
            )
          ) : (
            <span className="text-text-sub">—</span>
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
        id: 'dispatchTeam',
        header: t('fields.dispatchTeam'),
        cell: (row) => (
          <span className="font-mono tabular-nums">
            {row.dispatchTeam?.code ?? '—'}
          </span>
        ),
      },
      {
        id: 'type',
        header: t('fields.type'),
        cell: (row) => row.type ?? '—',
      },
      {
        // Vehicle-status rework §6.3.6 — delegation-driven lifecycle badge
        // (retires the active/inactive flag; `active=false` → «Wyłączona»).
        id: 'status',
        header: t('fields.active'),
        cell: (row) => (
          <VehicleStatusBadge
            status={row.lifecycleStatus}
            daysSinceReturn={row.daysSinceReturn}
          />
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
              label: tConfirm('softConfirm'),
              icon: Trash2,
              destructive: true,
              onSelect: () => openDelete(row),
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
    [t, tCommon, tConfirm, canDelete, openDelete],
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
          onChange={(e) => setFilterParam(VEHICLE_CARRIER_PARAM, e.target.value)}
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
        {/* §15 — lifecycle-status filter. Lists all FIVE buckets, including
            «Wyłączone», which has no KPI tile but is a legitimate thing to look
            up once the filter exists. */}
        <Select
          className="sm:max-w-xs"
          value={status ?? ''}
          onChange={(e) => setFilterParam(VEHICLE_STATUS_PARAM, e.target.value)}
          aria-label={t('filters.statusLabel')}
        >
          <option value="">{t('filters.allStatuses')}</option>
          {VEHICLE_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {tVehStatus(`${s}.tile`)}
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

      <VehicleFormDialog
        open={sheetOpen}
        vehicle={target}
        onClose={() => setSheetOpen(false)}
      />

      {/* Admin + opiekun — soft delete, no powód. The vehicle hard-delete
          endpoint was retired (Vehicle-status rework); admin no longer runs a
          physical delete. The copy does NOT promise re-adding: a soft-deleted
          plate is blocked from recreation (409 VEHICLE_PLATE_SOFT_DELETED), so
          the same registration number cannot be added to the system again —
          hence the vehicle-specific `vehicleSoftBody` (not the shared
          `softBody`, which drivers/trailers/carriers keep). */}
      {canDelete && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={tConfirm('softTitle', {
            entityLabel: tConfirm('entityLabel.vehicle'),
          })}
          body={tConfirm('vehicleSoftBody', {
            entityName: deleteTarget?.plateNumber ?? '',
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
