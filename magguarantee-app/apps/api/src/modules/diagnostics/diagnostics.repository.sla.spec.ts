// docs/21-pracownik-verification-sla.md §1/§4 — the dashboard SLA candidate
// query. Mocks `PrismaService.tx` to assert the on-the-clock scan covers
// `NA_WERYFIKACJI` and `REKLAMACJA` (decision 2026-10-22), keeps the
// `statusChangedAt asc` order, and resolves the `statusChangedAt ?? createdAt`
// anchor while passing `status` through.

import { ClaimStatus as PrismaClaimStatus } from '@magguarantee/database';

import type { PrismaService } from '../prisma/prisma.service';
import { DiagnosticsRepository } from './diagnostics.repository';

function makeRepo(claimFindMany: jest.Mock): DiagnosticsRepository {
  const prisma = { tx: { claim: { findMany: claimFindMany } } };
  return new DiagnosticsRepository(prisma as unknown as PrismaService);
}

describe('DiagnosticsRepository.findOnSlaClock', () => {
  it('queries NA_WERYFIKACJI and REKLAMACJA ordered by statusChangedAt asc', async () => {
    const claimFindMany = jest.fn(async (_args: unknown) => []);

    await makeRepo(claimFindMany).findOnSlaClock();

    expect(claimFindMany).toHaveBeenCalledTimes(1);
    const arg = claimFindMany.mock.calls[0]?.[0] as unknown as {
      where: { status: { in: unknown[] } };
      orderBy: { statusChangedAt: string };
      select: Record<string, unknown>;
    };
    expect(arg.where.status).toEqual({
      in: [PrismaClaimStatus.NA_WERYFIKACJI, PrismaClaimStatus.REKLAMACJA],
    });
    expect(arg.orderBy).toEqual({ statusChangedAt: 'asc' });
    expect(arg.select).toMatchObject({
      status: true,
      statusChangedAt: true,
      createdAt: true,
    });
  });

  it('passes status through and anchors on statusChangedAt, falling back to createdAt', async () => {
    const filed = new Date('2026-06-05T09:30:00.000Z');
    const created = new Date('2026-04-02T08:00:00.000Z');
    const legacyCreated = new Date('2026-05-28T07:00:00.000Z');
    const claimFindMany = jest.fn(async () => [
      {
        id: '00000000-0000-0000-0000-0000000000r1',
        nrZgl: 'GWA/003/04/26',
        status: PrismaClaimStatus.REKLAMACJA,
        vehiclePlateSnapshot: 'PO7777',
        statusChangedAt: filed,
        createdAt: created,
        carrier: { user: { name: 'Carrier R', login: 'carrierr' } },
      },
      {
        id: '00000000-0000-0000-0000-0000000000w1',
        nrZgl: 'GWA/010/05/26',
        status: PrismaClaimStatus.NA_WERYFIKACJI,
        vehiclePlateSnapshot: null,
        statusChangedAt: null,
        createdAt: legacyCreated,
        carrier: { user: { name: null, login: 'carrierw' } },
      },
    ]);

    const rows = await makeRepo(claimFindMany).findOnSlaClock();

    expect(rows).toEqual([
      {
        id: '00000000-0000-0000-0000-0000000000r1',
        nrZgl: 'GWA/003/04/26',
        status: 'REKLAMACJA',
        carrierName: 'Carrier R',
        vehiclePlate: 'PO7777',
        anchorDate: filed,
      },
      {
        id: '00000000-0000-0000-0000-0000000000w1',
        nrZgl: 'GWA/010/05/26',
        status: 'NA_WERYFIKACJI',
        carrierName: 'carrierw',
        vehiclePlate: null,
        anchorDate: legacyCreated,
      },
    ]);
  });
});
