// What `<RecalcLimitsDialog>` shows, derived from the dry run (docs/14 §16.6,
// §18.8).
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
// Below the money: the weeks of the period whose limits changed (§18.8) —
// which limit values moved per week, the list collapsed to 5 above 6 weeks,
// and one line for the weeks that did not change.
//
// Pure, framework-free, unit-tested (`recalcLimitsDialogState.test.ts`).

import type {
  RecalcLimitsChangedWeek,
  RecalcLimitsPreviewDto,
  RecalcLimitsWeekFigures,
} from '@magguarantee/shared';

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
  /**
   * Render the «Zmienione limity (N tygodni)» list — only when ready and the
   * dry run named at least one changed week (a «Pozostałe N…» line with no
   * list above it would have nothing to be «the rest» of).
   */
  showWeeks: boolean;
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
      showWeeks: false,
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
      showWeeks: false,
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
      showWeeks: false,
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
    showWeeks: (preview.changedWeeks ?? []).length > 0,
    errorMessage: input.writeErrorMessage,
  };
}

// ── Changed weeks (§18.8) ────────────────────────────────────────────

/** Up to this many changed weeks the list is shown in full. */
export const CHANGED_WEEKS_SHOW_ALL_MAX = 6;
/** Above the threshold, the collapsed list shows this many. */
export const CHANGED_WEEKS_COLLAPSED = 5;

/** `YYYY-Www` keys sort chronologically as plain strings — sorted defensively. */
export function sortChangedWeeks(
  weeks: readonly RecalcLimitsChangedWeek[] | null | undefined,
): RecalcLimitsChangedWeek[] {
  return [...(weeks ?? [])].sort((a, b) =>
    a.isoWeek < b.isoWeek ? -1 : a.isoWeek > b.isoWeek ? 1 : 0,
  );
}

/** Whether the list needs the «Pokaż wszystkie (N)» toggle at all. */
export function isChangedWeeksCollapsible(count: number): boolean {
  return count > CHANGED_WEEKS_SHOW_ALL_MAX;
}

export function visibleChangedWeeks(
  sorted: readonly RecalcLimitsChangedWeek[],
  expanded: boolean,
): RecalcLimitsChangedWeek[] {
  if (expanded || !isChangedWeeksCollapsible(sorted.length)) return [...sorted];
  return sorted.slice(0, CHANGED_WEEKS_COLLAPSED);
}

/** A limit value of a week — the second line of a changed week names these. */
export type WeekLimitField = 'kmPerDay' | 'kmPerSaturday' | 'ratePerKm';

/** Display order: km/day · Saturday · rate (the order of the breakdown columns). */
const LIMIT_FIELDS: readonly WeekLimitField[] = [
  'kmPerDay',
  'kmPerSaturday',
  'ratePerKm',
];

/** Rates carry up to 4 decimals; compare on that grid, not on raw floats. */
function sameValue(field: WeekLimitField, a: number, b: number): boolean {
  if (field === 'ratePerKm') return Math.round(a * 10_000) === Math.round(b * 10_000);
  return a === b;
}

/** The limit values that moved in one week, in display order. */
export function changedLimitFields(week: {
  current: RecalcLimitsWeekFigures;
  next: RecalcLimitsWeekFigures;
}): WeekLimitField[] {
  return LIMIT_FIELDS.filter(
    (field) => !sameValue(field, week.current[field], week.next[field]),
  );
}

/** «Km/tydz.» moved — the first line shows «było → będzie», else one number. */
export function weekKmChanged(week: {
  current: Pick<RecalcLimitsWeekFigures, 'kmInWeek'>;
  next: Pick<RecalcLimitsWeekFigures, 'kmInWeek'>;
}): boolean {
  return week.current.kmInWeek !== week.next.kmInWeek;
}
