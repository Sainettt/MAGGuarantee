'use client';

// §7.10 operational delegations board — the eksport / weryfikator variant of
// the read-only <DelegationsTable>. Same column set + row-click →
// <DelegationDetailModal>, PLUS a trailing `actions` cell driven by a caller
// render-prop. The state machine is "at most one primary action per row"
// (§7.10.2 board placement) — the caller decides which (advance / rollback /
// in-transit / returned) based on `row.status` and its own role.
//
// Action controls live in their own cell and stop click-propagation so hitting
// a button never also triggers the row's detail-modal open.

import { MapPin, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, type ReactNode } from 'react';
import type { DelegationDto } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { DelegationDetailModal } from '@/components/delegations/DelegationDetailModal';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateShort } from '@/lib/format/numbers';

interface Props {
  rows: DelegationDto[];
  isLoading: boolean;
  /**
   * i18n namespace exposing `columns.{vehicle,carrier,route,period,status,
   * actions}` + `emptyTitle` + `emptyMessage` + `emptyFiltered.{title,message}`.
   */
  namespace: string;
  rowAriaLabel?: (row: DelegationDto) => string;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  /**
   * Per-row action renderer. Return the single primary action for the row
   * (or `null` for terminal `zjechal`/`anulowany`). Rendered in a click-isolated
   * cell so it never triggers the row's detail open.
   */
  renderActions: (row: DelegationDto) => ReactNode;
}

export function OperationalDelegationsTable({
  rows,
  isLoading,
  namespace,
  rowAriaLabel,
  hasActiveFilters,
  onClearFilters,
  renderActions,
}: Props) {
  const t = useTranslations(namespace);
  const tCommon = useTranslations('common');

  const [target, setTarget] = useState<DelegationDto | null>(null);

  const columns = useMemo<DataTableColumn<DelegationDto>[]>(
    () => [
      {
        id: 'vehicle',
        header: t('columns.vehicle'),
        cell: (row) => (
          <span className="font-mono font-semibold">
            {row.vehicle?.plateNumber ?? '—'}
          </span>
        ),
      },
      {
        id: 'carrier',
        header: t('columns.carrier'),
        cell: (row) => (
          <span className="font-semibold">
            {row.carrier?.name ?? row.carrier?.login ?? '—'}
          </span>
        ),
      },
      {
        id: 'route',
        header: t('columns.route'),
        width: 'flex',
        truncate: 'ellipsis',
        cell: (row) => (
          <span title={`${row.departureCountry} → ${row.returnCountry}`}>
            {row.departureCountry} → {row.returnCountry}
          </span>
        ),
      },
      {
        id: 'period',
        header: t('columns.period'),
        width: 'tight',
        cell: (row) => (
          <span className="tabular-nums">
            {formatDateShort(row.departureAt)} –{' '}
            {formatDateShort(row.plannedReturnAt)}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('columns.status'),
        width: 'tight',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        id: 'actions',
        header: t('columns.actions'),
        width: 'tight',
        align: 'right',
        cell: (row) => {
          const node = renderActions(row);
          if (!node) {
            return <span className="text-text-sub" aria-hidden>—</span>;
          }
          // Isolate the action cell from the row's click/keyboard activation —
          // pressing a button must not also open the detail modal.
          return (
            <div
              className="flex items-center justify-end gap-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {node}
            </div>
          );
        },
      },
    ],
    [t, renderActions],
  );

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={setTarget}
        rowAriaLabel={rowAriaLabel}
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        empty={
          <EmptyState
            icon={MapPin}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
        emptyFiltered={
          <EmptyState
            icon={SearchX}
            title={t('emptyFiltered.title')}
            message={t('emptyFiltered.message')}
            action={
              onClearFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClearFilters}
                >
                  {tCommon('clearFilters')}
                </Button>
              ) : undefined
            }
          />
        }
      />

      <DelegationDetailModal
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        delegation={target}
      />
    </>
  );
}
