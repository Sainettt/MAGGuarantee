// Phase 4.5 — `LimitsService` unit tests.
//
// Hand-rolled fakes over `jest.fn`, mirrors the style used in
// `lookups.service.spec.ts` and `claims.service.update.spec.ts`. The repo
// is stubbed; we only exercise the service's translation layer + the audit
// `before` snapshot capture.

import { UnprocessableEntityException } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';

import {
  AuditContext,
  type AuditContextStore,
} from '../../common/audit/audit-context';
import {
  LimitsRepository,
  type MonthlyLimitRow,
  type UpsertMonthlyLimitData,
} from './limits.repository';
import { LimitsService } from './limits.service';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeRow(overrides: Partial<MonthlyLimitRow> = {}): MonthlyLimitRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    year: 2026,
    month: 5,
    kmPerDay: 220,
    ratePerKm: 0.85,
    kmPerSaturday: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRepo(opts: {
  listRows?: MonthlyLimitRow[];
  existing?: MonthlyLimitRow | null;
  upsertResult?: MonthlyLimitRow;
  captured?: {
    upsert?: UpsertMonthlyLimitData;
    list?: { year: number };
    find?: { year: number; month: number };
    listMonths?: { year: number; months: number[] };
    upsertMany?: {
      year: number;
      months: number[];
      data: Omit<UpsertMonthlyLimitData, 'year' | 'month'>;
    };
  };
}): LimitsRepository {
  return {
    listForYear: jest.fn(async (year: number) => {
      if (opts.captured) opts.captured.list = { year };
      return opts.listRows ?? [];
    }),
    findByYearMonth: jest.fn(async (year: number, month: number) => {
      if (opts.captured) opts.captured.find = { year, month };
      return opts.existing ?? null;
    }),
    upsert: jest.fn(async (data: UpsertMonthlyLimitData) => {
      if (opts.captured) opts.captured.upsert = data;
      return opts.upsertResult ?? makeRow({
        year: data.year,
        month: data.month,
        kmPerDay: data.kmPerDay ?? null,
        ratePerKm: data.ratePerKm ?? null,
      });
    }),
    // ── bulk surface (feature «wyłączane limity», 2026-09-20) ──
    listForYearMonths: jest.fn(async (year: number, months: readonly number[]) => {
      if (opts.captured) opts.captured.listMonths = { year, months: [...months] };
      return (opts.listRows ?? []).filter((r) => months.includes(r.month));
    }),
    upsertMany: jest.fn(
      async (
        year: number,
        months: readonly number[],
        data: Omit<UpsertMonthlyLimitData, 'year' | 'month'>,
      ) => {
        if (opts.captured) {
          opts.captured.upsertMany = { year, months: [...months], data };
        }
        return [...months]
          .sort((a, b) => a - b)
          .map((month) =>
            makeRow({
              id: `row-${year}-${month}`,
              year,
              month,
              kmPerDay: data.kmPerDay ?? null,
              ratePerKm: data.ratePerKm ?? null,
              kmPerSaturday: data.kmPerSaturday ?? null,
            }),
          );
      },
    ),
  } as unknown as LimitsRepository;
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

describe('LimitsService.listForYear', () => {
  it('maps repository rows to DTO and forwards the year filter', async () => {
    const rows = [
      makeRow({ year: 2026, month: 1, kmPerDay: 200, ratePerKm: 0.8 }),
      makeRow({
        id: '00000000-0000-0000-0000-000000000002',
        year: 2026,
        month: 2,
        kmPerDay: null,
        ratePerKm: 0.9,
      }),
    ];
    const captured: { list?: { year: number } } = {};
    const repo = makeRepo({ listRows: rows, captured });
    const svc = new LimitsService(repo);

    const out = await svc.listForYear(2026);

    expect(captured.list).toEqual({ year: 2026 });
    expect(out).toEqual([
      {
        id: '00000000-0000-0000-0000-000000000001',
        year: 2026,
        month: 1,
        kmPerDay: 200,
        ratePerKm: 0.8,
        kmPerSaturday: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        year: 2026,
        month: 2,
        kmPerDay: null,
        ratePerKm: 0.9,
        kmPerSaturday: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ]);
  });

  it('returns an empty array when the year has no rows', async () => {
    const repo = makeRepo({ listRows: [] });
    const svc = new LimitsService(repo);
    const out = await svc.listForYear(1999);
    expect(out).toEqual([]);
  });
});

describe('LimitsService.upsert', () => {
  it('INSERT path: creates a new row when none exists, no before snapshot', async () => {
    const captured: {
      upsert?: UpsertMonthlyLimitData;
      find?: { year: number; month: number };
    } = {};
    const repo = makeRepo({
      existing: null,
      upsertResult: makeRow({ year: 2026, month: 7, kmPerDay: 230, ratePerKm: 0.92 }),
      captured,
    });
    const svc = new LimitsService(repo);

    const { result, store } = await withAuditContext(() =>
      svc.upsert('2026-07', { kmPerDay: 230, ratePerKm: 0.92 }),
    );

    expect(captured.find).toEqual({ year: 2026, month: 7 });
    expect(captured.upsert).toEqual({
      year: 2026,
      month: 7,
      kmPerDay: 230,
      ratePerKm: 0.92,
    });
    expect(result.year).toBe(2026);
    expect(result.month).toBe(7);
    expect(result.kmPerDay).toBe(230);
    expect(result.ratePerKm).toBe(0.92);
    // INSERT path → no pre-mutation row to snapshot.
    expect(store.before).toBeUndefined();
  });

  it('UPDATE path: captures a before snapshot when the row exists', async () => {
    const existing = makeRow({
      id: 'row-existing',
      year: 2026,
      month: 5,
      kmPerDay: 200,
      ratePerKm: 0.8,
    });
    const captured: { upsert?: UpsertMonthlyLimitData } = {};
    const repo = makeRepo({
      existing,
      upsertResult: makeRow({
        id: 'row-existing',
        year: 2026,
        month: 5,
        kmPerDay: 250,
        ratePerKm: 0.8,
      }),
      captured,
    });
    const svc = new LimitsService(repo);

    const { result, store } = await withAuditContext(() =>
      svc.upsert('2026-05', { kmPerDay: 250 }),
    );

    expect(store.before).toEqual({
      id: 'row-existing',
      year: 2026,
      month: 5,
      kmPerDay: 200,
      ratePerKm: 0.8,
      kmPerSaturday: null,
    });
    // `ratePerKm` omitted → not written by upsert (Prisma keeps existing value).
    expect(captured.upsert).toEqual({
      year: 2026,
      month: 5,
      kmPerDay: 250,
    });
    expect(result.kmPerDay).toBe(250);
  });

  it('writes kmPerSaturday through to the repository and DTO', async () => {
    const captured: { upsert?: UpsertMonthlyLimitData } = {};
    const repo = makeRepo({
      existing: null,
      upsertResult: makeRow({
        year: 2026,
        month: 8,
        kmPerDay: 540,
        ratePerKm: 0.5,
        kmPerSaturday: 270,
      }),
      captured,
    });
    const svc = new LimitsService(repo);

    const { result } = await withAuditContext(() =>
      svc.upsert('2026-08', { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 270 }),
    );

    expect(captured.upsert).toEqual({
      year: 2026,
      month: 8,
      kmPerDay: 540,
      ratePerKm: 0.5,
      kmPerSaturday: 270,
    });
    expect(result.kmPerSaturday).toBe(270);
  });

  it('rejects an invalid yearMonth (422)', async () => {
    const repo = makeRepo({});
    const svc = new LimitsService(repo);
    await expect(svc.upsert('not-a-date', { kmPerDay: 1 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await expect(svc.upsert('2026-13', { kmPerDay: 1 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    await expect(svc.upsert('2026-00', { kmPerDay: 1 })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

// ── Bulk upsert (feature «wyłączane limity gwarancji», 2026-09-20) ──

describe('LimitsService.bulkUpsert', () => {
  it('writes every selected month with the same partial payload, sorted', async () => {
    const captured: {
      listMonths?: { year: number; months: number[] };
      upsertMany?: {
        year: number;
        months: number[];
        data: Omit<UpsertMonthlyLimitData, 'year' | 'month'>;
      };
    } = {};
    const repo = makeRepo({ listRows: [], captured });
    const svc = new LimitsService(repo);

    const { result } = await withAuditContext(() =>
      svc.bulkUpsert({
        year: 2026,
        months: [3, 1, 2],
        kmPerDay: 0,
        kmPerSaturday: 0,
      }),
    );

    // Months are normalised (sorted) before they reach the repository.
    expect(captured.upsertMany).toEqual({
      year: 2026,
      months: [1, 2, 3],
      // `ratePerKm` was NOT supplied ⇒ absent ⇒ column left untouched.
      data: { kmPerDay: 0, kmPerSaturday: 0 },
    });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.month)).toEqual([1, 2, 3]);
    expect(result.every((r) => r.kmPerDay === 0)).toBe(true);
  });

  it('omits unspecified fields entirely (no accidental NULL/0 write)', async () => {
    const captured: {
      upsertMany?: {
        year: number;
        months: number[];
        data: Omit<UpsertMonthlyLimitData, 'year' | 'month'>;
      };
    } = {};
    const repo = makeRepo({ listRows: [], captured });
    const svc = new LimitsService(repo);

    await withAuditContext(() =>
      svc.bulkUpsert({ year: 2026, months: [6], ratePerKm: 0.52 }),
    );

    expect(captured.upsertMany!.data).toEqual({ ratePerKm: 0.52 });
    expect('kmPerDay' in captured.upsertMany!.data).toBe(false);
    expect('kmPerSaturday' in captured.upsertMany!.data).toBe(false);
  });

  it('snapshots ONLY the affected rows into the audit `before`', async () => {
    const rows = [
      makeRow({ id: 'r1', year: 2026, month: 1, kmPerDay: 540, ratePerKm: 0.5 }),
      makeRow({ id: 'r2', year: 2026, month: 2, kmPerDay: 500, ratePerKm: 0.5 }),
      // Month 9 is NOT in the payload — must not appear in `before`.
      makeRow({ id: 'r9', year: 2026, month: 9, kmPerDay: 400, ratePerKm: 0.5 }),
    ];
    const captured: { listMonths?: { year: number; months: number[] } } = {};
    const repo = makeRepo({ listRows: rows, captured });
    const svc = new LimitsService(repo);

    const { store } = await withAuditContext(() =>
      svc.bulkUpsert({ year: 2026, months: [1, 2], kmPerDay: 0 }),
    );

    expect(captured.listMonths).toEqual({ year: 2026, months: [1, 2] });
    const before = store.before as {
      year: number;
      months: number[];
      rows: Array<{ id: string; month: number; kmPerDay: number | null }>;
    };
    expect(before.year).toBe(2026);
    expect(before.months).toEqual([1, 2]);
    expect(before.rows.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(before.rows[0]!.kmPerDay).toBe(540);
  });

  it('records the request payload in the audit metadata (intent, not just diff)', async () => {
    const repo = makeRepo({ listRows: [] });
    const svc = new LimitsService(repo);

    const { store } = await withAuditContext(() =>
      svc.bulkUpsert({ year: 2027, months: [11, 12], kmPerDay: 0 }),
    );

    expect(store.metadata).toEqual({
      payload: { year: 2027, months: [11, 12], kmPerDay: 0 },
    });
  });

  it('a month with no existing row simply has no `before` entry (INSERT path)', async () => {
    const repo = makeRepo({ listRows: [] });
    const svc = new LimitsService(repo);

    const { result, store } = await withAuditContext(() =>
      svc.bulkUpsert({ year: 2026, months: [4, 5], kmPerSaturday: 270 }),
    );

    expect((store.before as { rows: unknown[] }).rows).toEqual([]);
    expect(result.map((r) => r.kmPerSaturday)).toEqual([270, 270]);
  });
});
