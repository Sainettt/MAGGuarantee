// Phase 4.5 — `AuditQueryRepository` where-clause tests.
//
// We mock `PrismaService.tx` (same style as
// `verification-sla.repository.spec.ts`) and assert the shape of the `where`
// Prisma receives. The point of these tests is the *matching semantics* of the
// admin filter bar, which is not observable from the service layer:
//   - `action` is the free-text search box → case-insensitive substring;
//   - `targetType` / `targetKey` / `userId` → exact equality (the dropdown
//     feeds PascalCase values straight from `AUDIT_TARGET_TYPES`).

import type { PrismaService } from '../prisma/prisma.service';
import { AuditQueryRepository } from './audit-query.repository';

function makeRepo(): {
  repo: AuditQueryRepository;
  findMany: jest.Mock;
} {
  const findMany = jest.fn(async (_args: unknown) => []);
  const prisma = {
    tx: { auditLog: { findMany } },
  } as unknown as PrismaService;
  return { repo: new AuditQueryRepository(prisma), findMany };
}

function whereOf(findMany: jest.Mock): Record<string, unknown> {
  const arg = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
  return arg.where;
}

describe('AuditQueryRepository.list — filter semantics', () => {
  it('matches `action` as a case-insensitive substring, not an exact name', async () => {
    const { repo, findMany } = makeRepo();

    await repo.list({ action: 'claim', limit: 50 });

    // `claim` must reach rows like `submitClaim` / `claim.verify` — an exact
    // `where.action = 'claim'` would match nothing at all.
    expect(whereOf(findMany).action).toEqual({
      contains: 'claim',
      mode: 'insensitive',
    });
  });

  it('matches `targetType` with exact equality (PascalCase model name)', async () => {
    const { repo, findMany } = makeRepo();

    await repo.list({ targetType: 'Claim', limit: 50 });

    expect(whereOf(findMany).targetType).toBe('Claim');
  });

  it('combines targetType + action + userId with AND', async () => {
    const { repo, findMany } = makeRepo();

    await repo.list({
      targetType: 'Delegation',
      userId: 'u-1',
      action: 'markReturned',
      limit: 50,
    });

    const where = whereOf(findMany);
    expect(where).toMatchObject({
      targetType: 'Delegation',
      userId: 'u-1',
      action: { contains: 'markReturned', mode: 'insensitive' },
    });
  });

  it('omits absent filters entirely (no empty `where` keys)', async () => {
    const { repo, findMany } = makeRepo();

    await repo.list({ limit: 50 });

    expect(whereOf(findMany)).toEqual({});
  });

  it('builds a closed createdAt range from `from` + `to`', async () => {
    const { repo, findMany } = makeRepo();
    const from = new Date('2026-05-01T00:00:00.000Z');
    const to = new Date('2026-05-31T23:59:59.999Z');

    await repo.list({ from, to, limit: 50 });

    expect(whereOf(findMany).createdAt).toEqual({ gte: from, lte: to });
  });

  it('fetches `limit + 1` rows so the service can detect a next page', async () => {
    const { repo, findMany } = makeRepo();

    await repo.list({ limit: 50 });

    const arg = findMany.mock.calls[0]?.[0] as { take: number };
    expect(arg.take).toBe(51);
  });
});
