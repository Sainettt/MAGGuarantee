// `LimitsService` unit tests — km limits per ISO week (2026-10-29).
//
// Hand-rolled fakes over `jest.fn`, mirrors the style used in
// `lookups.service.spec.ts` and `claims.service.update.spec.ts`. The repo
// is stubbed; we only exercise the service's translation layer, the week-key
// handling and the audit `before` / `metadata` capture.

import { BadRequestException } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';

import {
  AuditContext,
  type AuditContextStore,
} from '../../common/audit/audit-context';
import {
  LimitsRepository,
  type WeeklyLimitRow,
  type WeeklyLimitValues,
} from './limits.repository';
import { LimitsService } from './limits.service';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeRow(overrides: Partial<WeeklyLimitRow> = {}): WeeklyLimitRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    isoYear: 2026,
    isoWeek: 23,
    kmPerDay: 220,
    ratePerKm: 0.85,
    kmPerSaturday: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

interface Captured {
  list?: { isoYear: number };
  find?: { isoYear: number; isoWeek: number };
  upsert?: { isoYear: number; isoWeek: number; values: WeeklyLimitValues };
  listWeeks?: { isoYear: number; weeks: number[] };
  upsertMany?: { isoYear: number; weeks: number[]; values: WeeklyLimitValues };
}

function makeRepo(opts: {
  rows?: WeeklyLimitRow[];
  existing?: WeeklyLimitRow | null;
  upsertResult?: WeeklyLimitRow;
  captured?: Captured;
}): LimitsRepository & { [K in keyof LimitsRepository]: jest.Mock } {
  const captured = opts.captured ?? {};
  return {
    listForIsoYear: jest.fn(async (isoYear: number) => {
      captured.list = { isoYear };
      return opts.rows ?? [];
    }),
    findByWeek: jest.fn(async (isoYear: number, isoWeek: number) => {
      captured.find = { isoYear, isoWeek };
      return opts.existing ?? null;
    }),
    upsert: jest.fn(
      async (isoYear: number, isoWeek: number, values: WeeklyLimitValues) => {
        captured.upsert = { isoYear, isoWeek, values };
        return (
          opts.upsertResult ??
          makeRow({
            isoYear,
            isoWeek,
            kmPerDay: values.kmPerDay ?? null,
            ratePerKm: values.ratePerKm ?? null,
            kmPerSaturday: values.kmPerSaturday ?? null,
          })
        );
      },
    ),
    listForWeeks: jest.fn(async (isoYear: number, weeks: readonly number[]) => {
      captured.listWeeks = { isoYear, weeks: [...weeks] };
      return (opts.rows ?? []).filter(
        (r) => r.isoYear === isoYear && weeks.includes(r.isoWeek),
      );
    }),
    upsertMany: jest.fn(
      async (isoYear: number, weeks: readonly number[], values: WeeklyLimitValues) => {
        captured.upsertMany = { isoYear, weeks: [...weeks], values };
        return [...weeks]
          .sort((a, b) => a - b)
          .map((isoWeek) =>
            makeRow({
              id: `row-${isoYear}-${isoWeek}`,
              isoYear,
              isoWeek,
              kmPerDay: values.kmPerDay ?? null,
              ratePerKm: values.ratePerKm ?? null,
              kmPerSaturday: values.kmPerSaturday ?? null,
            }),
          );
      },
    ),
  } as unknown as LimitsRepository & { [K in keyof LimitsRepository]: jest.Mock };
}

/**
 * Open an `AuditContext` around the service call so `setBefore(...)` lands
 * on a captured store — mirrors what the production `AuditInterceptor` does
 * for `@Audit()`-tagged routes.
 */
async function withAuditContext<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; store: AuditContextStore }> {
  const store: AuditContextStore = {
    tx: { __sentinel: 'tx' } as unknown as Prisma.TransactionClient,
    actor: { userId: 'admin-1', userRole: 'admin' },
    ipAddress: null,
  };
  const result = await AuditContext.run(store, fn);
  return { result, store };
}

describe('LimitsService.listForIsoYear', () => {
  it('maps repository rows to DTOs and forwards the ISO year', async () => {
    const rows = [
      makeRow({ isoWeek: 1, kmPerDay: 200, ratePerKm: 0.8 }),
      makeRow({
        id: '00000000-0000-0000-0000-000000000002',
        isoWeek: 53,
        kmPerDay: null,
        ratePerKm: 0.9,
        kmPerSaturday: 0,
      }),
    ];
    const captured: Captured = {};
    const svc = new LimitsService(makeRepo({ rows, captured }));

    const out = await svc.listForIsoYear(2026);

    expect(captured.list).toEqual({ isoYear: 2026 });
    expect(out).toEqual([
      {
        id: '00000000-0000-0000-0000-000000000001',
        isoYear: 2026,
        isoWeek: 1,
        kmPerDay: 200,
        ratePerKm: 0.8,
        kmPerSaturday: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        isoYear: 2026,
        isoWeek: 53,
        kmPerDay: null,
        ratePerKm: 0.9,
        // `0` (switched off) is NOT collapsed into `null` (not configured).
        kmPerSaturday: 0,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]);
  });

  it('returns an empty array when the ISO year has no rows', async () => {
    const svc = new LimitsService(makeRepo({ rows: [] }));
    await expect(svc.listForIsoYear(2031)).resolves.toEqual([]);
  });
});

describe('LimitsService.upsert', () => {
  it('INSERT path: parses the key, writes only the sent keys, no before snapshot', async () => {
    const captured: Captured = {};
    const svc = new LimitsService(makeRepo({ existing: null, captured }));

    const { result, store } = await withAuditContext(() =>
      svc.upsert('2026-W07', { kmPerDay: 230, ratePerKm: 0.92 }),
    );

    expect(captured.find).toEqual({ isoYear: 2026, isoWeek: 7 });
    expect(captured.upsert).toEqual({
      isoYear: 2026,
      isoWeek: 7,
      values: { kmPerDay: 230, ratePerKm: 0.92 },
    });
    expect('kmPerSaturday' in captured.upsert!.values).toBe(false);
    expect(result).toMatchObject({ isoYear: 2026, isoWeek: 7, kmPerDay: 230, ratePerKm: 0.92 });
    // INSERT path → no pre-mutation row to snapshot.
    expect(store.before).toBeUndefined();
  });

  it('UPDATE path: captures a before snapshot of the existing row', async () => {
    const existing = makeRow({ id: 'row-existing', isoWeek: 23, kmPerDay: 200, ratePerKm: 0.8 });
    const captured: Captured = {};
    const svc = new LimitsService(makeRepo({ existing, captured }));

    const { result, store } = await withAuditContext(() =>
      svc.upsert('2026-W23', { kmPerDay: 250 }),
    );

    expect(store.before).toEqual({
      id: 'row-existing',
      isoYear: 2026,
      isoWeek: 23,
      kmPerDay: 200,
      ratePerKm: 0.8,
      kmPerSaturday: null,
    });
    // `ratePerKm` omitted → not written (the column keeps its value).
    expect(captured.upsert).toEqual({ isoYear: 2026, isoWeek: 23, values: { kmPerDay: 250 } });
    expect(result.kmPerDay).toBe(250);
  });

  it('writes `0` as a value ("switched off"), not as an omission', async () => {
    const captured: Captured = {};
    const svc = new LimitsService(makeRepo({ captured }));

    const { result } = await withAuditContext(() =>
      svc.upsert('2026-W10', { kmPerDay: 0, ratePerKm: 0, kmPerSaturday: 0 }),
    );

    expect(captured.upsert!.values).toEqual({ kmPerDay: 0, ratePerKm: 0, kmPerSaturday: 0 });
    expect(result).toMatchObject({ kmPerDay: 0, ratePerKm: 0, kmPerSaturday: 0 });
  });

  it('drops keys present as `undefined` (absent ⇒ column untouched)', async () => {
    const captured: Captured = {};
    const svc = new LimitsService(makeRepo({ captured }));

    await withAuditContext(() =>
      svc.upsert('2026-W10', { kmPerDay: undefined, kmPerSaturday: 270 }),
    );

    expect(captured.upsert!.values).toEqual({ kmPerSaturday: 270 });
    expect('kmPerDay' in captured.upsert!.values).toBe(false);
  });

  it('accepts W53 of a 53-week ISO year and the year-boundary W01', async () => {
    const captured: Captured = {};
    const svc = new LimitsService(makeRepo({ captured }));

    await withAuditContext(() => svc.upsert('2026-W53', { kmPerDay: 1 }));
    expect(captured.upsert).toMatchObject({ isoYear: 2026, isoWeek: 53 });

    await withAuditContext(() => svc.upsert('2026-W01', { kmPerDay: 1 }));
    expect(captured.upsert).toMatchObject({ isoYear: 2026, isoWeek: 1 });
  });

  it.each([
    ['2027-W53', 'W53 of a 52-week ISO year'],
    ['2026-W54', 'week 54'],
    ['2026-W00', 'week 0'],
    ['2026-W5', 'one-digit week'],
    ['2026-05', 'the old YYYY-MM month key'],
    ['2026w05', 'missing dash, lower-case w'],
    ['', 'empty'],
  ])('rejects %s (%s) with 400 before touching the repository', async (key) => {
    const repo = makeRepo({});
    const svc = new LimitsService(repo);

    await expect(svc.upsert(key, { kmPerDay: 1 })).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.findByWeek).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});

describe('LimitsService.bulkUpsert', () => {
  it('writes every selected week with the same partial payload, sorted', async () => {
    const captured: Captured = {};
    const svc = new LimitsService(makeRepo({ rows: [], captured }));

    const { result } = await withAuditContext(() =>
      svc.bulkUpsert({ isoYear: 2026, weeks: [12, 10, 11], kmPerDay: 0, kmPerSaturday: 0 }),
    );

    // Weeks are normalised (sorted) before they reach the repository.
    expect(captured.upsertMany).toEqual({
      isoYear: 2026,
      weeks: [10, 11, 12],
      // `ratePerKm` NOT supplied ⇒ absent ⇒ column left untouched.
      values: { kmPerDay: 0, kmPerSaturday: 0 },
    });
    expect(result.map((r) => r.isoWeek)).toEqual([10, 11, 12]);
    expect(result.every((r) => r.kmPerDay === 0 && r.kmPerSaturday === 0)).toBe(true);
  });

  it('omits unspecified fields entirely (no accidental NULL/0 write)', async () => {
    const captured: Captured = {};
    const svc = new LimitsService(makeRepo({ rows: [], captured }));

    await withAuditContext(() =>
      svc.bulkUpsert({ isoYear: 2026, weeks: [6], ratePerKm: 0.52 }),
    );

    expect(captured.upsertMany!.values).toEqual({ ratePerKm: 0.52 });
    expect('kmPerDay' in captured.upsertMany!.values).toBe(false);
    expect('kmPerSaturday' in captured.upsertMany!.values).toBe(false);
  });

  it('snapshots ONLY the affected rows into the audit `before`', async () => {
    const rows = [
      makeRow({ id: 'r1', isoWeek: 1, kmPerDay: 540, ratePerKm: 0.5 }),
      makeRow({ id: 'r2', isoWeek: 2, kmPerDay: 500, ratePerKm: 0.5 }),
      // Week 9 is NOT in the payload — must not appear in `before`.
      makeRow({ id: 'r9', isoWeek: 9, kmPerDay: 400, ratePerKm: 0.5 }),
    ];
    const captured: Captured = {};
    const svc = new LimitsService(makeRepo({ rows, captured }));

    const { store } = await withAuditContext(() =>
      svc.bulkUpsert({ isoYear: 2026, weeks: [2, 1], kmPerDay: 0 }),
    );

    expect(captured.listWeeks).toEqual({ isoYear: 2026, weeks: [1, 2] });
    expect(store.before).toEqual({
      isoYear: 2026,
      weeks: [1, 2],
      rows: [
        { id: 'r1', isoYear: 2026, isoWeek: 1, kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: null },
        { id: 'r2', isoYear: 2026, isoWeek: 2, kmPerDay: 500, ratePerKm: 0.5, kmPerSaturday: null },
      ],
    });
  });

  it('records the request payload in the audit metadata (intent, not just diff)', async () => {
    const svc = new LimitsService(makeRepo({ rows: [] }));

    const { store } = await withAuditContext(() =>
      svc.bulkUpsert({ isoYear: 2026, weeks: [53, 52], kmPerDay: 0 }),
    );

    expect(store.metadata).toEqual({
      payload: { isoYear: 2026, weeks: [52, 53], kmPerDay: 0 },
    });
  });

  it('a week with no existing row simply has no `before` entry (INSERT path)', async () => {
    const svc = new LimitsService(makeRepo({ rows: [] }));

    const { result, store } = await withAuditContext(() =>
      svc.bulkUpsert({ isoYear: 2026, weeks: [4, 5], kmPerSaturday: 270 }),
    );

    expect((store.before as { rows: unknown[] }).rows).toEqual([]);
    expect(result.map((r) => r.kmPerSaturday)).toEqual([270, 270]);
  });

  it('rejects W53 of a 52-week ISO year with 400 and writes nothing (defence in depth)', async () => {
    const repo = makeRepo({ rows: [] });
    const svc = new LimitsService(repo);

    const { store } = await withAuditContext(async () => {
      await expect(
        svc.bulkUpsert({ isoYear: 2027, weeks: [52, 53], kmPerDay: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    expect(repo.listForWeeks).not.toHaveBeenCalled();
    expect(repo.upsertMany).not.toHaveBeenCalled();
    expect(store.before).toBeUndefined();
    expect(store.metadata).toBeUndefined();
  });
});
