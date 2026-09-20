// `KmCalcService` — per-field fallback merge + limits snapshot.
//
// Feature «wyłączane limity gwarancji» (2026-09-20). Two things are under
// test here, both of them ABOVE the frozen engine (`km-calc.ts` is never
// touched by these specs — they only choose what goes INTO it):
//
//  1. `mergeLimits` — the `monthly_limits` row → `MonthLimit` translation.
//     It used to drop a row wholesale when `kmPerDay` OR `ratePerKm` was
//     NULL, which meant a row of `{kmPerDay: 0, ratePerKm: NULL}` ("switch
//     this month off", saved before a rate was ever seeded) produced the
//     MAXIMUM 540 km/day guarantee. Now every NULL column falls back on its
//     own and `0` survives all the way into the engine.
//  2. `limitsSnapshot` — the per-month override that freezes an existing
//     wniosek against retroactive limit edits.
//
// Plus `hasConfiguredLimits`, which lets the claims-submit violation text
// tell "nothing configured" from "deliberately switched off".

import type { MonthLimit } from '@magguarantee/shared';

import type { PrismaService } from '../prisma/prisma.service';
import {
  KmCalcService,
  mergeLimits,
  type StoredMonthLimit,
} from './km-calc.service';

const FALLBACK: MonthLimit = {
  kmPerDay: 540,
  ratePerKm: 0.5,
  kmPerSaturday: 0,
};

function stored(overrides: Partial<StoredMonthLimit> = {}): StoredMonthLimit {
  return {
    kmPerDay: null,
    ratePerKm: null,
    kmPerSaturday: null,
    ...overrides,
  };
}

// ─── mergeLimits (pure) ──────────────────────────────────

describe('mergeLimits — per-field fallback', () => {
  it('REGRESSION: `kmPerDay = 0` with a NULL rate stays 0 (used to become 540)', () => {
    const out = mergeLimits(
      { '2026-05': stored({ kmPerDay: 0 }) },
      FALLBACK,
    );
    expect(out['2026-05']).toEqual({ kmPerDay: 0, ratePerKm: 0.5 });
  });

  it('fills only the missing column: {300, NULL} → 300 @ fallback rate', () => {
    const out = mergeLimits(
      { '2026-05': stored({ kmPerDay: 300 }) },
      FALLBACK,
    );
    expect(out['2026-05']).toEqual({ kmPerDay: 300, ratePerKm: 0.5 });
  });

  it('fills only the missing column: {NULL, 0.7} → fallback km @ 0.7', () => {
    const out = mergeLimits(
      { '2026-05': stored({ ratePerKm: 0.7 }) },
      FALLBACK,
    );
    expect(out['2026-05']).toEqual({ kmPerDay: 540, ratePerKm: 0.7 });
  });

  it('a `ratePerKm = 0` is kept (km priced at zero), not replaced by 0.5', () => {
    const out = mergeLimits(
      { '2026-05': stored({ kmPerDay: 400, ratePerKm: 0 }) },
      FALLBACK,
    );
    expect(out['2026-05']).toEqual({ kmPerDay: 400, ratePerKm: 0 });
  });

  it('an all-NULL row is treated as "no row" (engine applies the fallback)', () => {
    const out = mergeLimits({ '2026-05': stored() }, FALLBACK);
    expect(out['2026-05']).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(0);
  });

  it('omits `kmPerSaturday` when absent, keeps an explicit 0 and a positive value', () => {
    const out = mergeLimits(
      {
        '2026-04': stored({ kmPerDay: 540, ratePerKm: 0.5 }),
        '2026-05': stored({ kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 }),
        '2026-06': stored({ kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 }),
      },
      FALLBACK,
    );
    expect('kmPerSaturday' in out['2026-04']!).toBe(false);
    expect(out['2026-05']!.kmPerSaturday).toBe(0);
    expect(out['2026-06']!.kmPerSaturday).toBe(270);
  });

  it('snapshot wins per month; live rows fill the months it lacks', () => {
    const out = mergeLimits(
      {
        '2026-05': stored({ kmPerDay: 0, ratePerKm: 0.5 }),
        '2026-06': stored({ kmPerDay: 400, ratePerKm: 0.6 }),
      },
      FALLBACK,
      { '2026-05': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 } },
    );
    // Snapshot value for the month it covers …
    expect(out['2026-05']).toEqual({
      kmPerDay: 540,
      ratePerKm: 0.5,
      kmPerSaturday: 270,
    });
    // … live value for the month it doesn't (e.g. period moved into it).
    expect(out['2026-06']).toEqual({ kmPerDay: 400, ratePerKm: 0.6 });
  });

  it('snapshot months with no live row are added, not dropped', () => {
    const out = mergeLimits({}, FALLBACK, {
      '2026-07': { kmPerDay: 500, ratePerKm: 0.55 },
    });
    expect(out['2026-07']).toEqual({ kmPerDay: 500, ratePerKm: 0.55 });
  });
});

// ─── service integration (fake Prisma) ───────────────────

interface FakeDb {
  limits: Array<{
    year: number;
    month: number;
    kmPerDay: number | null;
    ratePerKm: number | null;
    kmPerSaturday: number | null;
  }>;
  appConfig?: Array<{ key: string; value: string }>;
}

function makeService(db: FakeDb): KmCalcService {
  const prisma = {
    client: {
      monthlyLimit: {
        findMany: jest.fn(
          async (args: {
            where: { OR: Array<{ year: number; month: number }> };
          }) =>
            db.limits.filter((r) =>
              args.where.OR.some(
                (k) => k.year === r.year && k.month === r.month,
              ),
            ),
        ),
      },
      appConfig: {
        findMany: jest.fn(async () => db.appConfig ?? []),
      },
    },
  } as unknown as PrismaService;
  return new KmCalcService(prisma);
}

describe('KmCalcService.calc — disabled months reach the engine', () => {
  // 2026-05-04 .. 2026-05-08 is a full Mon–Fri week (no PL/EU ban days).
  const WEEK = { dateStart: '2026-05-04', dateEnd: '2026-05-08' };

  it('an explicitly disabled month guarantees 0 km (no silent 540 fallback)', async () => {
    const service = makeService({
      limits: [
        { year: 2026, month: 5, kmPerDay: 0, ratePerKm: null, kmPerSaturday: null },
      ],
    });
    const res = await service.calc(WEEK);
    expect(res.totalDays).toBe(5);
    expect(res.kmGuaranteed).toBe(0);
    expect(res.breakdown[0]!.kmPerDay).toBe(0);
  });

  it('no row at all still falls back to 540 km/day (unchanged legacy behaviour)', async () => {
    const service = makeService({ limits: [] });
    const res = await service.calc(WEEK);
    expect(res.kmGuaranteed).toBe(2_700);
    expect(res.breakdown[0]!.kmPerDay).toBe(540);
  });

  it('a partially filled row now uses its own km (300) instead of the fallback', async () => {
    const service = makeService({
      limits: [
        { year: 2026, month: 5, kmPerDay: 300, ratePerKm: null, kmPerSaturday: null },
      ],
    });
    const res = await service.calc(WEEK);
    expect(res.kmGuaranteed).toBe(1_500);
    expect(res.breakdown[0]!.ratePerKm).toBe(0.5);
  });

  it('`limitsSnapshot` overrides the live (edited) row', async () => {
    const service = makeService({
      limits: [
        // Admin lowered the limit retroactively …
        { year: 2026, month: 5, kmPerDay: 100, ratePerKm: 0.5, kmPerSaturday: null },
      ],
    });
    const res = await service.calc({
      ...WEEK,
      // … but the wniosek was priced at 540.
      limitsSnapshot: { '2026-05': { kmPerDay: 540, ratePerKm: 0.5 } },
    });
    expect(res.kmGuaranteed).toBe(2_700);
  });

  it('without a snapshot the same call picks up the edited limit', async () => {
    const service = makeService({
      limits: [
        { year: 2026, month: 5, kmPerDay: 100, ratePerKm: 0.5, kmPerSaturday: null },
      ],
    });
    const res = await service.calc(WEEK);
    expect(res.kmGuaranteed).toBe(500);
  });

  it('ENGINE PIN: the Saturday fallback is 0 — an unconfigured month never pays Saturdays', async () => {
    // 2026-05-02 is the 1st (qualifying) Saturday of the month. With no row
    // and `FALLBACK_KM_PER_SATURDAY = 0` it must not be credited. If that
    // constant is ever made positive, this fixture fails FIRST — and every
    // month that switched Saturdays off would have silently switched on.
    const service = makeService({ limits: [] });
    const res = await service.calc({
      dateStart: '2026-05-01',
      dateEnd: '2026-05-04',
    });
    expect(res.breakdown[0]!.kmPerSaturday).toBe(0);
    expect(res.breakdown[0]!.saturdaysCounted).toBe(0);
  });
});

describe('KmCalcService.hasConfiguredLimits', () => {
  it('true when every month of the period has a row', async () => {
    const service = makeService({
      limits: [
        { year: 2026, month: 5, kmPerDay: 0, ratePerKm: null, kmPerSaturday: null },
        { year: 2026, month: 6, kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: null },
      ],
    });
    await expect(
      service.hasConfiguredLimits('2026-05-20', '2026-06-10'),
    ).resolves.toBe(true);
  });

  it('false when a month of the period has no row', async () => {
    const service = makeService({
      limits: [
        { year: 2026, month: 5, kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: null },
      ],
    });
    await expect(
      service.hasConfiguredLimits('2026-05-20', '2026-06-10'),
    ).resolves.toBe(false);
  });

  it('true for an invalid/inverted range (nothing to configure)', async () => {
    const service = makeService({ limits: [] });
    await expect(service.hasConfiguredLimits('nope', '2026-06-10')).resolves.toBe(
      true,
    );
    await expect(
      service.hasConfiguredLimits('2026-06-10', '2026-05-01'),
    ).resolves.toBe(true);
  });
});
