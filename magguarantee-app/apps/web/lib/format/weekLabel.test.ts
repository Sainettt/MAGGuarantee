// Week labels of the breakdown / recalc dialog (docs/14 §18.9). The edges that
// matter: local-date parsing (no UTC drift), the year only outside the week's
// ISO year (W01 / W53), the range clipped to the claim period, and garbage in
// → echoed, never «Invalid Date».

import { describe, expect, it } from 'vitest';

import {
  formatLongDate,
  formatLongDateRange,
  formatDateWithYear,
  formatRangeWithYear,
  formatWeekDate,
  intlLocaleTag,
  isoWeekLabelParts,
  parseLocalIsoDate,
} from './weekLabel';

describe('parseLocalIsoDate', () => {
  it('builds the LOCAL midnight of the calendar day', () => {
    const date = parseLocalIsoDate('2026-06-03');
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(5);
    expect(date?.getDate()).toBe(3);
    expect(date?.getHours()).toBe(0);
  });

  it('rejects non-dates instead of rolling them over', () => {
    expect(parseLocalIsoDate('2026-02-30')).toBeNull();
    expect(parseLocalIsoDate('2026-6-3')).toBeNull();
    expect(parseLocalIsoDate('2026-06-03T00:00:00.000Z')).toBeNull();
    expect(parseLocalIsoDate('garbage')).toBeNull();
  });
});

describe('formatWeekDate', () => {
  it('pl / en short day', () => {
    expect(formatWeekDate('2026-06-03', 'pl')).toBe('03.06');
    expect(formatWeekDate('2026-06-03', 'en')).toBe('03/06');
  });

  it('adds the year only outside the context year', () => {
    expect(formatWeekDate('2025-12-29', 'pl', 2026)).toBe('29.12.2025');
    expect(formatWeekDate('2026-01-04', 'pl', 2026)).toBe('04.01');
    expect(formatWeekDate('2025-12-29', 'en', 2026)).toBe('29/12/2025');
  });

  it('echoes an unparseable value', () => {
    expect(formatWeekDate('garbage', 'pl', 2026)).toBe('garbage');
  });
});

// ICU may put a thin / narrow no-break space around the range dash —
// compare on plain spaces so the assertion does not hinge on the ICU build.
function plain(text: string): string {
  return text.replace(/\s/gu, ' ');
}

describe('long dates', () => {
  it('formats a range with formatRange', () => {
    expect(plain(formatLongDateRange('2026-06-01', '2026-06-07', 'pl'))).toBe(
      '1–7 czerwca 2026',
    );
    expect(plain(formatLongDateRange('2025-12-29', '2026-01-04', 'pl'))).toBe(
      '29 grudnia 2025 – 4 stycznia 2026',
    );
  });

  it('collapses a one-day range to the date', () => {
    expect(plain(formatLongDateRange('2026-06-03', '2026-06-03', 'en'))).toBe(
      '3 June 2026',
    );
    expect(plain(formatLongDate('2026-06-03', 'pl'))).toBe('3 czerwca 2026');
  });

  it('echoes an unparseable range', () => {
    expect(formatLongDateRange('x', '2026-06-03', 'pl')).toBe('x–2026-06-03');
  });
});

describe('intlLocaleTag', () => {
  it('maps pl to pl-PL and everything else to en-GB', () => {
    expect(intlLocaleTag('pl')).toBe('pl-PL');
    expect(intlLocaleTag('en')).toBe('en-GB');
  });
});

describe('isoWeekLabelParts', () => {
  it('a first week clipped to the claim period (03.06–07.06 of W23)', () => {
    const parts = isoWeekLabelParts(
      { isoWeek: '2026-W23', periodStart: '2026-06-03', periodEnd: '2026-06-07' },
      'pl',
    );
    expect(parts).toEqual({
      week: 23,
      isoYear: 2026,
      from: '03.06',
      to: '07.06',
      singleDay: false,
      clipped: true,
      fullFrom: '01.06',
      fullTo: '07.06',
    });
  });

  it('a full week is not clipped', () => {
    const parts = isoWeekLabelParts(
      { isoWeek: '2026-W24', periodStart: '2026-06-08', periodEnd: '2026-06-14' },
      'en',
    );
    expect(parts?.clipped).toBe(false);
    expect(parts?.from).toBe('08/06');
    expect(parts?.to).toBe('14/06');
  });

  it('W01 2026 starts in 2025 — that date carries its year', () => {
    const parts = isoWeekLabelParts(
      { isoWeek: '2026-W01', periodStart: '2025-12-30', periodEnd: '2026-01-04' },
      'pl',
    );
    expect(parts?.from).toBe('30.12.2025');
    expect(parts?.to).toBe('04.01');
    expect(parts?.fullFrom).toBe('29.12.2025');
    expect(parts?.clipped).toBe(true);
  });

  it('W53 2026 ends in 2027', () => {
    const parts = isoWeekLabelParts(
      { isoWeek: '2026-W53', periodStart: '2026-12-28', periodEnd: '2027-01-03' },
      'pl',
    );
    expect(parts?.week).toBe(53);
    expect(parts?.to).toBe('03.01.2027');
    expect(parts?.clipped).toBe(false);
  });

  it('a single day of the week inside the period', () => {
    const parts = isoWeekLabelParts(
      { isoWeek: '2026-W22', periodStart: '2026-05-31', periodEnd: '2026-05-31' },
      'pl',
    );
    expect(parts?.singleDay).toBe(true);
    expect(parts?.from).toBe('31.05');
  });

  it('an invalid key yields null', () => {
    expect(
      isoWeekLabelParts(
        { isoWeek: '2027-W53', periodStart: '2027-12-27', periodEnd: '2027-12-31' },
        'pl',
      ),
    ).toBeNull();
    expect(
      isoWeekLabelParts(
        { isoWeek: '2026-06', periodStart: '2026-06-01', periodEnd: '2026-06-30' },
        'pl',
      ),
    ).toBeNull();
  });
});

describe('formatRangeWithYear (limits panel heading)', () => {
  it('the end always carries the year, the start only when it differs', () => {
    expect(formatRangeWithYear('2026-06-01', '2026-06-07', 'pl')).toBe(
      '01.06–07.06.2026',
    );
    expect(formatRangeWithYear('2025-12-29', '2026-01-04', 'pl')).toBe(
      '29.12.2025–04.01.2026',
    );
    expect(formatRangeWithYear('2026-06-01', '2026-06-07', 'en')).toBe(
      '01/06–07/06/2026',
    );
  });

  it('echoes garbage instead of «Invalid Date»', () => {
    expect(formatRangeWithYear('x', 'y', 'pl')).toBe('x–y');
  });
});

describe('formatDateWithYear (limits year span)', () => {
  it('always prints the year', () => {
    expect(formatDateWithYear('2025-12-29', 'pl')).toBe('29.12.2025');
    expect(formatDateWithYear('2027-01-03', 'en')).toBe('03/01/2027');
    expect(formatDateWithYear('nope', 'pl')).toBe('nope');
  });
});
