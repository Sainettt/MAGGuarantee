// `VehicleDailyKmRepository.listBoardDays` — the ONE board read behind the
// mixed-period claim settlement (docs/20 §0⁵). Exercised against a fake
// `PrismaService` whose `tx.vehicleDailyKm.findMany` records the query and
// returns raw Prisma-shaped rows, same technique as
// `claims.repository.delegation-status.spec.ts`.

import type { PrismaService } from '../prisma/prisma.service';
import { VehicleDailyKmRepository } from './vehicle-daily-km.repository';

function makeRepo(rows: Array<{ date: Date; state: 'drove' | 'idle'; km: number | null }>): {
  repo: VehicleDailyKmRepository;
  findMany: jest.Mock;
} {
  const findMany = jest.fn(async () => rows);
  const prisma = {
    get tx() {
      return { vehicleDailyKm: { findMany } };
    },
  } as unknown as PrismaService;
  return { repo: new VehicleDailyKmRepository(prisma), findMany };
}

describe('VehicleDailyKmRepository.listBoardDays', () => {
  const FROM = new Date('2025-08-21T00:00:00.000Z');
  const TO_EXCLUSIVE = new Date('2025-09-19T00:00:00.000Z');

  it('queries ONE vehicle over the half-open window, both states, ascending, slim projection', async () => {
    const { repo, findMany } = makeRepo([]);

    await repo.listBoardDays('v-1', FROM, TO_EXCLUSIVE);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      // No `state` filter: `idle` rows are filled days, the settlement needs them.
      where: { vehicleId: 'v-1', date: { gte: FROM, lt: TO_EXCLUSIVE } },
      select: { date: true, state: true, km: true },
      orderBy: { date: 'asc' },
    });
  });

  it('maps rows to `BoardDay` with an ISO `YYYY-MM-DD` date', async () => {
    const { repo } = makeRepo([
      { date: new Date('2025-09-01T00:00:00.000Z'), state: 'drove', km: 540 },
      { date: new Date('2025-09-02T00:00:00.000Z'), state: 'idle', km: null },
      { date: new Date('2025-09-03T00:00:00.000Z'), state: 'drove', km: null },
    ]);

    const out = await repo.listBoardDays('v-1', FROM, TO_EXCLUSIVE);

    expect(out).toEqual([
      { date: '2025-09-01', state: 'drove', km: 540 },
      { date: '2025-09-02', state: 'idle', km: null },
      { date: '2025-09-03', state: 'drove', km: null },
    ]);
  });

  it('returns [] when the vehicle has no marks in the window', async () => {
    const { repo } = makeRepo([]);
    await expect(repo.listBoardDays('v-1', FROM, TO_EXCLUSIVE)).resolves.toEqual([]);
  });
});
