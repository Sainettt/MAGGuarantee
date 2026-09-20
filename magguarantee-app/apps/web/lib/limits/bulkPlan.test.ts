// Bulk application planning: month resolution, the three-way payload and the
// mandatory «Obecnie → Po zmianie» summary.

import { describe, expect, it } from 'vitest';
import type { MonthlyLimitDto } from '@magguarantee/shared';

import {
  buildBulkPayload,
  buildBulkSummary,
  resolveMonths,
  type BulkFormValues,
} from './bulkPlan';

function values(patch: Partial<BulkFormValues> = {}): BulkFormValues {
  return {
    mode: 'all',
    from: 1,
    to: 12,
    months: [],
    kmPerDayAction: 'none',
    kmPerDayValue: '',
    kmPerSaturdayAction: 'none',
    kmPerSaturdayValue: '',
    ratePerKm: '',
    ...patch,
  };
}

function row(
  month: number,
  kmPerDay: number | null,
  kmPerSaturday: number | null,
  ratePerKm: number | null,
): MonthlyLimitDto {
  return {
    id: `id-${month}`,
    year: 2026,
    month,
    kmPerDay,
    ratePerKm,
    kmPerSaturday,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('resolveMonths', () => {
  it('whole year', () => {
    expect(resolveMonths(values({ mode: 'all' }))).toHaveLength(12);
  });

  it('range, with reversed bounds swapped silently', () => {
    expect(resolveMonths(values({ mode: 'range', from: 3, to: 5 }))).toEqual([
      3, 4, 5,
    ]);
    expect(resolveMonths(values({ mode: 'range', from: 5, to: 3 }))).toEqual([
      3, 4, 5,
    ]);
  });

  it('custom selection is sorted and deduped', () => {
    expect(
      resolveMonths(values({ mode: 'custom', months: [11, 2, 11] })),
    ).toEqual([2, 11]);
  });
});

describe('buildBulkPayload — three outcomes per field', () => {
  it('"bez zmian" everywhere is not a change', () => {
    expect(buildBulkPayload(values())).toEqual({
      ok: false,
      error: 'noChanges',
    });
  });

  it('"Wyłącz" emits an explicit 0, never an omitted key', () => {
    expect(
      buildBulkPayload(values({ kmPerDayAction: 'disable' })),
    ).toEqual({ ok: true, payload: { kmPerDay: 0 } });
  });

  it('"Włącz i ustaw" without a value is an error, not a silent 0', () => {
    expect(
      buildBulkPayload(values({ kmPerDayAction: 'set', kmPerDayValue: '' })),
    ).toEqual({ ok: false, error: 'valueRequired' });
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

  it('rejects negatives', () => {
    expect(
      buildBulkPayload(values({ kmPerDayAction: 'set', kmPerDayValue: '-5' })),
    ).toEqual({ ok: false, error: 'valueRequired' });
  });
});

describe('buildBulkSummary', () => {
  const rows = new Map<number, MonthlyLimitDto>([
    [1, row(1, 540, 0, 0.5)], // configured, Saturdays off
    [2, row(2, 0, 0, 0.5)], // switched off
    // month 3 has no row at all → "brak (domyślne)"
  ]);

  it('never leaves an "Obecnie" cell empty', () => {
    const summary = buildBulkSummary([1, 2, 3], rows, { kmPerDay: 600 });
    expect(summary.rows.map((r) => r.kmPerDay.current.kind)).toEqual([
      'number',
      'disabled',
      'none',
    ]);
  });

  it('marks untouched columns as "bez zmian" and not as a change', () => {
    const summary = buildBulkSummary([1], rows, { kmPerDay: 600 });
    const only = summary.rows[0]!;
    expect(only.ratePerKm.next).toEqual({ kind: 'noChange' });
    expect(only.ratePerKm.changed).toBe(false);
    expect(only.changed).toBe(true);
  });

  it('counts changed / noop / overwritten months', () => {
    // Jan already has 540 → writing 540 changes nothing there.
    const summary = buildBulkSummary([1, 2, 3], rows, { kmPerDay: 540 });
    expect(summary.changedCount).toBe(2); // Feb (0→540), Mar (none→540)
    expect(summary.noopCount).toBe(1); // Jan
    // Only Feb actually overwrites a stored value; Mar had nothing stored.
    expect(summary.overwriteCount).toBe(1);
  });

  it('a km 0 renders as "wyłączone", a rate 0 stays a number', () => {
    const summary = buildBulkSummary([1], rows, {
      kmPerDay: 0,
      ratePerKm: 0,
    });
    const only = summary.rows[0]!;
    expect(only.kmPerDay.next).toEqual({ kind: 'disabled' });
    expect(only.ratePerKm.next).toEqual({ kind: 'number', value: 0 });
  });
});
