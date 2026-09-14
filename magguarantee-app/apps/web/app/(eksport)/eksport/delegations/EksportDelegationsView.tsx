'use client';

// Phase 7.10 — eksport OPERATIONAL delegations board (docs/14 §7.10).
//
// REWORK 2026-06-20 #4: the delegation lifecycle is operational again and
// eksport drives the `/ready` step. The board is no longer strictly read-only:
//   • `zgloszony` rows get a primary «Oznacz Gotowy» action (dialog A → /ready),
//   • `gotowy` rows get a guarded rollback «Cofnij do: zgłoszony» (dialog B,
//     `{rollback:true}` → /ready) — offered ONLY while not yet `w_trasie` (the
//     api enforces; the row simply shows no rollback once it advances).
// Delegation-CANCEL is NOT here (carrier/admin-only, §7.10.2). At most ONE
// primary action per row (strict state machine, §7.10.2 board placement).
//
// Default board → ACTIVE statuses {zgloszony, gotowy, w_trasie}; the «historia»
// toggle widens to include zjechal/anulowany (server `includeHistory`). An
// explicit status filter narrows on top. Row-click still opens the read-only
// <DelegationDetailModal> (via <OperationalDelegationsTable>).

import { Gauge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
  DelegationDto,
  DelegationFilters,
  DelegationStatus,
} from '@magguarantee/shared';

import { DelegationsBoardFilters } from '@/components/delegations/DelegationsBoardFilters';
import {
  MarkReadyDialog,
  type MarkReadyVariant,
} from '@/components/delegations/MarkReadyDialog';
import { OperationalDelegationsTable } from '@/components/delegations/OperationalDelegationsTable';
import { Button } from '@/components/ui/Button';
import { useDelegations, useMarkDelegationReady } from '@/lib/hooks/useDelegations';
import { queryErrorProps } from '@/lib/query/queryErrorProps';

interface DialogTarget {
  delegation: DelegationDto;
  variant: MarkReadyVariant;
}

export function EksportDelegationsView() {
  const t = useTranslations('eksport.delegations');
  const tActions = useTranslations('eksport.delegations.actions');
  const tA11y = useTranslations('fleet.a11y');
  const tKm = useTranslations('weryfikator.km');

  const [status, setStatus] = useState<DelegationStatus | ''>('');
  const [includeHistory, setIncludeHistory] = useState(false);
  const [dialog, setDialog] = useState<DialogTarget | null>(null);

  const filters: DelegationFilters = useMemo(
    () => ({
      limit: 50,
      status: status || undefined,
      includeHistory: includeHistory || undefined,
    }),
    [status, includeHistory],
  );

  const delegationsQ = useDelegations(filters);
  const { data, isLoading } = delegationsQ;

  const readyM = useMarkDelegationReady({
    onSuccess: (_data, vars) => {
      // The advance vs rollback toast — keyed off the body we sent.
      toast.success(
        vars.body?.rollback ? tActions('rolledBackToast') : tActions('readyToast'),
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : tActions('errorToast'));
    },
  });

  const handleConfirm = async (target: DialogTarget, spedOrderNumber?: string) => {
    // Rollback (`gotowy → zgloszony`) never carries the sped order number — the
    // server ignores it and clears the stored value. The advance flip requires
    // it (the dialog validates non-empty before calling here).
    if (target.variant === 'rollback') {
      await readyM.mutateAsync({
        id: target.delegation.id,
        body: { rollback: true },
      });
      return;
    }
    await readyM.mutateAsync({
      id: target.delegation.id,
      body: { rollback: false, spedOrderNumber },
    });
  };

  const renderActions = (row: DelegationDto) => {
    if (row.status === 'zgloszony') {
      return (
        <Button
          type="button"
          size="sm"
          onClick={() => setDialog({ delegation: row, variant: 'advance' })}
        >
          {tActions('markReady')}
        </Button>
      );
    }
    if (row.status === 'gotowy') {
      // Guarded rollback — only offered pre-`w_trasie` (which is exactly the
      // `gotowy` row). Ghost secondary affordance (§7.10.2).
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDialog({ delegation: row, variant: 'rollback' })}
        >
          {tActions('rollback')}
        </Button>
      );
    }
    return null;
  };

  const plate = dialog?.delegation.vehicle?.plateNumber ?? '—';

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
        </div>
        <Link
          href="/eksport/km"
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-[10px] border border-border bg-transparent px-3 text-[13px] font-bold text-text transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
        >
          <Gauge size={15} aria-hidden="true" />
          {tKm('title.report')}
        </Link>
      </header>

      <DelegationsBoardFilters
        namespace="eksport.delegations"
        status={status}
        onStatusChange={setStatus}
        includeHistory={includeHistory}
        onIncludeHistoryChange={setIncludeHistory}
      />

      <OperationalDelegationsTable
        rows={data?.items ?? []}
        isLoading={isLoading}
        {...queryErrorProps(delegationsQ)}
        namespace="eksport.delegations.table"
        hasActiveFilters={Boolean(status || includeHistory)}
        onClearFilters={() => {
          setStatus('');
          setIncludeHistory(false);
        }}
        rowAriaLabel={(r) =>
          tA11y('showDelegationDetails', {
            name: r.vehicle?.plateNumber ?? '—',
          })
        }
        renderActions={renderActions}
      />

      {dialog && (
        <MarkReadyDialog
          open
          onOpenChange={(o) => {
            if (!o) setDialog(null);
          }}
          variant={dialog.variant}
          plate={plate}
          title={
            dialog.variant === 'advance'
              ? tActions('advanceTitle')
              : tActions('rollbackTitle')
          }
          description={
            dialog.variant === 'advance'
              ? tActions('advanceDescription', { plate })
              : tActions('rollbackDescription', { plate })
          }
          confirmLabel={
            dialog.variant === 'advance'
              ? tActions('markReady')
              : tActions('rollbackConfirm')
          }
          cancelLabel={tActions('cancel')}
          spedOrderNumberLabel={tActions('spedOrderNumberLabel')}
          spedOrderNumberPlaceholder={tActions('spedOrderNumberPlaceholder')}
          spedOrderNumberRequired={tActions('spedOrderNumberRequired')}
          onConfirm={(spedOrderNumber) => handleConfirm(dialog, spedOrderNumber)}
        />
      )}
    </section>
  );
}
