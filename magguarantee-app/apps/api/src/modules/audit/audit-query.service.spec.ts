// Phase 4.5 — `AuditQueryService` unit tests.
//
// Hand-rolled fake over `jest.fn` mirrors the style used in
// `lookups.service.spec.ts` / `limits.service.spec.ts`. The repo is stubbed;
// we exercise filter-forwarding, cursor encode/decode, and the
// "limit + 1 → nextCursor" pagination convention.

import { BadRequestException } from '@nestjs/common';

import { AuditQueryService } from './audit-query.service';
import {
  AuditQueryRepository,
  type AuditListFilters,
  type AuditLogRow,
} from './audit-query.repository';

const T = (offset: number): Date =>
  new Date(`2026-05-${String(offset).padStart(2, '0')}T10:00:00.000Z`);

function makeRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    action: 'updateClaim',
    targetType: 'Claim',
    targetKey: 'GWA/001/05/26',
    userId: 'u-1',
    userLogin: 'admin',
    userName: 'Admin Adminowski',
    userRole: 'admin',
    before: { status: 'NA_WERYFIKACJI' },
    after: { status: 'ZAAKCEPTOWANO' },
    reason: null,
    metadata: { method: 'PATCH' },
    ipAddress: '10.0.0.1',
    createdAt: T(15),
    ...overrides,
  };
}

function makeRepo(opts: {
  rows?: AuditLogRow[];
  capture?: { filters?: AuditListFilters };
}): AuditQueryRepository {
  return {
    list: jest.fn(async (filters: AuditListFilters) => {
      if (opts.capture) opts.capture.filters = filters;
      return opts.rows ?? [];
    }),
  } as unknown as AuditQueryRepository;
}

describe('AuditQueryService.list — filter forwarding', () => {
  it('filter-by-targetType: forwards `targetType` to the repo', async () => {
    const capture: { filters?: AuditListFilters } = {};
    const svc = new AuditQueryService(
      makeRepo({
        rows: [makeRow({ targetType: 'Claim' })],
        capture,
      }),
    );

    const out = await svc.list({
      targetType: 'Claim',
      limit: 50,
    });

    expect(capture.filters?.targetType).toBe('Claim');
    expect(capture.filters?.userId).toBeUndefined();
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.targetType).toBe('Claim');
    expect(out.nextCursor).toBeNull();
  });

  it('filter-by-userId: forwards `userId` to the repo', async () => {
    const capture: { filters?: AuditListFilters } = {};
    const svc = new AuditQueryService(
      makeRepo({
        rows: [makeRow({ userId: 'u-target' })],
        capture,
      }),
    );

    const out = await svc.list({
      userId: 'u-target',
      limit: 50,
    });

    expect(capture.filters?.userId).toBe('u-target');
    expect(out.items[0]?.userId).toBe('u-target');
  });

  it('filter combo (action + date range): forwards all three to the repo', async () => {
    const capture: { filters?: AuditListFilters } = {};
    const svc = new AuditQueryService(
      makeRepo({
        rows: [makeRow()],
        capture,
      }),
    );

    await svc.list({
      action: 'updateClaim',
      from: '2026-05-01',
      to: '2026-05-31T23:59:59.000Z',
      limit: 50,
    });

    expect(capture.filters?.action).toBe('updateClaim');
    expect(capture.filters?.from).toBeInstanceOf(Date);
    expect(capture.filters?.to).toBeInstanceOf(Date);
    // `2026-05-01` parses to start-of-day UTC.
    expect(capture.filters?.from?.toISOString()).toBe(
      '2026-05-01T00:00:00.000Z',
    );
    expect(capture.filters?.to?.toISOString()).toBe(
      '2026-05-31T23:59:59.000Z',
    );
  });

  it('rejects an unparseable `from` value with 400', async () => {
    const svc = new AuditQueryService(makeRepo({}));
    await expect(
      svc.list({ from: 'not-a-date', limit: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AuditQueryService.list — pagination', () => {
  it('cursor edge (last page): no nextCursor when repo returns ≤ limit rows', async () => {
    const rows = [makeRow({ id: 'r-1' }), makeRow({ id: 'r-2' })];
    const svc = new AuditQueryService(makeRepo({ rows }));

    const out = await svc.list({ limit: 50 });

    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBeNull();
  });

  it('cursor encode/decode round-trips through a second page', async () => {
    // First page: repo returns `limit + 1` rows → service trims to `limit` and
    // emits a cursor pointing at the last kept row.
    const r1 = makeRow({ id: 'r-1', createdAt: T(20) });
    const r2 = makeRow({ id: 'r-2', createdAt: T(19) });
    const r3 = makeRow({ id: 'r-3', createdAt: T(18) }); // overflow sentinel
    const capture1: { filters?: AuditListFilters } = {};
    const page1 = await new AuditQueryService(
      makeRepo({ rows: [r1, r2, r3], capture: capture1 }),
    ).list({ limit: 2 });

    expect(page1.items).toHaveLength(2);
    expect(page1.items.map((r) => r.id)).toEqual(['r-1', 'r-2']);
    expect(page1.nextCursor).toBeTruthy();

    // Second page: forward the cursor; service decodes it back into a
    // `(createdAt, id)` tuple and forwards it to the repo.
    const capture2: { filters?: AuditListFilters } = {};
    const svc2 = new AuditQueryService(
      makeRepo({
        rows: [makeRow({ id: 'r-3', createdAt: T(18) })],
        capture: capture2,
      }),
    );
    const page2 = await svc2.list({ cursor: page1.nextCursor!, limit: 2 });

    expect(capture2.filters?.cursor).toEqual({
      createdAt: T(19),
      id: 'r-2',
    });
    expect(page2.items.map((r) => r.id)).toEqual(['r-3']);
    expect(page2.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor with 400', async () => {
    const svc = new AuditQueryService(makeRepo({}));
    await expect(
      svc.list({ cursor: 'not-base64-decodable!@#$', limit: 50 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
