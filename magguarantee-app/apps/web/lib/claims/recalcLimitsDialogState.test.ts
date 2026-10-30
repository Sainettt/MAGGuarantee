// The confirmation dialog may never offer a write it cannot justify (§16.6),
// and lists exactly the weeks whose limits moved (§18.8).

import { describe, expect, it } from 'vitest';
import type {
  RecalcLimitsChangedWeek,
  RecalcLimitsPreviewDto,
} from '@magguarantee/shared';

import {
  CHANGED_WEEKS_COLLAPSED,
  changedLimitFields,
  deriveRecalcDialogView,
  isChangedWeeksCollapsible,
  sortChangedWeeks,
  visibleChangedWeeks,
  weekKmChanged,
  type RecalcDialogInput,
} from './recalcLimitsDialogState';

function figures(kmGuaranteed: number, paymentEur: number) {
  return {
    kmGuaranteed,
    kmDifference: kmGuaranteed - 9000,
    paymentEur,
    ratePerKmEffective: 0.5,
    drivenDays: 18,
  };
}

/** 2026-W24 (08.06–14.06): km/day 540 → 500. */
function changedWeek(
  patch: Partial<RecalcLimitsChangedWeek> = {},
): RecalcLimitsChangedWeek {
  return {
    isoWeek: '2026-W24',
    periodStart: '2026-06-08',
    periodEnd: '2026-06-14',
    current: { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0, kmInWeek: 2700 },
    next: { kmPerDay: 500, ratePerKm: 0.5, kmPerSaturday: 0, kmInWeek: 2500 },
    ...patch,
  };
}

function preview(
  changed: boolean,
  next = figures(5500, 950),
  weeks: RecalcLimitsChangedWeek[] = [changedWeek()],
): RecalcLimitsPreviewDto {
  return {
    changed,
    current: figures(9000, 1750),
    next,
    changedWeeks: weeks,
    unchangedWeekCount: 3,
  };
}

function input(patch: Partial<RecalcDialogInput> = {}): RecalcDialogInput {
  return {
    previewPending: false,
    previewErrorMessage: null,
    preview: undefined,
    writing: false,
    writeErrorMessage: null,
    ...patch,
  };
}

describe('while the dry run is in flight', () => {
  const view = deriveRecalcDialogView(
    input({ previewPending: true, preview: undefined }),
  );

  it('shows the table with a skeleton in the "after" column', () => {
    expect(view.phase).toBe('loading');
    expect(view.showTable).toBe(true);
    expect(view.showSkeleton).toBe(true);
  });

  it('keeps the confirm visible but NOT clickable', () => {
    expect(view.showConfirm).toBe(true);
    expect(view.confirmDisabled).toBe(true);
  });

  it('shows no delta and no toZero note', () => {
    expect(view.deltaEur).toBeNull();
    expect(view.showToZero).toBe(false);
  });
});

describe('when the dry run is refused (422 status gate)', () => {
  const view = deriveRecalcDialogView(
    input({
      previewErrorMessage:
        'Wniosek został już rozpatrzony — kwota jest zamknięta.',
      preview: undefined,
    }),
  );

  it('REMOVES the confirm — the refusal arrives before any write', () => {
    expect(view.phase).toBe('blocked');
    expect(view.showConfirm).toBe(false);
  });

  it('renders the server text, not an invented one', () => {
    expect(view.errorMessage).toBe(
      'Wniosek został już rozpatrzony — kwota jest zamknięta.',
    );
    expect(view.showTable).toBe(false);
  });
});

describe('when the limits did not move', () => {
  const view = deriveRecalcDialogView(input({ preview: preview(false) }));

  it('offers no write at all', () => {
    expect(view.phase).toBe('unchanged');
    expect(view.showConfirm).toBe(false);
    expect(view.showTable).toBe(false);
    expect(view.deltaEur).toBeNull();
  });
});

describe('when the dry run reports a change', () => {
  const view = deriveRecalcDialogView(input({ preview: preview(true) }));

  it('enables the confirm and shows the signed delta', () => {
    expect(view.phase).toBe('ready');
    expect(view.showConfirm).toBe(true);
    expect(view.confirmDisabled).toBe(false);
    expect(view.deltaEur).toBe(950 - 1750);
  });

  it('warns when the refreshed wniosek would pay nothing', () => {
    expect(view.showToZero).toBe(false);
    const toZero = deriveRecalcDialogView(
      input({ preview: preview(true, figures(0, 0)) }),
    );
    expect(toZero.showToZero).toBe(true);
  });

  it('locks the confirm while the POST is in flight', () => {
    const writing = deriveRecalcDialogView(
      input({ preview: preview(true), writing: true }),
    );
    expect(writing.showConfirm).toBe(true);
    expect(writing.confirmDisabled).toBe(true);
  });

  it('keeps the confirm after a failed POST so a retry is one click', () => {
    const failed = deriveRecalcDialogView(
      input({
        preview: preview(true),
        writeErrorMessage: 'Nie udało się przeliczyć wniosku',
      }),
    );
    expect(failed.showConfirm).toBe(true);
    expect(failed.confirmDisabled).toBe(false);
    expect(failed.errorMessage).toBe('Nie udało się przeliczyć wniosku');
  });
});

describe('the changed-weeks list', () => {
  it('shows only when ready and at least one week changed', () => {
    expect(deriveRecalcDialogView(input({ preview: preview(true) })).showWeeks).toBe(
      true,
    );
    expect(
      deriveRecalcDialogView(input({ preview: preview(true, undefined, []) }))
        .showWeeks,
    ).toBe(false);
    // Nothing to apply ⇒ no list either (the «noChange» copy stands alone).
    expect(deriveRecalcDialogView(input({ preview: preview(false) })).showWeeks).toBe(
      false,
    );
    expect(
      deriveRecalcDialogView(input({ previewPending: true })).showWeeks,
    ).toBe(false);
    expect(
      deriveRecalcDialogView(input({ previewErrorMessage: 'x' })).showWeeks,
    ).toBe(false);
  });

  it('sorts by week key, across New Year', () => {
    const sorted = sortChangedWeeks([
      changedWeek({ isoWeek: '2027-W01' }),
      changedWeek({ isoWeek: '2026-W53' }),
      changedWeek({ isoWeek: '2026-W09' }),
    ]);
    expect(sorted.map((w) => w.isoWeek)).toEqual([
      '2026-W09',
      '2026-W53',
      '2027-W01',
    ]);
    expect(sortChangedWeeks(undefined)).toEqual([]);
  });

  it('up to 6 weeks are listed in full; above that 5 until expanded', () => {
    const weeks = Array.from({ length: 7 }, (_, i) =>
      changedWeek({ isoWeek: `2026-W${String(10 + i).padStart(2, '0')}` }),
    );
    expect(isChangedWeeksCollapsible(6)).toBe(false);
    expect(visibleChangedWeeks(weeks.slice(0, 6), false)).toHaveLength(6);
    expect(isChangedWeeksCollapsible(7)).toBe(true);
    expect(visibleChangedWeeks(weeks, false)).toHaveLength(CHANGED_WEEKS_COLLAPSED);
    expect(visibleChangedWeeks(weeks, true)).toHaveLength(7);
  });

  it('names only the limit values that moved, in column order', () => {
    expect(changedLimitFields(changedWeek())).toEqual(['kmPerDay']);
    expect(
      changedLimitFields(
        changedWeek({
          current: { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 300, kmInWeek: 300 },
          next: { kmPerDay: 0, ratePerKm: 0.55, kmPerSaturday: 400, kmInWeek: 400 },
        }),
      ),
    ).toEqual(['kmPerSaturday', 'ratePerKm']);
  });

  it('compares rates on the 4-decimal grid, not raw floats', () => {
    expect(
      changedLimitFields(
        changedWeek({
          current: { kmPerDay: 540, ratePerKm: 0.1 + 0.2, kmPerSaturday: 0, kmInWeek: 2700 },
          next: { kmPerDay: 540, ratePerKm: 0.3, kmPerSaturday: 0, kmInWeek: 2700 },
        }),
      ),
    ).toEqual([]);
  });

  it('a week whose km did not move shows one number (rate-only change)', () => {
    const rateOnly = changedWeek({
      current: { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0, kmInWeek: 2700 },
      next: { kmPerDay: 540, ratePerKm: 0.45, kmPerSaturday: 0, kmInWeek: 2700 },
    });
    expect(weekKmChanged(rateOnly)).toBe(false);
    expect(weekKmChanged(changedWeek())).toBe(true);
  });
});
