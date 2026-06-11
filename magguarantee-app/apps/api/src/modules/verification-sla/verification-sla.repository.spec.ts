// docs/21-pracownik-verification-sla.md §5 — verification-SLA repository
// tests. We mock `PrismaService.tx` to assert the two queries: the
// NA_WERYFIKACJI scan with the `statusChangedAt ?? createdAt` anchor fallback,
// and the active-pracownik recipient predicate (`role=pracownik AND
// active=true AND deletedAt IS NULL`).

import {
  ClaimStatus as PrismaClaimStatus,
  Role as PrismaRole,
} from '@magguarantee/database';

import type { PrismaService } from '../prisma/prisma.service';
import { VerificationSlaRepository } from './verification-sla.repository';

function makeRepo(tx: Record<string, unknown>): {
  repo: VerificationSlaRepository;
  claimFindMany: jest.Mock;
  userFindMany: jest.Mock;
} {
  const claimFindMany = (tx.claim as { findMany: jest.Mock }).findMany;
  const userFindMany = (tx.user as { findMany: jest.Mock }).findMany;
  const prisma = { tx } as unknown as PrismaService;
  return { repo: new VerificationSlaRepository(prisma), claimFindMany, userFindMany };
}

describe('VerificationSlaRepository.findNaWeryfikacjiForSla', () => {
  it('queries only NA_WERYFIKACJI ordered by statusChangedAt asc', async () => {
    const claimFindMany = jest.fn(async (_args: unknown) => []);
    const { repo } = makeRepo({
      claim: { findMany: claimFindMany },
      user: { findMany: jest.fn() },
    });

    await repo.findNaWeryfikacjiForSla();

    expect(claimFindMany).toHaveBeenCalledTimes(1);
    const arg = claimFindMany.mock.calls[0]?.[0] as unknown as {
      where: { status: unknown };
      orderBy: { statusChangedAt: string };
    };
    expect(arg.where.status).toBe(PrismaClaimStatus.NA_WERYFIKACJI);
    expect(arg.orderBy).toEqual({ statusChangedAt: 'asc' });
  });

  it('uses statusChangedAt as the anchor when present', async () => {
    const changed = new Date('2026-06-01T10:00:00.000Z');
    const created = new Date('2026-05-20T08:00:00.000Z');
    const claimFindMany = jest.fn(async () => [
      {
        nrZgl: 'GWA/001/05/26',
        status: PrismaClaimStatus.NA_WERYFIKACJI,
        vehiclePlateSnapshot: 'WX1',
        statusChangedAt: changed,
        createdAt: created,
        carrier: { user: { name: 'Carrier A', login: 'carriera' } },
      },
    ]);
    const { repo } = makeRepo({
      claim: { findMany: claimFindMany },
      user: { findMany: jest.fn() },
    });

    const rows = await repo.findNaWeryfikacjiForSla();

    expect(rows[0]?.anchorDate).toEqual(changed);
    expect(rows[0]?.carrierName).toBe('Carrier A');
    expect(rows[0]?.vehiclePlate).toBe('WX1');
  });

  it('falls back to createdAt as the anchor when statusChangedAt is null', async () => {
    const created = new Date('2026-05-20T08:00:00.000Z');
    const claimFindMany = jest.fn(async () => [
      {
        nrZgl: 'GWA/002/05/26',
        status: PrismaClaimStatus.NA_WERYFIKACJI,
        vehiclePlateSnapshot: null,
        statusChangedAt: null,
        createdAt: created,
        carrier: { user: { name: null, login: 'carrierb' } },
      },
    ]);
    const { repo } = makeRepo({
      claim: { findMany: claimFindMany },
      user: { findMany: jest.fn() },
    });

    const rows = await repo.findNaWeryfikacjiForSla();

    expect(rows[0]?.anchorDate).toEqual(created);
    // carrier name falls back to login when User.name is null.
    expect(rows[0]?.carrierName).toBe('carrierb');
    expect(rows[0]?.vehiclePlate).toBeNull();
  });
});

describe('VerificationSlaRepository.findActivePracownikRecipients', () => {
  it('filters role=pracownik AND active=true AND deletedAt IS NULL', async () => {
    const userFindMany = jest.fn(async (_args: unknown) => [
      { email: 'p1@magtrans.eu', name: 'P1' },
      { email: 'p2@magtrans.eu', name: null },
    ]);
    const { repo } = makeRepo({
      claim: { findMany: jest.fn() },
      user: { findMany: userFindMany },
    });

    const rows = await repo.findActivePracownikRecipients();

    expect(userFindMany).toHaveBeenCalledTimes(1);
    const arg = userFindMany.mock.calls[0]?.[0] as unknown as {
      where: { role: unknown; active: boolean; deletedAt: null };
    };
    expect(arg.where.role).toBe(PrismaRole.pracownik);
    expect(arg.where.active).toBe(true);
    expect(arg.where.deletedAt).toBeNull();

    expect(rows).toEqual([
      { email: 'p1@magtrans.eu', name: 'P1' },
      { email: 'p2@magtrans.eu', name: null },
    ]);
  });
});
