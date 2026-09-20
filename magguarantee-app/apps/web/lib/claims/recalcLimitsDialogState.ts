// What `<RecalcLimitsDialog>` shows, derived from the dry run (docs/14 §16.6).
//
// Extracted from the component so the gating rules that MUST hold are
// unit-tested without a DOM:
//   • nothing is committable before `GET .../recalc-limits/preview` answers
//     (confirm exists but is disabled, the "after" column is a skeleton);
//   • a refused dry run (422 `CLAIM_LIMITS_REFRESH_BLOCKED`) REMOVES the
//     confirm entirely and shows the server's own Polish text — the refusal
//     lands before the write, never after it;
//   • `changed === false` ⇒ the POST is not offered at all;
//   • a failed POST keeps the confirm so a retry costs one click.
//
// Pure, framework-free, unit-tested (`recalcLimitsDialogState.test.ts`).

import type { RecalcLimitsPreviewDto } from '@magguarantee/shared';

export interface RecalcDialogInput {
  /** The dry run is in flight (and the dialog is open). */
  previewPending: boolean;
  /** Message for a failed dry run — server text when it gave one. */
  previewErrorMessage: string | null;
  preview: RecalcLimitsPreviewDto | undefined;
  /** The POST is in flight. */
  writing: boolean;
  /** Message for a failed POST. */
  writeErrorMessage: string | null;
}

export type RecalcDialogPhase =
  /** Waiting for the dry run. */
  | 'loading'
  /** The dry run refused (status gate) or failed. */
  | 'blocked'
  /** The dry run says nothing would move. */
  | 'unchanged'
  /** Ready to commit (or committing). */
  | 'ready';

export interface RecalcDialogView {
  phase: RecalcDialogPhase;
  /** Render the two-column comparison. */
  showTable: boolean;
  /** Render `<Skeleton>` in the "Wg aktualnych limitów" column. */
  showSkeleton: boolean;
  /** Render the [Anuluj] + [Zastosuj nowe kwoty] pair at all. */
  showConfirm: boolean;
  confirmDisabled: boolean;
  /** `€` delta of the dopłata; `null` when there is nothing to compare. */
  deltaEur: number | null;
  /** The refreshed wniosek would pay nothing — warn about the reject-only gate. */
  showToZero: boolean;
  /** The single error line, if any. */
  errorMessage: string | null;
}

export function deriveRecalcDialogView(
  input: RecalcDialogInput,
): RecalcDialogView {
  const { preview } = input;

  if (input.previewErrorMessage !== null) {
    return {
      phase: 'blocked',
      showTable: false,
      showSkeleton: false,
      showConfirm: false,
      confirmDisabled: true,
      deltaEur: null,
      showToZero: false,
      errorMessage: input.previewErrorMessage,
    };
  }

  if (preview === undefined) {
    // Includes the "query not started yet" case — still not committable.
    return {
      phase: 'loading',
      showTable: true,
      showSkeleton: input.previewPending,
      showConfirm: true,
      confirmDisabled: true,
      deltaEur: null,
      showToZero: false,
      errorMessage: input.writeErrorMessage,
    };
  }

  if (!preview.changed) {
    return {
      phase: 'unchanged',
      showTable: false,
      showSkeleton: false,
      showConfirm: false,
      confirmDisabled: true,
      deltaEur: null,
      showToZero: false,
      errorMessage: input.writeErrorMessage,
    };
  }

  return {
    phase: 'ready',
    showTable: true,
    showSkeleton: false,
    showConfirm: true,
    confirmDisabled: input.writing,
    deltaEur: preview.next.paymentEur - preview.current.paymentEur,
    showToZero: preview.next.paymentEur === 0,
    errorMessage: input.writeErrorMessage,
  };
}
