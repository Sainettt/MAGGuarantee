// `KmCalcService` — per-ISO-week limits (2026-10-29), per-field fallback
// merge, limits snapshot.
//
// Everything under test sits ABOVE the shared engine (`calcKmGwarant` has its
// own ≥30-fixture suite in `packages/shared/tests/km-calc.test.ts`) — these
// specs only check what goes INTO it:
//
//  1. `isoWeeksOfPeriod` — which ISO weeks a period touches (W53, W01 in
//     December, year roll-over), zone-independent;
//  2. `mergeLimits` — the `weekly_limits` row → `WeekLimit` translation. A
//     NULL column falls back on its own and `0` survives all the way into the
//     engine (a row `{kmPerDay: 0, ratePerKm: NULL}` is OFF, never 540);
//  3. `limitsSnapshot` — the per-week override that freezes an existing
//     wniosek against retroactive limit edits;
//  4. `hasConfiguredLimits` — a row for EVERY week of the period, which lets
//     the claims-submit violation text tell "nothing configured" from
//     "deliberately switched off".

import type { WeekLimit } from '@magguarantee/shared';

import type { PrismaService } from '../prisma/prisma.service';
import {
  isoWeeksOfPeriod,
  KmCalcService,
  mergeLimits,
  type StoredWeekLimit,
} from './km-calc.service';

const FALLBACK: WeekLimit = {
  kmPerDay: 540,
  ratePerKm: 0.5,
  kmPerSaturday: 0,
};

function stored(overrides: Partial<StoredWeekLimit> = {}): StoredWeekLimit {
  return {
    kmPerDay: null,
    ratePerKm: null,
    kmPerSaturday: null,
    ...overrides,
  };
}

function keys(weeks: ReturnType<typeof isoWeeksOfPeriod>): string[] | null {
  return weeks === null
    ? null
    : weeks.map(
        (w) => `${w.isoYear}-W${String(w.isoWeek).padStart(2, '0')}`,
      );
}

// ─── isoWeeksOfPeriod (pure) ─────────────────────────────

describe('isoWeeksOfPeriod — the ISO weeks a period touches', () => {
  it('one day ⇒ its own week', () => {
    // 2026-05-06 is the Wednesday of 2026-W19 (04.05–10.05).
    expect(keys(isoWeeksOfPeriod('2026-05-06', '2026-05-06'))).toEqual([
      '2026-W19',
    ]);
  });

  it('Sunday → Monday crosses into the next week', () => {
    expect(keys(isoWeeksOfPeriod('2026-05-10', '2026-05-11'))).toEqual([
      '2026-W19',
      '2026-W20',
    ]);
  });

  it('a month-long period lists every week, ascending', () => {
    // Wed 20.05 (W21) … Wed 10.06 (W24).
    expect(keys(isoWeeksOfPeriod('2026-05-20', '2026-06-10'))).toEqual([
      '2026-W21',
      '2026-W22',
      '2026-W23',
      '2026-W24',
    ]);
  });

  it('53-week year: 2026-W53 rolls over to 2027-W01', () => {
    // 28.12.2026 (Mon) is 2026-W53; 05.01.2027 (Tue) is 2027-W01.
    expect(keys(isoWeeksOfPeriod('2026-12-28', '2027-01-05'))).toEqual([
      '2026-W53',
      '2027-W01',
    ]);
  });

  it('52-week year: 2025-W52 rolls over to 2026-W01, which starts in December', () => {
    // 29.12.2025 (Mon) already belongs to 2026-W01.
    expect(keys(isoWeeksOfPeriod('2025-12-22', '2026-01-05'))).toEqual([
      '2025-W52',
      '2026-W01',
      '2026-W02',
    ]);
  });

  it('1 January on a Friday belongs to the previous ISO year (2021-01-01 → 2020-W53)', () => {
    expect(keys(isoWeeksOfPeriod('2021-01-01', '2021-01-04'))).toEqual([
      '2020-W53',
      '2021-W01',
    ]);
  });

  it('null for an invalid date or an inverted range', () => {
    expect(isoWeeksOfPeriod('nope', '2026-06-10')).toBeNull();
    expect(isoWeeksOfPeriod('2026-02-30', '2026-03-02')).toBeNull();
    expect(isoWeeksOfPeriod('2026-06-10', '2026-05-01')).toBeNull();
  });
});

// ─── mergeLimits (pure) ──────────────────────────────────

describe('mergeLimits — per-field fallback', () => {
  it('REGRESSION: `kmPerDay = 0` with a NULL rate stays 0 (never becomes 540)', () => {
    const out = mergeLimits({ '2026-W19': stored({ kmPerDay: 0 }) }, FALLBACK);
    expect(out['2026-W19']).toEqual({ kmPerDay: 0, ratePerKm: 0.5 });
  });

  it('fills only the missing column: {300, NULL} → 300 @ fallback rate', () => {
    const out = mergeLimits({ '2026-W19': stored({ kmPerDay: 300 }) }, FALLBACK);
    expect(out['2026-W19']).toEqual({ kmPerDay: 300, ratePerKm: 0.5 });
  });

  it('fills only the missing column: {NULL, 0.7} → fallback km @ 0.7', () => {
    const out = mergeLimits({ '2026-W19': stored({ ratePerKm: 0.7 }) }, FALLBACK);
    expect(out['2026-W19']).toEqual({ kmPerDay: 540, ratePerKm: 0.7 });
  });

  it('a `ratePerKm = 0` is kept (km priced at zero), not replaced by 0.5', () => {
    const out = mergeLimits(
      { '2026-W19': stored({ kmPerDay: 400, ratePerKm: 0 }) },
      FALLBACK,
    );
    expect(out['2026-W19']).toEqual({ kmPerDay: 400, ratePerKm: 0 });
  });

  it('an all-NULL row is treated as "no row" (engine applies the fallback)', () => {
    const out = mergeLimits({ '2026-W19': stored() }, FALLBACK);
    expect(out['2026-W19']).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(0);
  });

  it('omits `kmPerSaturday` when absent, keeps an explicit 0 and a positive value', () => {
    const out = mergeLimits(
      {
        '2026-W18': stored({ kmPerDay: 540, ratePerKm: 0.5 }),
        '2026-W19': stored({ kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 }),
        '2026-W20': stored({ kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 }),
      },
      FALLBACK,
    );
    expect('kmPerSaturday' in out['2026-W18']!).toBe(false);
    expect(out['2026-W19']!.kmPerSaturday).toBe(0);
    expect(out['2026-W20']!.kmPerSaturday).toBe(270);
  });

  it('snapshot wins per week; live rows fill the weeks it lacks', () => {
    const out = mergeLimits(
      {
        '2026-W19': stored({ kmPerDay: 0, ratePerKm: 0.5 }),
        '2026-W20': stored({ kmPerDay: 400, ratePerKm: 0.6 }),
      },
      FALLBACK,
      { '2026-W19': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 } },
    );
    // Snapshot value for the week it covers …
    expect(out['2026-W19']).toEqual({
      kmPerDay: 540,
      ratePerKm: 0.5,
      kmPerSaturday: 270,
    });
    // … live value for the week it doesn't (e.g. period moved into it).
    expect(out['2026-W20']).toEqual({ kmPerDay: 400, ratePerKm: 0.6 });
  });

  it('snapshot weeks with no live row are added, not dropped', () => {
    const out = mergeLimits({}, FALLBACK, {
      '2026-W27': { kmPerDay: 500, ratePerKm: 0.55 },
    });
    expect(out['2026-W27']).toEqual({ kmPerDay: 500, ratePerKm: 0.55 });
  });
});

// ─── service integration (fake Prisma) ───────────────────

interface FakeLimitRow {
  isoYear: number;
  isoWeek: number;
  kmPerDay: number | null;
  ratePerKm: number | null;
  kmPerSaturday: number | null;
}

interface FakeDb {
  limits: FakeLimitRow[];
  appConfig?: Array<{ key: string; value: string }>;
}

function row(
  isoYear: number,
  isoWeek: number,
  values: Partial<Omit<FakeLimitRow, 'isoYear' | 'isoWeek'>> = {},
): FakeLimitRow {
  return {
    isoYear,
    isoWeek,
    kmPerDay: null,
    ratePerKm: null,
    kmPerSaturday: null,
    ...values,
  };
}

function makeService(db: FakeDb): {
  service: KmCalcService;
  weeklyFindMany: jest.Mock;
} {
  const weeklyFindMany = jest.fn(
    async (args: { where: { OR: Array<{ isoYear: number; isoWeek: number }> } }) =>
      db.limits.filter((r) =>
        args.where.OR.some((k) => k.isoYear === r.isoYear && k.isoWeek === r.isoWeek),
      ),
  );
  const prisma = {
    client: {
      weeklyLimit: { findMany: weeklyFindMany },
      appConfig: {
        findMany: jest.fn(async () => db.appConfig ?? []),
      },
    },
  } as unknown as PrismaService;
  return { service: new KmCalcService(prisma), weeklyFindMany };
}

describe('KmCalcService.calc — weekly limits reach the engine', () => {
  // 2026-05-04 .. 2026-05-08 is the full Mon–Fri of 2026-W19 (no PL/EU ban days).
  const WEEK = { dateStart: '2026-05-04', dateEnd: '2026-05-08' };

  it('queries exactly the ISO weeks the period touches', async () => {
    const { service, weeklyFindMany } = makeService({ limits: [] });
    await service.calc({ dateStart: '2026-05-08', dateEnd: '2026-05-19' });
    expect(weeklyFindMany).toHaveBeenCalledTimes(1);
    const args = weeklyFindMany.mock.calls[0]![0] as {
      where: { OR: Array<{ isoYear: number; isoWeek: number }> };
    };
    expect(args.where.OR).toEqual([
      { isoYear: 2026, isoWeek: 19 },
      { isoYear: 2026, isoWeek: 20 },
      { isoYear: 2026, isoWeek: 21 },
    ]);
  });

  it('an explicitly disabled week guarantees 0 km (no silent 540 fallback)', async () => {
    const { service } = makeService({ limits: [row(2026, 19, { kmPerDay: 0 })] });
    const res = await service.calc(WEEK);
    expect(res.totalDays).toBe(5);
    expect(res.kmGuaranteed).toBe(0);
    expect(res.breakdown).toHaveLength(1);
    expect(res.breakdown[0]!.isoWeek).toBe('2026-W19');
    expect(res.breakdown[0]!.kmPerDay).toBe(0);
  });

  it('no row at all still falls back to 540 km/day @ 0.5 (legacy fallback)', async () => {
    const { service } = makeService({ limits: [] });
    const res = await service.calc(WEEK);
    expect(res.kmGuaranteed).toBe(2_700);
    expect(res.breakdown[0]!.kmPerDay).toBe(540);
    expect(res.breakdown[0]!.ratePerKm).toBe(0.5);
  });

  it('a partially filled row uses its own km (300) and the fallback rate', async () => {
    const { service } = makeService({ limits: [row(2026, 19, { kmPerDay: 300 })] });
    const res = await service.calc(WEEK);
    expect(res.kmGuaranteed).toBe(1_500);
    expect(res.breakdown[0]!.ratePerKm).toBe(0.5);
  });

  it('each week is priced with its own row (one off, one on, one unconfigured)', async () => {
    // Mon 08.06 … Fri 26.06.2026 (no ban days): W24 off, W25 at 400 km/day
    // @ 0.6, W26 without a row.
    const { service } = makeService({
      limits: [
        row(2026, 24, { kmPerDay: 0, ratePerKm: 0.5 }),
        row(2026, 25, { kmPerDay: 400, ratePerKm: 0.6 }),
      ],
    });
    const res = await service.calc({ dateStart: '2026-06-08', dateEnd: '2026-06-26' });
    expect(res.breakdown.map((w) => [w.isoWeek, w.kmPerDay, w.ratePerKm, w.kmInWeek])).toEqual([
      ['2026-W24', 0, 0.5, 0],
      ['2026-W25', 400, 0.6, 2_000],
      ['2026-W26', 540, 0.5, 2_700],
    ]);
    expect(res.kmGuaranteed).toBe(4_700);
  });

  it('`limitsSnapshot` overrides the live (edited) row of its week', async () => {
    // Admin lowered the limit retroactively …
    const { service } = makeService({
      limits: [row(2026, 19, { kmPerDay: 100, ratePerKm: 0.5 })],
    });
    const res = await service.calc({
      ...WEEK,
      // … but the wniosek was priced at 540.
      limitsSnapshot: { '2026-W19': { kmPerDay: 540, ratePerKm: 0.5 } },
    });
    expect(res.kmGuaranteed).toBe(2_700);
  });

  it('without a snapshot the same call picks up the edited limit', async () => {
    const { service } = makeService({
      limits: [row(2026, 19, { kmPerDay: 100, ratePerKm: 0.5 })],
    });
    const res = await service.calc(WEEK);
    expect(res.kmGuaranteed).toBe(500);
  });

  it('a week outside the snapshot (period moved into it) is priced live', async () => {
    const { service } = makeService({
      limits: [
        row(2026, 24, { kmPerDay: 100, ratePerKm: 0.5 }),
        row(2026, 25, { kmPerDay: 100, ratePerKm: 0.5 }),
      ],
    });
    const res = await service.calc({
      dateStart: '2026-06-08',
      dateEnd: '2026-06-19',
      limitsSnapshot: { '2026-W24': { kmPerDay: 540, ratePerKm: 0.5 } },
    });
    // W24 frozen at 540 despite the live 100; W25 has no snapshot ⇒ live 100.
    expect(res.breakdown.map((w) => w.kmInWeek)).toEqual([2_700, 500]);
  });

  it('AppConfig `km_dziennie_default` / `stawka_eur_default` override the fallback', async () => {
    const { service } = makeService({
      limits: [],
      appConfig: [
        { key: 'km_dziennie_default', value: '600' },
        { key: 'stawka_eur_default', value: '0.45' },
      ],
    });
    const res = await service.calc(WEEK);
    expect(res.breakdown[0]!.kmPerDay).toBe(600);
    expect(res.breakdown[0]!.ratePerKm).toBe(0.45);
    expect(res.kmGuaranteed).toBe(3_000);
  });

  it('an invalid AppConfig value is ignored (shared constant wins)', async () => {
    const { service } = makeService({
      limits: [],
      appConfig: [
        { key: 'km_dziennie_default', value: 'abc' },
        { key: 'stawka_eur_default', value: '0' },
      ],
    });
    const res = await service.calc(WEEK);
    expect(res.breakdown[0]!.kmPerDay).toBe(540);
    expect(res.breakdown[0]!.ratePerKm).toBe(0.5);
  });

  it('an invalid / inverted range returns the empty shape without a limits query', async () => {
    const { service, weeklyFindMany } = makeService({ limits: [] });
    const res = await service.calc({ dateStart: '2026-05-08', dateEnd: '2026-05-04' });
    expect(res.kmGuaranteed).toBe(0);
    expect(res.breakdown).toEqual([]);
    expect(res.ratePerKmEffective).toBe(0.5);
    expect(weeklyFindMany).not.toHaveBeenCalled();
  });

  it('ENGINE PIN: the Saturday fallback is 0 — an unconfigured week never pays its Saturday', async () => {
    // 2026-05-09 is the Saturday of 2026-W19. With no row and
    // `FALLBACK_KM_PER_SATURDAY = 0` it must not be credited. If that constant
    // is ever made positive, this fixture fails FIRST — and every week that
    // switched its Saturday off would have silently switched it back on.
    const { service } = makeService({ limits: [] });
    const res = await service.calc({ dateStart: '2026-05-08', dateEnd: '2026-05-11' });
    expect(res.breakdown[0]!.isoWeek).toBe('2026-W19');
    expect(res.breakdown[0]!.kmPerSaturday).toBe(0);
    expect(res.breakdown[0]!.saturdaysCounted).toBe(0);
  });

  it('… while a week that opts in (`kmPerSaturday > 0`) credits its Saturday', async () => {
    const { service } = makeService({
      limits: [row(2026, 19, { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 })],
    });
    const res = await service.calc({ dateStart: '2026-05-08', dateEnd: '2026-05-11' });
    expect(res.breakdown[0]!.saturdaysCounted).toBe(1);
    expect(res.breakdown[0]!.saturdayDays).toEqual(['2026-05-09']);
    expect(res.breakdown[0]!.kmFromSaturdays).toBe(270);
  });
});

describe('KmCalcService.hasConfiguredLimits', () => {
  it('true when every week of the period has a row (an OFF row counts)', async () => {
    const { service } = makeService({
      limits: [
        row(2026, 21, { kmPerDay: 0 }),
        row(2026, 22, { kmPerDay: 540, ratePerKm: 0.5 }),
        row(2026, 23), // all-NULL — still a deliberate row
        row(2026, 24, { kmPerDay: 540 }),
      ],
    });
    await expect(
      service.hasConfiguredLimits('2026-05-20', '2026-06-10'),
    ).resolves.toBe(true);
  });

  it('false when a week of the period has no row', async () => {
    const { service } = makeService({
      limits: [row(2026, 21, { kmPerDay: 540 }), row(2026, 22, { kmPerDay: 540 })],
    });
    await expect(
      service.hasConfiguredLimits('2026-05-20', '2026-06-10'),
    ).resolves.toBe(false);
  });

  it('checks across the ISO-year boundary (2026-W53 + 2027-W01)', async () => {
    const onlyW53 = makeService({ limits: [row(2026, 53, { kmPerDay: 0 })] });
    await expect(
      onlyW53.service.hasConfiguredLimits('2026-12-30', '2027-01-04'),
    ).resolves.toBe(false);

    const both = makeService({
      limits: [row(2026, 53, { kmPerDay: 0 }), row(2027, 1, { kmPerDay: 0 })],
    });
    await expect(
      both.service.hasConfiguredLimits('2026-12-30', '2027-01-04'),
    ).resolves.toBe(true);
  });

  it('true for an invalid/inverted range (nothing to configure)', async () => {
    const { service } = makeService({ limits: [] });
    await expect(service.hasConfiguredLimits('nope', '2026-06-10')).resolves.toBe(
      true,
    );
    await expect(
      service.hasConfiguredLimits('2026-06-10', '2026-05-01'),
    ).resolves.toBe(true);
  });
});
