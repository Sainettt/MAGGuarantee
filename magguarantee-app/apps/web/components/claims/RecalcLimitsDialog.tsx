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
//
// Weekly limits (§18.8, 2026-10-29): money first — the decision is about the
// amount — then ONLY the weeks of the period whose limits changed: the week
// label (clipped to the period, as in the breakdown) with «Km/tydz.» było →
// będzie, and a second line naming the limit values that moved («Km/dz. 540 →
// 500 · Sobota 300 → 400»). Unchanged weeks are one line. More than 6 changed
// weeks collapse to the first 5 + «Pokaż wszystkie (N)». Deltas carry no
// semantic colour (§16.6). The dialog is `max-w-lg` and scrolls inside itself
// once the expanded list outgrows the viewport.

import { ArrowRight, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment, useId, useState } from 'react';
import { toast } from 'sonner';
import type {
  ClaimDto,
  RecalcLimitsChangedWeek,
  RecalcLimitsWeekFigures,
} from '@magguarantee/shared';

import IsoWeekLabel from '@/components/claims/IsoWeekLabel';
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
import {
  changedLimitFields,
  deriveRecalcDialogView,
  isChangedWeeksCollapsible,
  sortChangedWeeks,
  visibleChangedWeeks,
  weekKmChanged,
  type WeekLimitField,
} from '@/lib/claims/recalcLimitsDialogState';
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

/** A week's €/km — up to 4 decimals (a limit may be 0,4750). */
function formatRate(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
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

        {view.showWeeks && preview && (
          <ChangedWeeks
            weeks={preview.changedWeeks}
            unchangedCount={preview.unchangedWeekCount}
          />
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

// ── Changed weeks (§18.8) ────────────────────────────────────────────

/** `→` — decorative icon + the shared sr-only «zmiana na» / «changes to». */
function ChangeArrow() {
  const tBulk = useTranslations('limits.bulk');
  return (
    <>
      <ArrowRight size={12} aria-hidden className="shrink-0 text-text-sub" />
      <span className="sr-only"> {tBulk('arrowSr')} </span>
    </>
  );
}

function ChangedWeeks({
  weeks,
  unchangedCount,
}: {
  weeks: readonly RecalcLimitsChangedWeek[];
  unchangedCount: number;
}) {
  const t = useTranslations('employee.claims.modal.recalcLimits');
  const headingId = useId();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);

  const sorted = sortChangedWeeks(weeks);
  const shown = visibleChangedWeeks(sorted, expanded);
  const collapsible = isChangedWeeksCollapsible(sorted.length);

  return (
    <section
      aria-labelledby={headingId}
      className="mt-5 border-t border-border pt-4"
    >
      <h3
        id={headingId}
        className="text-xs font-bold uppercase tracking-wider text-text-sub"
      >
        {t('changedWeeks', { count: sorted.length })}
      </h3>
      <ul id={listId} className="mt-2 space-y-2.5">
        {shown.map((week) => (
          <ChangedWeekItem key={week.isoWeek} week={week} />
        ))}
      </ul>
      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 py-1 text-xs font-semibold text-text underline-offset-2 hover:underline"
        >
          {expanded ? t('showLess') : t('showAll', { count: sorted.length })}
        </button>
      )}
      {unchangedCount > 0 && (
        <p className="mt-2 text-xs text-text-sub">
          {t('unchangedWeeks', { count: unchangedCount })}
        </p>
      )}
    </section>
  );
}

function ChangedWeekItem({ week }: { week: RecalcLimitsChangedWeek }) {
  const t = useTranslations('employee.claims.modal.recalcLimits');
  const fields = changedLimitFields(week);

  const fieldLabel: Record<WeekLimitField, string> = {
    kmPerDay: t('fieldKmPerDay'),
    kmPerSaturday: t('fieldSaturday'),
    ratePerKm: t('fieldRate'),
  };
  // «Było» is never blank (§18.8): a switched-off weekday guarantee is «wył.»,
  // a week without a Saturday guarantee is «—».
  const formatField = (
    field: WeekLimitField,
    figures: RecalcLimitsWeekFigures,
  ): string => {
    const value = figures[field];
    if (field === 'ratePerKm') return formatRate(value);
    if (value === 0) return field === 'kmPerDay' ? t('valueOff') : '—';
    return formatInt(value);
  };

  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <IsoWeekLabel
          isoWeek={week.isoWeek}
          periodStart={week.periodStart}
          periodEnd={week.periodEnd}
          className="text-text"
        />
        <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
          {weekKmChanged(week) ? (
            <>
              <span className="text-text-sub">
                {formatInt(week.current.kmInWeek)}
              </span>
              <ChangeArrow />
              <span className="font-semibold text-text">
                {formatInt(week.next.kmInWeek)}
              </span>
            </>
          ) : (
            <span className="text-text">{formatInt(week.next.kmInWeek)}</span>
          )}
          <span className="text-text-sub">km</span>
        </span>
      </div>
      {fields.length > 0 && (
        <p className="mt-0.5 text-xs tabular-nums text-text-sub">
          {fields.map((field, i) => (
            <Fragment key={field}>
              {i > 0 && ' · '}
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                {fieldLabel[field]} {formatField(field, week.current)}
                <ChangeArrow />
                {formatField(field, week.next)}
              </span>
            </Fragment>
          ))}
        </p>
      )}
    </li>
  );
}
