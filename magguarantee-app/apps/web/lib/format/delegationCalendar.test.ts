// Unit tests for the km-calendar window rule (docs/14-design-system.md §7.7).
//
// Most of these tests pin the END of the render window, which differs per
// delegation status and (for w_trasie) per the km rows present. The START is
// pinned by the (g*) cases and `delegationStartDay`: the Warsaw day of the
// true-UTC `departureAt`, or the raw day of the wall-clock `actualDepartureAt`
// (docs/19 #16, UWAGI #30). All expectations are literals — `businessDateIso`
// pins Europe/Warsaw itself, so nothing depends on the process timezone.
// `today` is injected; the render end is data-driven and never reads it, so
// the value is arbitrary here except where it gates the FETCH `to`.

import { describe, expect, it } from 'vitest';
import type { DelegationDto, VehicleDailyKmDto } from '@magguarantee/shared';

import {
  calendarFetchTo,
  delegationStartDay,
  deriveCalendarWindow,
} from './delegationCalendar';

const TODAY = '2026-06-25';

type DelegFields = Pick<
  DelegationDto,
  | 'departureAt'
  | 'actualDepartureAt'
  | 'plannedReturnAt'
  | 'actualReturnAt'
  | 'status'
>;

/** Minimal delegation factory — only the fields the rule reads matter. */
function deleg(over: Partial<DelegFields>): DelegFields {
  return {
    departureAt: '2026-06-01T08:30:00.000Z',
    actualDepartureAt: null,
    plannedReturnAt: '2026-06-10',
    actualReturnAt: null,
    status: 'w_trasie',
    ...over,
  };
}

/** Km-row factory — only `date` is read by the rule. */
function km(date: string): Pick<VehicleDailyKmDto, 'date'> {
  return { date };
}

describe('deriveCalendarWindow', () => {
  it('(g) start = Warsaw day of departureAt when no actualDepartureAt (23:45Z = 01:45 CEST next day)', () => {
    // UWAGI #30: `departureAt` is a TRUE UTC instant (docs/19 #16).
    // 2026-06-01T23:45Z is 2026-06-02 01:45 in Warsaw (CEST, +02:00), so the
    // business start day is 06-02 — NOT the UTC ISO slice 06-01.
    const { fromIso } = deriveCalendarWindow(
      deleg({ departureAt: '2026-06-01T23:45:00.000Z', actualDepartureAt: null }),
      [],
      TODAY,
    );
    expect(fromIso).toBe('2026-06-02');
  });

  it('(g1) a daytime departureAt stays on the same day', () => {
    // 2026-06-01T08:30Z = 10:30 CEST — UTC and Warsaw calendar days agree.
    const { fromIso } = deriveCalendarWindow(
      deleg({ departureAt: '2026-06-01T08:30:00.000Z', actualDepartureAt: null }),
      [],
      TODAY,
    );
    expect(fromIso).toBe('2026-06-01');
  });

  it('(g1b) a CET night departureAt (23:30Z = 00:30 CET) starts on the next Warsaw day', () => {
    // Winter offset is +01:00: 2026-01-14T23:30Z is 2026-01-15 00:30 in Warsaw.
    const { fromIso } = deriveCalendarWindow(
      deleg({
        departureAt: '2026-01-14T23:30:00.000Z',
        actualDepartureAt: null,
        plannedReturnAt: '2026-01-20',
      }),
      [],
      TODAY,
    );
    expect(fromIso).toBe('2026-01-15');
  });

  it('(g2) start = date(actualDepartureAt) when the verifier moved it forward', () => {
    // Carrier reported 2026-06-01; verifier confirmed the truck actually left
    // 2026-06-03. The strip must start at the real start, not the reported one.
    const { fromIso } = deriveCalendarWindow(
      deleg({
        departureAt: '2026-06-01T08:30:00.000Z',
        actualDepartureAt: '2026-06-03T00:00:00.000Z',
      }),
      [],
      TODAY,
    );
    expect(fromIso).toBe('2026-06-03');
  });

  it('(g3) km rows on "phantom" days before actualDepartureAt are excluded from the window', () => {
    // actualDepartureAt = 2026-06-03; rows on 06-01/06-02 are pre-actual-start
    // "phantom" days and must NOT anchor the strip or count as lastKmDate.
    const { fromIso, toIso } = deriveCalendarWindow(
      deleg({
        departureAt: '2026-06-01T08:30:00.000Z',
        actualDepartureAt: '2026-06-03T00:00:00.000Z',
        status: 'w_trasie',
        plannedReturnAt: '2026-06-10',
      }),
      [km('2026-06-01'), km('2026-06-02'), km('2026-06-07')],
      TODAY,
    );
    expect(fromIso).toBe('2026-06-03');
    // Only 06-07 is ≥ start and it's within the plan → falls back to plannedReturnAt.
    expect(toIso).toBe('2026-06-10');
  });

  it('(a) zjechal with actualReturnAt > plannedReturnAt → end = actualReturnAt', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({
        status: 'zjechal',
        plannedReturnAt: '2026-06-10',
        actualReturnAt: '2026-06-14',
      }),
      [],
      TODAY,
    );
    expect(toIso).toBe('2026-06-14');
  });

  it('(b) zjechal with actualReturnAt ≤ plannedReturnAt (early return) → end = actualReturnAt', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({
        status: 'zjechal',
        plannedReturnAt: '2026-06-10',
        actualReturnAt: '2026-06-07',
      }),
      [],
      TODAY,
    );
    expect(toIso).toBe('2026-06-07');
  });

  it('zjechal slices a datetime actualReturnAt defensively to 10', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({
        status: 'zjechal',
        plannedReturnAt: '2026-06-10',
        actualReturnAt: '2026-06-14T17:05:00.000Z',
      }),
      [],
      TODAY,
    );
    expect(toIso).toBe('2026-06-14');
  });

  it('(c) w_trasie with km rows extending past plannedReturnAt → end = lastKmDate', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({ status: 'w_trasie', plannedReturnAt: '2026-06-10' }),
      [km('2026-06-05'), km('2026-06-13'), km('2026-06-09')],
      TODAY,
    );
    expect(toIso).toBe('2026-06-13');
  });

  it('(d) w_trasie with no km rows → end = plannedReturnAt', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({ status: 'w_trasie', plannedReturnAt: '2026-06-10' }),
      [],
      TODAY,
    );
    expect(toIso).toBe('2026-06-10');
  });

  it('(e) w_trasie with lastKmDate < plannedReturnAt → end = plannedReturnAt (max wins)', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({ status: 'w_trasie', plannedReturnAt: '2026-06-10' }),
      [km('2026-06-05'), km('2026-06-08')],
      TODAY,
    );
    expect(toIso).toBe('2026-06-10');
  });

  it('(e2) w_trasie with lastKmDate == plannedReturnAt → end = plannedReturnAt', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({ status: 'w_trasie', plannedReturnAt: '2026-06-10' }),
      [km('2026-06-10')],
      TODAY,
    );
    expect(toIso).toBe('2026-06-10');
  });

  it('(f) gotowy → end = plannedReturnAt', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({ status: 'gotowy', plannedReturnAt: '2026-06-10' }),
      [km('2026-06-13')],
      TODAY,
    );
    expect(toIso).toBe('2026-06-10');
  });

  it('(f) zgloszony → end = plannedReturnAt', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({ status: 'zgloszony', plannedReturnAt: '2026-06-10' }),
      [km('2026-06-13')],
      TODAY,
    );
    expect(toIso).toBe('2026-06-10');
  });

  it('(g) w_trasie rows with date < start are ignored for lastKmDate', () => {
    // departure 2026-06-01; a row dated 2026-05-28 belongs to a prior trip.
    const { fromIso, toIso } = deriveCalendarWindow(
      deleg({
        departureAt: '2026-06-01T08:00:00.000Z',
        status: 'w_trasie',
        plannedReturnAt: '2026-06-10',
      }),
      [km('2026-05-28'), km('2026-05-30'), km('2026-06-07')],
      TODAY,
    );
    expect(fromIso).toBe('2026-06-01');
    // No row ≥ start exceeds the plan → falls back to plannedReturnAt.
    expect(toIso).toBe('2026-06-10');
  });

  it('(g) a prior-trip row past the plan is still ignored (only ≥ start counts)', () => {
    // A stray row dated before departure but lexically > plannedReturnAt could
    // only happen across a year boundary; guard that date<start wins regardless.
    const { toIso } = deriveCalendarWindow(
      deleg({
        departureAt: '2026-06-01T08:00:00.000Z',
        status: 'w_trasie',
        plannedReturnAt: '2026-06-10',
      }),
      [km('2026-05-15'), km('2026-06-09')],
      TODAY,
    );
    expect(toIso).toBe('2026-06-10');
  });

  it('km row datetime dates are sliced defensively to 10', () => {
    const { toIso } = deriveCalendarWindow(
      deleg({ status: 'w_trasie', plannedReturnAt: '2026-06-10' }),
      [{ date: '2026-06-13T00:00:00.000Z' } as VehicleDailyKmDto],
      TODAY,
    );
    expect(toIso).toBe('2026-06-13');
  });
});

describe('calendarFetchTo', () => {
  it('w_trasie → today (broad upper bound)', () => {
    expect(
      calendarFetchTo(deleg({ status: 'w_trasie' }), TODAY),
    ).toBe(TODAY);
  });

  it('zjechal → actualReturnAt (date portion)', () => {
    expect(
      calendarFetchTo(
        deleg({ status: 'zjechal', actualReturnAt: '2026-06-14T12:00:00.000Z' }),
        TODAY,
      ),
    ).toBe('2026-06-14');
  });

  it('zjechal without actualReturnAt → plannedReturnAt (defensive)', () => {
    expect(
      calendarFetchTo(
        deleg({ status: 'zjechal', actualReturnAt: null, plannedReturnAt: '2026-06-10' }),
        TODAY,
      ),
    ).toBe('2026-06-10');
  });

  it('gotowy → plannedReturnAt', () => {
    expect(
      calendarFetchTo(
        deleg({ status: 'gotowy', plannedReturnAt: '2026-06-10' }),
        TODAY,
      ),
    ).toBe('2026-06-10');
  });

  it('zgloszony → plannedReturnAt', () => {
    expect(
      calendarFetchTo(
        deleg({ status: 'zgloszony', plannedReturnAt: '2026-06-10' }),
        TODAY,
      ),
    ).toBe('2026-06-10');
  });
});

describe('delegationStartDay', () => {
  it('actualDepartureAt set → its raw date portion (wall-clock, NOT zone-converted)', () => {
    // Wall-clock 23:30 labelled UTC: converting to Warsaw would give 06-04
    // (UWAGI #26 in reverse). The raw slice is the business date.
    expect(
      delegationStartDay('2026-06-03T23:30:00.000Z', '2026-06-01T08:30:00.000Z'),
    ).toBe('2026-06-03');
  });

  it('actualDepartureAt set → wins over a night departureAt', () => {
    expect(
      delegationStartDay('2026-06-03T00:00:00.000Z', '2026-06-01T23:45:00.000Z'),
    ).toBe('2026-06-03');
  });

  it('actualDepartureAt null → Warsaw day of departureAt (CEST night → next day)', () => {
    expect(delegationStartDay(null, '2026-06-01T23:45:00.000Z')).toBe(
      '2026-06-02',
    );
  });

  it('actualDepartureAt null → Warsaw day of departureAt (CET night → next day)', () => {
    expect(delegationStartDay(null, '2026-01-14T23:30:00.000Z')).toBe(
      '2026-01-15',
    );
  });

  it('actualDepartureAt null → daytime departureAt stays on the same day', () => {
    expect(delegationStartDay(null, '2026-06-01T08:30:00.000Z')).toBe(
      '2026-06-01',
    );
  });

  it('actualDepartureAt null → last minute before Warsaw midnight stays on the same day', () => {
    // 21:59Z = 23:59 CEST; 22:59Z = 23:59 CET.
    expect(delegationStartDay(null, '2026-06-01T21:59:00.000Z')).toBe(
      '2026-06-01',
    );
    expect(delegationStartDay(null, '2026-01-14T22:59:00.000Z')).toBe(
      '2026-01-14',
    );
  });

  it('is the anchor deriveCalendarWindow renders from (fetch `from` == render start)', () => {
    const fixtures: DelegFields[] = [
      deleg({ departureAt: '2026-06-01T23:45:00.000Z', actualDepartureAt: null }),
      deleg({ departureAt: '2026-01-14T23:30:00.000Z', actualDepartureAt: null }),
      deleg({
        departureAt: '2026-06-01T08:30:00.000Z',
        actualDepartureAt: '2026-06-03T23:30:00.000Z',
      }),
    ];
    for (const d of fixtures) {
      expect(deriveCalendarWindow(d, [], TODAY).fromIso).toBe(
        delegationStartDay(d.actualDepartureAt, d.departureAt),
      );
    }
  });
});

