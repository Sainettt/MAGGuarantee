// Bulk editing planning per ISO week: the three-way payload, the fill-down and
// the mandatory «Obecnie → Po zmianie» summary.

import { describe, expect, it } from 'vitest';

import {
  EMPTY_BULK_FORM,
  buildBulkPayload,
  buildBulkSummary,
  fillFromWeek,
  isBulkFormTouched,
  type BulkFormValues,
} from './bulkPlan';
import { EMPTY_WEEK_VALUES, type WeekLimitValues } from './limitState';

function values(patch: Partial<BulkFormValues> = {}): BulkFormValues {
  return { ...EMPTY_BULK_FORM, ...patch };
}

function week(
  kmPerDay: number | null,
  kmPerSaturday: number | null,
  ratePerKm: number | null,
): WeekLimitValues {
  return { kmPerDay, kmPerSaturday, ratePerKm };
}

describe('buildBulkPayload — three outcomes per field', () => {
  it('"bez zmian" everywhere is not a change', () => {
    expect(buildBulkPayload(values())).toEqual({
      ok: false,
      error: 'noChanges',
    });
    expect(isBulkFormTouched(values())).toBe(false);
  });

  it('"Wyłącz" emits an explicit 0, never an omitted key', () => {
    expect(buildBulkPayload(values({ kmPerDayAction: 'disable' }))).toEqual({
      ok: true,
      payload: { kmPerDay: 0 },
    });
  });

  it('"Włącz i ustaw" without a value is an error, not a silent 0', () => {
    expect(
      buildBulkPayload(values({ kmPerDayAction: 'set', kmPerDayValue: '' })),
    ).toEqual({ ok: false, error: 'valueRequired' });
    expect(isBulkFormTouched(values({ kmPerDayAction: 'set' }))).toBe(true);
  });

  it('untouched fields are OMITTED (no NULL, no zero)', () => {
    const out = buildBulkPayload(
      values({ kmPerSaturdayAction: 'set', kmPerSaturdayValue: '300' }),
    );
    expect(out).toEqual({ ok: true, payload: { kmPerSaturday: 300 } });
    if (out.ok) {
      expect('kmPerDay' in out.payload).toBe(false);
      expect('ratePerKm' in out.payload).toBe(false);
    }
  });

  it('an empty rate means "bez zmian"; a filled one is parsed PL-style', () => {
    expect(buildBulkPayload(values({ ratePerKm: '' })).ok).toBe(false);
    expect(buildBulkPayload(values({ ratePerKm: '0,52' }))).toEqual({
      ok: true,
      payload: { ratePerKm: 0.52 },
    });
  });

  it('rejects negatives and garbage', () => {
    expect(
      buildBulkPayload(values({ kmPerDayAction: 'set', kmPerDayValue: '-5' })),
    ).toEqual({ ok: false, error: 'valueRequired' });
    expect(buildBulkPayload(values({ ratePerKm: 'abc' }))).toEqual({
      ok: false,
      error: 'valueRequired',
    });
  });
});

describe('fillFromWeek — fill-down never copies NULL', () => {
  it('NULL ⇒ «Bez zmian», 0 ⇒ «Wyłącz», n ⇒ «Włącz i ustaw n»', () => {
    expect(fillFromWeek(week(540, 0, 0.5))).toEqual({
      kmPerDayAction: 'set',
      kmPerDayValue: '540',
      kmPerSaturdayAction: 'disable',
      kmPerSaturdayValue: '',
      ratePerKm: '0.5',
    });
    expect(fillFromWeek(EMPTY_WEEK_VALUES)).toEqual(EMPTY_BULK_FORM);
  });

  it('a week that is off fills «Wyłącz» for km/day and keeps its rate', () => {
    const filled = fillFromWeek(week(0, 300, 0));
    expect(filled.kmPerDayAction).toBe('disable');
    expect(filled.kmPerSaturdayAction).toBe('set');
    expect(filled.kmPerSaturdayValue).toBe('300');
    // A rate of 0 is a price, it is copied.
    expect(filled.ratePerKm).toBe('0');
  });
});

describe('buildBulkSummary', () => {
  const stored = new Map<number, WeekLimitValues>([
    [10, week(540, 0, 0.5)], // configured, Saturday off
    [11, week(0, 0, 0.5)], // switched off
    // week 12 has no row at all → "brak (domyślne)"
  ]);
  const lookup = (w: number): WeekLimitValues =>
    stored.get(w) ?? EMPTY_WEEK_VALUES;

  it('never leaves an "Obecnie" cell empty', () => {
    const summary = buildBulkSummary([10, 11, 12], lookup, { kmPerDay: 600 });
    expect(summary.rows.map((r) => r.kmPerDay.current.kind)).toEqual([
      'number',
      'disabled',
      'none',
    ]);
    expect(summary.rows.map((r) => r.isoWeek)).toEqual([10, 11, 12]);
  });

  it('marks untouched columns as "bez zmian" and not as a change', () => {
    const summary = buildBulkSummary([10], lookup, { kmPerDay: 600 });
    const only = summary.rows[0]!;
    expect(only.ratePerKm.next).toEqual({ kind: 'noChange' });
    expect(only.ratePerKm.changed).toBe(false);
    expect(only.changed).toBe(true);
    expect(only.kmPerDay.nextRaw).toBe(600);
    expect(only.kmPerDay.currentRaw).toBe(540);
  });

  it('counts changed / noop / overwritten weeks', () => {
    // W10 already has 540 → writing 540 changes nothing there.
    const summary = buildBulkSummary([10, 11, 12], lookup, { kmPerDay: 540 });
    expect(summary.changedCount).toBe(2); // W11 (0→540), W12 (none→540)
    expect(summary.noopCount).toBe(1); // W10
    // Only W11 actually overwrites a stored value; W12 had nothing stored.
    expect(summary.overwriteCount).toBe(1);
  });

  it('a km 0 renders as "wyłączone", a rate 0 stays a number', () => {
    const summary = buildBulkSummary([10], lookup, {
      kmPerDay: 0,
      ratePerKm: 0,
    });
    const only = summary.rows[0]!;
    expect(only.kmPerDay.next).toEqual({ kind: 'disabled' });
    expect(only.ratePerKm.next).toEqual({ kind: 'number', value: 0 });
  });

  it('switching a NULL Saturday off is no change (its NULL already means off)', () => {
    const summary = buildBulkSummary([12], lookup, { kmPerSaturday: 0 });
    expect(summary.rows[0]!.kmPerSaturday.current).toEqual({ kind: 'disabled' });
    expect(summary.changedCount).toBe(0);
    expect(summary.noopCount).toBe(1);
  });

  it('a stored Saturday 0 that becomes 300 is an overwrite', () => {
    const summary = buildBulkSummary([10], lookup, { kmPerSaturday: 300 });
    expect(summary.changedCount).toBe(1);
    expect(summary.overwriteCount).toBe(1);
  });
});
