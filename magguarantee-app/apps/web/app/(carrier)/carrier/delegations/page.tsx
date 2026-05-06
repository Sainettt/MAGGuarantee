'use client';

// Phase 3 — carrier delegations list. Status filter + cancel action on
// rows that are still `zgloszony`. Submit is on a separate page.

import { Plus, Rocket, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DelegationStatusSchema,
  type DelegationDto,
  type DelegationStatus,
} from '@magguarantee/shared';

import { StatusBadge } from '@/components/carrier/StatusBadge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { useCancelDelegation, useDelegations } from '@/lib/hooks/useDelegations';

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

export default function CarrierDelegationsPage() {
  const [status, setStatus] = useState<DelegationStatus | ''>('');
  const { data, isLoading } = useDelegations({
    status: status || undefined,
    limit: 50,
  });

  const cancelM = useCancelDelegation({
    onSuccess: () => toast.success('Wyjazd anulowany'),
    onError: () => toast.error('Nie udało się anulować wyjazdu'),
  });

  const [confirmTarget, setConfirmTarget] = useState<DelegationDto | null>(null);

  const columns = useMemo<DataTableColumn<DelegationDto>[]>(
    () => [
      {
        id: 'vehicle',
        header: 'Pojazd',
        cell: (row) => (
          <span className="font-mono font-semibold">
            {row.vehicle?.plateNumber ?? '—'}
          </span>
        ),
      },
      {
        id: 'driver',
        header: 'Kierowca',
        cell: (row) =>
          row.driver
            ? `${row.driver.firstName} ${row.driver.lastName}`
            : (row.driverNameSnapshot ?? '—'),
      },
      {
        id: 'departure',
        header: 'Wyjazd',
        cell: (row) => formatDateTime(row.departureAt),
      },
      {
        id: 'plannedReturn',
        header: 'Planowany powrót',
        cell: (row) => formatDateTime(row.plannedReturnAt),
      },
      {
        id: 'status',
        header: 'Status',
        cell: (row) => <StatusBadge status={row.status} />,
      },
      {
        id: 'actions',
        header: <span className="sr-only">Akcje</span>,
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
              aria-label="Anuluj wyjazd"
            >
              <X size={14} />
              Anuluj
            </Button>
          );
        },
      },
    ],
    [],
  );

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          Wyjazdy
        </h1>
        <Link href="/carrier/delegations/new">
          <Button size="sm">
            <Plus size={14} />
            Nowy wyjazd
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Select
          className="sm:max-w-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value as DelegationStatus | '')}
          aria-label="Filtruj po statusie"
        >
          <option value="">Wszystkie statusy</option>
          {DelegationStatusSchema.options.map((s) => (
            <option key={s} value={s}>
              {labelFor(s)}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        empty={
          <EmptyState
            icon={Rocket}
            title="Brak wyjazdów"
            message="Zarejestruj pierwszy wyjazd."
            action={
              <Link href="/carrier/delegations/new">
                <Button size="sm">
                  <Plus size={14} />
                  Nowy wyjazd
                </Button>
              </Link>
            }
          />
        }
      />

      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anulować wyjazd?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-sub">
            Tej operacji nie można cofnąć. Wyjazd zostanie oznaczony jako
            anulowany.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmTarget(null)}
              disabled={cancelM.isPending}
            >
              Wróć
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
              {cancelM.isPending ? 'Anulowanie…' : 'Anuluj wyjazd'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function labelFor(s: DelegationStatus): string {
  switch (s) {
    case 'zgloszony':
      return 'Zgłoszony';
    case 'w_trasie':
      return 'W trasie';
    case 'zjechal':
      return 'Zjechał';
    case 'anulowany':
      return 'Anulowany';
  }
}
