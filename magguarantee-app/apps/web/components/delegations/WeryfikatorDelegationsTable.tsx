'use client';

// Phase 7 — weryfikator delegations table (docs/14-design-system.md §7.1).
//
// The read-only Phase 6.3 column set (auto / driver / route / period / status)
// PLUS one trailing `actions` column. EXACTLY TWO status-advancing actions,
// driven off the row status — there is NO cancel («Anuluj») control anywhere
// (owner decision 2026-06-10; cancel stays carrier-only):
//   • zgloszony → «Oznacz w trasie» → plain confirm dialog → POST /:id/in-transit
//   • w_trasie  → «Oznacz zjechał»  → date-only confirm    → POST /:id/returned
//   • zjechal / anulowany → no button (em-dash, keeps the column anchored).
//
// Each action button stops row-click propagation so opening a confirm dialog
// never also fires the row's read-only <DelegationDetailModal>. The buttons are
// the brand-default `size="sm"` variant (status advancement is the primary
// affordance, not destructive).

import { CheckCircle2, MapPin, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { DelegationDto } from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { DelegationDetailModal } from '@/components/delegations/DelegationDetailModal';
import {
  DelegationStatusActionDialog,
  type DelegationActionMode,
} from '@/components/delegations/DelegationStatusActionDialog';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  useMarkDelegationInTransit,
  useMarkDelegationReturned,
} from '@/lib/hooks/useDelegations';
import { formatDateShort } from '@/lib/format/numbers';

interface Props {
  rows: DelegationDto[];
  isLoading: boolean;
}

/** Which (if any) action a row exposes — strict state machine, at most one. */
function actionForStatus(
  status: DelegationDto['status'],
): DelegationActionMode | null {
  if (status === 'zgloszony') return 'in-transit';
  if (status === 'w_trasie') return 'returned';
  return null;
}

export function WeryfikatorDelegationsTable({ rows, isLoading }: Props) {
  const t = useTranslations('weryfikator.delegations');
  const tActions = useTranslations('weryfikator.actions');
  const tCommon = useTranslations('common');
  const tA11y = useTranslations('fleet.a11y');

  // Read-only VIEW modal on plain row click (same as the shared table).
  const [detailTarget, setDetailTarget] = useState<DelegationDto | null>(null);

  // The active confirm dialog: which row + which transition.
  const [actionTarget, setActionTarget] = useState<{
    row: DelegationDto;
    mode: DelegationActionMode;
  } | null>(null);

  const inTransitM = useMarkDelegationInTransit({
    onSuccess: () => toast.success(tActions('inTransitToast')),
    onError: () => toast.error(tActions('errorToast')),
  });
  const returnedM = useMarkDelegationReturned({
    onSuccess: () => toast.success(tActions('returnedToast')),
    onError: () => toast.error(tActions('errorToast')),
  });

  const mutating = inTransitM.isPending || returnedM.isPending;

  const handleConfirm = async (actualReturnAt?: string) => {
    if (!actionTarget) return;
    const { row, mode } = actionTarget;
    if (mode === 'in-transit') {
      await inTransitM.mutateAsync({ id: row.id });
    } else {
      // `actualReturnAt` is guaranteed present here — the dialog validates it
      // before calling onConfirm in `returned` mode.
      await returnedM.mutateAsync({
        id: row.id,
        body: { actualReturnAt: actualReturnAt as string },
      });
    }
  };

  const columns = useMemo<DataTableColumn<DelegationDto>[]>(
    () => [
      {
        id: 'vehicle',
        header: t('table.columns.vehicle'),
        cell: (row) => (
          <span className="font-mono font-semibold">
            {row.vehicle?.plateNumber ?? '—'}
          </span>
        ),
      },
      {
        id: 'driver',
        header: t('table.columns.driver'),
        cell: (row) => (
          <span className="font-semibold">
            {row.driver
              ? `${row.driver.firstName} ${row.driver.lastName}`
              : (row.driverNameSnapshot ?? '—')}
          </span>
        ),
      },
      {
        id: 'route',
        header: t('table.columns.route'),
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
        header: t('table.columns.period'),
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
        header: t('table.columns.status'),
        width: 'tight',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        id: 'actions',
        header: t('table.columns.actions'),
        width: 'tight',
        align: 'right',
        cell: (row) => {
          const mode = actionForStatus(row.status);
          if (!mode) {
            // Terminal status — keep the column anchored with an em-dash.
            return <span className="text-text-sub" aria-hidden>—</span>;
          }
          const Icon = mode === 'in-transit' ? Truck : CheckCircle2;
          const label =
            mode === 'in-transit'
              ? tActions('inTransit')
              : tActions('returned');
          return (
            <Button
              type="button"
              size="sm"
              onClick={(e) => {
                // Don't also trigger the row's detail-modal open.
                e.stopPropagation();
                setActionTarget({ row, mode });
              }}
              disabled={mutating}
            >
              <Icon size={14} className="mr-1.5" aria-hidden />
              {label}
            </Button>
          );
        },
      },
    ],
    [t, tActions, mutating],
  );

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={setDetailTarget}
        rowAriaLabel={(r) =>
          tA11y('showDelegationDetails', {
            name: r.vehicle?.plateNumber ?? '—',
          })
        }
        isLoading={isLoading}
        loadingLabel={tCommon('loading')}
        empty={
          <EmptyState
            icon={MapPin}
            title={t('table.emptyTitle')}
            message={t('table.emptyMessage')}
          />
        }
      />

      <DelegationDetailModal
        open={detailTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDetailTarget(null);
        }}
        delegation={detailTarget}
      />

      {actionTarget && (
        <DelegationStatusActionDialog
          open
          onOpenChange={(o) => {
            if (!o) setActionTarget(null);
          }}
          mode={actionTarget.mode}
          plate={actionTarget.row.vehicle?.plateNumber ?? '—'}
          departureAt={actionTarget.row.departureAt}
          onConfirm={handleConfirm}
          isLoading={mutating}
        />
      )}
    </>
  );
}
