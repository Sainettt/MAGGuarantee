'use client';

// Phase 7.10 — weryfikator delegation-status board (docs/14 §7.10), the second
// of the role's two screens (alongside the §7.7 km-board, under the shared
// <WeryfikatorTabsNav>).
//
// REWORK 2026-06-20 #4: the weryfikator drives the two final operational
// transitions:
//   • `gotowy` rows → «Oznacz w trasie» (dialog C, plain confirm → /in-transit),
//   • `w_trasie` rows → «Oznacz zjechał» (dialog D, date-only `actualReturnAt`
//     pre-filled with `plannedReturnAt`, future-date guarded → /returned).
// At most ONE primary action per row (strict state machine, §7.10.2). Cancel is
// carrier/admin-only and is NOT here. Side effects of /returned (vehicle
// lastDroveAt bump + linked-wniosek auto-recalc) are invisible — they surface
// later on the pracownik ClaimModal (§7.10.4).
//
// Default board → ACTIVE statuses {zgloszony, gotowy, w_trasie}; «historia»
// toggle widens to zjechal/anulowany. Row-click opens the read-only detail.

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  RETURN_BEFORE_DEPARTURE_CODE,
  RETURN_DATE_FUTURE_CODE,
  type DelegationDto,
  type DelegationFilters,
  type DelegationStatus,
} from '@magguarantee/shared';

import { ApiResponseError } from '@/lib/api/client';
import { DelegationsBoardFilters } from '@/components/delegations/DelegationsBoardFilters';
import { MarkInTransitDialog } from '@/components/delegations/MarkInTransitDialog';
import { MarkReturnedDialog } from '@/components/delegations/MarkReturnedDialog';
import { OperationalDelegationsTable } from '@/components/delegations/OperationalDelegationsTable';
import { Button } from '@/components/ui/Button';
import {
  useDelegations,
  useMarkDelegationInTransit,
  useMarkDelegationReturned,
} from '@/lib/hooks/useDelegations';
import { queryErrorProps } from '@/lib/query/queryErrorProps';

type DialogTarget =
  | { kind: 'inTransit'; delegation: DelegationDto }
  | { kind: 'returned'; delegation: DelegationDto };

/** Pull the RFC-7807 `extensions.code` off a 422 problem-details envelope. */
function extractErrorCode(err: unknown): string | undefined {
  if (!(err instanceof ApiResponseError) || err.status !== 422) return undefined;
  const extensions = (err.data as { extensions?: unknown } | undefined)
    ?.extensions;
  if (!extensions || typeof extensions !== 'object') return undefined;
  const code = (extensions as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function WeryfikatorDelegationsView() {
  const t = useTranslations('weryfikator.delegations');
  const tActions = useTranslations('weryfikator.delegations.actions');
  const tA11y = useTranslations('fleet.a11y');

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

  const inTransitM = useMarkDelegationInTransit({
    onSuccess: () => toast.success(tActions('inTransitToast')),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : tActions('errorToast')),
  });

  const returnedM = useMarkDelegationReturned({
    onSuccess: () => toast.success(tActions('returnedToast')),
    onError: (err) => {
      // The dialog's client guards catch these pre-submit; the 422 only lands
      // here on a clock-skew / stale-data race — surface the specific copy.
      const code = extractErrorCode(err);
      if (code === RETURN_DATE_FUTURE_CODE) {
        toast.error(tActions('returnedFuture'));
        return;
      }
      if (code === RETURN_BEFORE_DEPARTURE_CODE) {
        toast.error(tActions('returnedBeforeDeparture'));
        return;
      }
      toast.error(err instanceof Error ? err.message : tActions('errorToast'));
    },
  });

  const renderActions = (row: DelegationDto) => {
    if (row.status === 'gotowy') {
      return (
        <Button
          type="button"
          size="sm"
          onClick={() => setDialog({ kind: 'inTransit', delegation: row })}
        >
          {tActions('markInTransit')}
        </Button>
      );
    }
    if (row.status === 'w_trasie') {
      return (
        <Button
          type="button"
          size="sm"
          onClick={() => setDialog({ kind: 'returned', delegation: row })}
        >
          {tActions('markReturned')}
        </Button>
      );
    }
    return null;
  };

  const plate = dialog?.delegation.vehicle?.plateNumber ?? '—';

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
      </header>

      <DelegationsBoardFilters
        namespace="weryfikator.delegations"
        status={status}
        onStatusChange={setStatus}
        includeHistory={includeHistory}
        onIncludeHistoryChange={setIncludeHistory}
      />

      <OperationalDelegationsTable
        rows={data?.items ?? []}
        isLoading={isLoading}
        {...queryErrorProps(delegationsQ)}
        namespace="weryfikator.delegations.table"
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

      {dialog?.kind === 'inTransit' && (
        <MarkInTransitDialog
          open
          onOpenChange={(o) => {
            if (!o) setDialog(null);
          }}
          plate={plate}
          departureAt={dialog.delegation.departureAt}
          title={tActions('inTransitTitle')}
          description={tActions('inTransitDescription', { plate })}
          dateLabel={tActions('inTransitDateLabel')}
          confirmLabel={tActions('markInTransit')}
          cancelLabel={tActions('cancel')}
          requiredMsg={tActions('inTransitRequired')}
          futureMsg={tActions('inTransitFuture')}
          beforeDepartureMsg={tActions('inTransitBeforeDeparture')}
          onConfirm={async (actualDepartureAt) => {
            await inTransitM.mutateAsync({
              id: dialog.delegation.id,
              body: { actualDepartureAt },
            });
          }}
        />
      )}

      {dialog?.kind === 'returned' && (
        <MarkReturnedDialog
          open
          onOpenChange={(o) => {
            if (!o) setDialog(null);
          }}
          plate={plate}
          plannedReturnAt={dialog.delegation.plannedReturnAt}
          vehicleId={dialog.delegation.vehicle?.id ?? null}
          departureAt={dialog.delegation.departureAt}
          actualDepartureAt={dialog.delegation.actualDepartureAt}
          title={tActions('returnedTitle')}
          description={tActions('returnedDescription', { plate })}
          dateLabel={tActions('returnedDateLabel')}
          confirmLabel={tActions('markReturned')}
          cancelLabel={tActions('cancel')}
          requiredMsg={tActions('returnedRequired')}
          futureMsg={tActions('returnedFuture')}
          beforeDepartureMsg={tActions('returnedBeforeDeparture')}
          incompleteWarning={(count) =>
            tActions('returnedIncompleteKm', { count })
          }
          onConfirm={async (actualReturnAt) => {
            await returnedM.mutateAsync({
              id: dialog.delegation.id,
              body: { actualReturnAt },
            });
          }}
        />
      )}
    </section>
  );
}
