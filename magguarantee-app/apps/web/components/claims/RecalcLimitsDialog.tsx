'use client';

// `<RecalcLimitsDialog>` — «Przelicz wg aktualnych limitów» (docs/14 §16.6).
//
// A wniosek's amounts are FROZEN against the limits snapshot taken when it was
// filed. When an admin fixes a limit after the fact, this is the only way to
// pull the fix into an open wniosek — and the write is not reversible, so the
// numbers have to be seen BEFORE it happens.
//
// Sequence: open → `GET .../recalc-limits/preview` (dry run, writes nothing,
// no audit) → real «było → станет» + delta → confirm → `POST
// .../recalc-limits` → close + toast.
//
//   • while the dry run is in flight: <Skeleton> in the "Wg aktualnych
//     limitów" column and a disabled confirm — never a guess;
//   • `changed === false`: the "nothing moved" copy, footer collapses to
//     [Zamknij], the POST is not offered at all;
//   • the dry run 422s (`CLAIM_LIMITS_REFRESH_BLOCKED` — an authorised or
//     decided amount is frozen): the server's own Polish sentence is
//     rendered and the confirm is REMOVED, so the refusal arrives before the
//     write instead of after it;
//   • the POST fails: the dialog stays open with the message and the same
//     button, so a retry costs one click.
//
// It is a plain <Dialog>, not a <ConfirmDialog>: the latter can only carry a
// string, and the whole point here is the two-column table.

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ClaimDto } from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { ApiResponseError } from '@/lib/api/client';
import { deriveRecalcDialogView } from '@/lib/claims/recalcLimitsDialogState';
import { formatEur } from '@/lib/format/numbers';
import {
  useRecalcClaimLimits,
  useRecalcClaimLimitsPreview,
} from '@/lib/hooks/useClaims';

export interface RecalcLimitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claim: ClaimDto;
}

function formatInt(value: number): string {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(
    value,
  );
}

/** Signed EUR delta — no semantic colour: a smaller payout is not an error. */
function formatSignedEur(value: number): string {
  const formatted = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  }).format(value);
  return `€ ${formatted}`;
}

/** 4xx bodies carry a ready human message; 5xx / network do not. */
function serverMessage(err: unknown): string | null {
  return err instanceof ApiResponseError && err.status >= 400 && err.status < 500
    ? err.message
    : null;
}

export default function RecalcLimitsDialog({
  open,
  onOpenChange,
  claim,
}: RecalcLimitsDialogProps) {
  const t = useTranslations('employee.claims.modal.recalcLimits');
  const tCommon = useTranslations('common');

  const [writeError, setWriteError] = useState<string | null>(null);

  const previewQ = useRecalcClaimLimitsPreview(claim.nrZgl, { enabled: open });
  const preview = previewQ.data;

  const recalcM = useRecalcClaimLimits(claim.nrZgl, {
    onSuccess: () => {
      toast.success(t('success'));
      onOpenChange(false);
    },
    onError: (err) => {
      // Stays open — the same button retries.
      setWriteError(serverMessage(err) ?? t('error'));
    },
  });

  // Every render decision comes from the pure derivation in
  // `lib/claims/recalcLimitsDialogState` — that is what keeps "nothing is
  // committable before the dry run answers" a tested rule rather than a
  // hopefully-correct chain of `&&`s.
  const view = deriveRecalcDialogView({
    previewPending: open && previewQ.isPending,
    previewErrorMessage: previewQ.isError
      ? (serverMessage(previewQ.error) ?? t('error'))
      : null,
    preview,
    writing: recalcM.isPending,
    writeErrorMessage: writeError,
  });

  // The "before" column reads from the dry run (authoritative — that is the
  // row the server is about to overwrite) and falls back to the claim the
  // modal already holds while the dry run loads, so it never blinks a dash.
  const beforeKm = formatInt(
    preview ? preview.current.kmGuaranteed : claim.kmGuaranteed,
  );
  const beforePayment = formatEur(
    preview ? preview.current.paymentEur : claim.paymentEur,
  );

  const handleOpenChange = (next: boolean): void => {
    if (!next) setWriteError(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogBody')}</DialogDescription>
        </DialogHeader>

        {view.phase === 'unchanged' && (
          <p className="text-sm text-text">{t('noChange')}</p>
        )}

        {view.showTable && (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th />
                <th
                  scope="col"
                  className="px-2 pb-1 text-right text-xs font-bold uppercase tracking-wide text-text-sub"
                >
                  {t('colBefore')}
                </th>
                <th
                  scope="col"
                  className="pb-1 pl-2 text-right text-xs font-bold uppercase tracking-wide text-text-sub"
                >
                  {t('colAfter')}
                </th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow
                label={t('rowKmGuaranteed')}
                before={beforeKm}
                after={preview ? formatInt(preview.next.kmGuaranteed) : null}
                loading={view.showSkeleton}
              />
              <ComparisonRow
                label={t('rowPayment')}
                before={beforePayment}
                after={preview ? formatEur(preview.next.paymentEur) : null}
                loading={view.showSkeleton}
              />
            </tbody>
          </table>
        )}

        {view.deltaEur !== null && (
          <p className="mt-2 text-right text-xs tabular-nums text-text-sub">
            {t('delta', { value: formatSignedEur(view.deltaEur) })}
          </p>
        )}

        {view.showToZero && (
          <p className="mt-2 text-xs text-text-sub">{t('toZero')}</p>
        )}

        {view.errorMessage && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {view.errorMessage}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          {view.showConfirm ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={recalcM.isPending}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setWriteError(null);
                  recalcM.mutate();
                }}
                // Nothing may be committed before the dry run is in.
                disabled={view.confirmDisabled}
              >
                <RefreshCw size={14} aria-hidden />
                {recalcM.isPending ? t('loading') : t('confirm')}
              </Button>
            </>
          ) : (
            /* Refused by the status gate, or nothing to change — there is
               nothing to commit, so the whole confirm affordance is gone. */
            <Button type="button" onClick={() => handleOpenChange(false)}>
              {tCommon('close')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComparisonRow({
  label,
  before,
  after,
  loading,
}: {
  label: string;
  /** Already formatted — the dialog owns the number formatting. */
  before: string;
  /** `null` until the dry run answers. */
  after: string | null;
  loading: boolean;
}) {
  return (
    <tr>
      <th scope="row" className="py-1 pr-2 text-left font-normal text-text">
        {label}
      </th>
      <td className="px-2 py-1 text-right tabular-nums text-text-sub">
        {before}
      </td>
      <td className="py-1 pl-2 text-right tabular-nums font-semibold text-text">
        {loading ? (
          <Skeleton className="ml-auto h-4 w-20" />
        ) : (
          (after ?? <span className="font-normal text-text-sub">—</span>)
        )}
      </td>
    </tr>
  );
}
