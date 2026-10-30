// `DiagnosticsRepository.findClaimsHealth` — the two zero-guarantee buckets
// split by `weekly_limits` coverage (per ISO week since 2026-10-29).
//
// A stale `NA_WERYFIKACJI` wniosek priced at 0 km is either a configuration
// hole (some ISO week of its period has NO `weekly_limits` row — admin action)
// or a deliberate switch-off (every week has a row — informational). Same rule
// as `KmCalcService.hasConfiguredLimits` behind the submit violation text.
// Mocks `PrismaService.tx`; the weeks are derived zone-independently from the
// UTC-midnight `@db.Date` period columns.

import type { PrismaService } from '../prisma/prisma.service';
import { DiagnosticsRepository } from './diagnostics.repository';

interface ZeroClaim {
  id: string;
  dateStart: Date;
  dateEnd: Date;
}

const MISSING = 'NA_WERYFIKACJI > 7d, kmGuaranteed=0 (missing limits at submit)';
const DISABLED =
  'NA_WERYFIKACJI > 7d, kmGuaranteed=0 (guarantee switched off for the period)';

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function build(opts: {
  zeroClaims: ZeroClaim[];
  weeks: Array<{ isoYear: number; isoWeek: number }>;
}): { repo: DiagnosticsRepository; weeklyFindMany: jest.Mock } {
  const weeklyFindMany = jest.fn(
    async (args: { where: { isoYear: { in: number[] } } }) =>
      opts.weeks.filter((w) => args.where.isoYear.in.includes(w.isoYear)),
  );
  const prisma = {
    tx: {
      claim: {
        count: jest.fn(async () => 0),
        // The zero-guarantee scan filters on `kmGuaranteed: 0`; the
        // "without vehicle" bucket sample does not.
        findMany: jest.fn(async (args: { where: { kmGuaranteed?: number } }) =>
          args.where.kmGuaranteed === 0 ? opts.zeroClaims : [],
        ),
      },
      weeklyLimit: { findMany: weeklyFindMany },
    },
  };
  return {
    repo: new DiagnosticsRepository(prisma as unknown as PrismaService),
    weeklyFindMany,
  };
}

async function buckets(
  repo: DiagnosticsRepository,
): Promise<Record<string, { count: number; sampleIds: string[] }>> {
  const rows = await repo.findClaimsHealth({
    sampleSize: 5,
    naWeryfikacjiOlderThan: utc('2026-10-01'),
  });
  return Object.fromEntries(rows.map((r) => [r.name, r]));
}

describe('DiagnosticsRepository.findClaimsHealth — zero guarantee split per ISO week', () => {
  it('every week of the period has a row ⇒ "switched off"; a week without one ⇒ "missing"', async () => {
    // W21, W22 and W24 of 2026 configured; W23 (01–07.06) has no row.
    const { repo } = build({
      zeroClaims: [
        // Wed 20.05 – Fri 29.05 ⇒ W21 + W22 — fully covered.
        { id: 'covered', dateStart: utc('2026-05-20'), dateEnd: utc('2026-05-29') },
        // Wed 20.05 – Wed 10.06 ⇒ W21 … W24 — W23 missing.
        { id: 'hole', dateStart: utc('2026-05-20'), dateEnd: utc('2026-06-10') },
      ],
      weeks: [
        { isoYear: 2026, isoWeek: 21 },
        { isoYear: 2026, isoWeek: 22 },
        { isoYear: 2026, isoWeek: 24 },
      ],
    });

    const out = await buckets(repo);

    expect(out[DISABLED]).toEqual({ name: DISABLED, count: 1, sampleIds: ['covered'] });
    expect(out[MISSING]).toEqual({ name: MISSING, count: 1, sampleIds: ['hole'] });
  });

  it('a period across the ISO-year boundary needs both 2026-W53 and 2027-W01', async () => {
    const period = { dateStart: utc('2026-12-30'), dateEnd: utc('2027-01-04') };

    const onlyW53 = build({
      zeroClaims: [{ id: 'nye', ...period }],
      weeks: [{ isoYear: 2026, isoWeek: 53 }],
    });
    expect((await buckets(onlyW53.repo))[MISSING]!.sampleIds).toEqual(['nye']);
    // One query, for exactly the ISO years the candidates touch.
    expect(onlyW53.weeklyFindMany).toHaveBeenCalledTimes(1);
    expect(onlyW53.weeklyFindMany.mock.calls[0]![0]).toEqual({
      where: { isoYear: { in: [2026, 2027] } },
      select: { isoYear: true, isoWeek: true },
    });

    const both = build({
      zeroClaims: [{ id: 'nye', ...period }],
      weeks: [
        { isoYear: 2026, isoWeek: 53 },
        { isoYear: 2027, isoWeek: 1 },
      ],
    });
    expect((await buckets(both.repo))[DISABLED]!.sampleIds).toEqual(['nye']);
  });

  it('29.12.2025 belongs to 2026-W01 — a 2025 row does not cover it', async () => {
    const { repo } = build({
      zeroClaims: [
        { id: 'w01', dateStart: utc('2025-12-29'), dateEnd: utc('2026-01-02') },
      ],
      weeks: [{ isoYear: 2025, isoWeek: 52 }],
    });

    const out = await buckets(repo);

    expect(out[MISSING]!.sampleIds).toEqual(['w01']);
    expect(out[DISABLED]!.count).toBe(0);
  });

  it('an inverted range lands in the informational bucket instead of crashing', async () => {
    const { repo } = build({
      zeroClaims: [
        { id: 'inverted', dateStart: utc('2026-06-10'), dateEnd: utc('2026-06-01') },
      ],
      weeks: [],
    });

    const out = await buckets(repo);

    expect(out[DISABLED]!.sampleIds).toEqual(['inverted']);
    expect(out[MISSING]!.count).toBe(0);
  });

  it('no zero-guarantee candidates ⇒ no limits query at all', async () => {
    const { repo, weeklyFindMany } = build({ zeroClaims: [], weeks: [] });

    const out = await buckets(repo);

    expect(out[MISSING]!.count).toBe(0);
    expect(out[DISABLED]!.count).toBe(0);
    expect(weeklyFindMany).not.toHaveBeenCalled();
  });
});
