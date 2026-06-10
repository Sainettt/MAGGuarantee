'use client';

// Phase 7.5 — weryfikator vehicle route-status board (docs/14 §7.5).
//
// One screen: every active vehicle, where the verifier stamps each one's daily
// operational route-status («W trasie» / «Zjechał») from an external GPS
// service + people outside the app. NOT read-only (the single mutating surface
// the weryfikator has), but NOT a state machine either — re-stampable ledger.
//
// Layout = the Phase 6.3 read-only role panel (filter strip → heading → table),
// plus the trailing `actions` column. Row-click opens the read-only history
// dialog; the action buttons stopPropagation so a stamp doesn't also open it.

import { Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
  VehicleBoardStatus,
  VehicleRouteBoardItemDto,
  VehicleRouteStatusValue,
} from '@magguarantee/shared';

import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { VehicleRouteStatusActions } from '@/components/vehicles/VehicleRouteStatusActions';
import { VehicleRouteStatusBadge } from '@/components/vehicles/VehicleRouteStatusBadge';
import { VehicleRouteStatusHistoryDialog } from '@/components/vehicles/VehicleRouteStatusHistoryDialog';
import {
  useSetVehicleRouteStatus,
  useVehicleRouteBoard,
} from '@/lib/hooks/useVehicleRouteStatus';
import { formatDateTime } from '@/lib/format/numbers';

const BOARD_STATUSES: readonly VehicleBoardStatus[] = [
  'w_trasie',
  'zjechal',
  'nieznany',
];

export function VehicleRouteBoardView() {
  const t = useTranslations('weryfikator.vehicles');
  const tStatus = useTranslations('weryfikator.vehicles.status');
  const tCommon = useTranslations('common');

  const [statusFilter, setStatusFilter] = useState<VehicleBoardStatus | ''>('');
  const [search, setSearch] = useState('');
  const [historyTarget, setHistoryTarget] =
    useState<VehicleRouteBoardItemDto | null>(null);
  /** The vehicle whose stamp is currently in flight (per-row pending). */
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data, isLoading } = useVehicleRouteBoard();

  const setStatusM = useSetVehicleRouteStatus({
    onSuccess: (_data, variables) => {
      toast.success(t('toast.success', { status: tStatus(variables.body.status) }));
    },
    onError: () => toast.error(t('toast.error')),
    onSettled: () => setPendingId(null),
  });

  const handleStamp = (
    vehicle: VehicleRouteBoardItemDto,
    status: VehicleRouteStatusValue,
  ) => {
    setPendingId(vehicle.id);
    setStatusM.mutate({ id: vehicle.id, body: { status } });
  };

  const allRows = useMemo(() => data ?? [], [data]);

  // Client-side filter + search (board is the whole fleet, unpaginated).
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((v) => {
      if (statusFilter && v.currentStatus !== statusFilter) return false;
      if (!q) return true;
      const haystack = [v.plateNumber, v.sideNumber, v.carrier]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allRows, statusFilter, search]);

  // Progress helper — checked = anything stamped today (not `nieznany`).
  const checkedToday = allRows.filter(
    (v) => v.currentStatus !== 'nieznany',
  ).length;

  const columns = useMemo<DataTableColumn<VehicleRouteBoardItemDto>[]>(
    () => [
      {
        id: 'vehicle',
        header: t('columns.vehicle'),
        width: 'tight',
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-medium tabular-nums">{row.plateNumber}</span>
            {row.sideNumber && (
              <span className="text-xs text-text-sub">
                {t('sideLabel', { side: row.sideNumber })}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'carrier',
        header: t('columns.carrier'),
        width: 'flex',
        truncate: 'ellipsis',
        cell: (row) => (
          <span title={row.carrier ?? undefined}>{row.carrier ?? '—'}</span>
        ),
      },
      {
        id: 'planista',
        header: t('columns.planista'),
        width: 'flex',
        truncate: 'ellipsis',
        cell: (row) => (
          <span title={row.planner ?? undefined}>{row.planner ?? '—'}</span>
        ),
      },
      {
        id: 'status',
        header: t('columns.status'),
        width: 'tight',
        cell: (row) => <VehicleRouteStatusBadge status={row.currentStatus} />,
      },
      {
        id: 'notedMeta',
        header: t('columns.noted'),
        width: 'tight',
        cell: (row) => {
          if (row.currentStatus === 'nieznany' || !row.notedAt) {
            return (
              <span className="text-text-sub" aria-hidden>
                —
              </span>
            );
          }
          return (
            <div className="flex flex-col">
              <span className="text-xs font-medium text-text">
                {row.notedBy?.name ?? t('history.gpsActor')}
              </span>
              <span className="text-xs tabular-nums text-text-sub">
                {formatDateTime(row.notedAt)}
              </span>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: <span className="sr-only">{t('columns.actions')}</span>,
        width: 'tight',
        align: 'right',
        cell: (row) => (
          <VehicleRouteStatusActions
            currentStatus={row.currentStatus}
            isPending={pendingId === row.id}
            onStamp={(status) => handleStamp(row, status)}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, pendingId],
  );

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-input p-3">
        <Select
          className="h-10 min-w-[160px] flex-1 sm:max-w-[12rem]"
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as VehicleBoardStatus | '')
          }
          aria-label={t('filters.status')}
        >
          <option value="">{t('filters.allStatuses')}</option>
          {BOARD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </Select>

        <Input
          className="h-10 min-w-[180px] flex-1 sm:max-w-[16rem]"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('filters.searchPlaceholder')}
          aria-label={t('filters.search')}
        />

        {!isLoading && allRows.length > 0 && (
          <p className="ml-auto text-sm text-text-sub" role="status">
            {t('progress', { checked: checkedToday, total: allRows.length })}
          </p>
        )}
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={setHistoryTarget}
        rowAriaLabel={(r) => t('a11y.showHistory', { plate: r.plateNumber })}
        isLoading={isLoading}
        loadingLabel={tCommon('loading')}
        empty={
          <EmptyState
            icon={Truck}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
      />

      <VehicleRouteStatusHistoryDialog
        vehicle={historyTarget}
        onOpenChange={(open) => {
          if (!open) setHistoryTarget(null);
        }}
      />
    </section>
  );
}
