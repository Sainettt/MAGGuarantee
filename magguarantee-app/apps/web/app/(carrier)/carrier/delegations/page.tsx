'use client';

// Phase 3 — carrier delegations list. Status filter + cancel action on
// rows that are still `zgloszony`. Submit is on a separate page.

import { Plus, Rocket, SearchX, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DelegationStatusSchema,
  type DelegationDto,
  type DelegationStatus,
} from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { DelegationDetailModal } from '@/components/delegations/DelegationDetailModal';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { useCancelDelegation, useDelegations } from '@/lib/hooks/useDelegations';
import { queryErrorProps } from '@/lib/query/queryErrorProps';

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// `plannedReturnAt` is date-only (`@db.Date`) — the driver commits to a day,
// not an hour. Rendering it with a time formatter would surface a spurious
// "02:00" (UTC-midnight shifted into PL's UTC+2), so format the date alone.
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export default function CarrierDelegationsPage() {
  const t = useTranslations('carrier.delegations');
  const tColumns = useTranslations('carrier.delegations.columns');
  const tStatus = useTranslations('carrier.delegations.status');
  const tCommon = useTranslations('common');
  const [status, setStatus] = useState<DelegationStatus | ''>('');
  const delegationsQ = useDelegations({
    status: status || undefined,
    limit: 50,
  });
  const { data, isLoading } = delegationsQ;

  const cancelM = useCancelDelegation({
    onSuccess: () => toast.success(t('cancelledToast')),
    onError: () => toast.error(t('cancelErrorToast')),
  });

  const [confirmTarget, setConfirmTarget] = useState<DelegationDto | null>(null);

  // Read-only detail modal — a plain row click opens it. Carriers cannot edit
  // a submitted trip, so no `onEdit` is passed (footer shows only «Zamknij»,
  // §6.6). Mirrors the vehicles/trailers/drivers carrier-fleet pattern.
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DelegationDto | null>(null);

  const openDetail = (row: DelegationDto) => {
    setDetailTarget(row);
    setDetailOpen(true);
  };

  const columns = useMemo<DataTableColumn<DelegationDto>[]>(
    () => [
      {
        id: 'vehicle',
        header: tColumns('vehicle'),
        cell: (row) => (
          <span className="font-mono font-semibold">
            {row.vehicle?.plateNumber ?? '—'}
          </span>
        ),
      },
      {
        id: 'driver',
        header: tColumns('driver'),
        cell: (row) =>
          row.driver
            ? `${row.driver.firstName} ${row.driver.lastName}`
            : (row.driverNameSnapshot ?? '—'),
      },
      {
        id: 'departure',
        header: tColumns('departure'),
        cell: (row) => formatDateTime(row.departureAt),
      },
      {
        id: 'plannedReturn',
        header: tColumns('plannedReturn'),
        cell: (row) => formatDate(row.plannedReturnAt),
      },
      {
        id: 'status',
        header: tColumns('status'),
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        id: 'actions',
        header: <span className="sr-only">{tColumns('actions')}</span>,
        align: 'right',
        cell: (row) => {
          if (row.status !== 'zgloszony') return null;
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmTarget(row);
              }}
              aria-label={t('cancelAriaLabel')}
            >
              <X size={14} />
              {t('cancel')}
            </Button>
          );
        },
      },
    ],
    [t, tColumns],
  );

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <Link href="/carrier/delegations/new">
          <Button size="sm">
            <Plus size={14} />
            {t('newDelegation')}
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Select
          className="sm:max-w-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value as DelegationStatus | '')}
          aria-label={t('filterByStatus')}
        >
          <option value="">{t('allStatuses')}</option>
          {DelegationStatusSchema.options.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
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
        {...queryErrorProps(delegationsQ)}
        hasActiveFilters={Boolean(status)}
        empty={
          <EmptyState
            icon={Rocket}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              <Link href="/carrier/delegations/new">
                <Button size="sm">
                  <Plus size={14} />
                  {t('newDelegation')}
                </Button>
              </Link>
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
                onClick={() => setStatus('')}
              >
                {tCommon('clearFilters')}
              </Button>
            }
          />
        }
      />

      <DelegationDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        delegation={detailTarget}
      />

      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancelDialogTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-sub">
            {t('cancelDialogBody')}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmTarget(null)}
              disabled={cancelM.isPending}
            >
              {t('cancelBack')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!confirmTarget) return;
                cancelM.mutate(
                  { id: confirmTarget.id },
                  { onSettled: () => setConfirmTarget(null) },
                );
              }}
              disabled={cancelM.isPending}
            >
              {cancelM.isPending ? t('cancelling') : t('cancelConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
