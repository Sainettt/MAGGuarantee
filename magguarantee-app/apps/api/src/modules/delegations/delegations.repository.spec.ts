// Repository-level unit test for the delegation vehicle mini's km-guarantee
// rates. Prisma returns `Decimal` for `Vehicle.{rateDe,rateUe,rateExport,
// rateImport}`; the repository's `flatten` normalises them to `number | null`
// via the shared `decimalToNumber` helper (byte-identical to the vehicles /
// trailers repos). These tests pin that Decimal→number conversion at the seam
// it actually happens — `findById` runs `flatten` over the raw Prisma row.

import { PrismaService } from '../prisma/prisma.service';
import { DelegationsRepository } from './delegations.repository';

// A Prisma `Decimal`-like stand-in: an object exposing `.toNumber()`. The raw
// Prisma client returns exactly this shape for `@db.Decimal` columns.
function decimal(n: number): { toNumber(): number } {
  return { toNumber: () => n };
}

/**
 * Builds a raw Prisma-shaped delegation row (the `include: includeShape()`
 * projection) with the four vehicle rates set to the supplied values. Rates may
 * be Decimal-like, a plain number, or null — mirroring what the client can hand
 * back after the soft-delete extension widens the inferred type.
 */
function rawRow(rates: {
  rateDe: { toNumber(): number } | number | null;
  rateUe: { toNumber(): number } | number | null;
  rateExport: { toNumber(): number } | number | null;
  rateImport: { toNumber(): number } | number | null;
}) {
  const d = new Date('2026-05-19T08:00:00.000Z');
  return {
    id: 'deleg-1',
    vehicleId: 'veh-1',
    vehicle: {
      id: 'veh-1',
      plateNumber: 'PL123',
      agreement: true,
      ...rates,
      plannerId: null,
      dispatchTeamId: null,
      dispatchTeam: null,
      planner: { id: 'plan-now', login: 'plan.now', name: 'Plan Now' },
    },
    // docs/29 — the trip's own planista (snapshot).
    plannerId: 'plan-trip',
    planner: { id: 'plan-trip', login: 'plan.trip', name: 'Plan Trip' },
    trailerId: 'trl-1',
    trailer: { id: 'trl-1', plateNumber: 'TR1' },
    driverId: 'drv-1',
    driver: { id: 'drv-1', firstName: 'Jan', lastName: 'Kowalski' },
    carrierId: 'carrier-1',
    carrier: { id: 'carrier-1', user: { login: 'pwz', name: 'Pwz' } },
    driverNameSnapshot: 'Jan Kowalski',
    driverPhoneSnapshot: '111',
    departureAt: d,
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: new Date('2026-05-25T00:00:00.000Z'),
    returnCountry: 'PL',
    returnPostalCode: '00-001',
    status: 'zgloszony' as const,
    actualDepartureAt: null,
    actualReturnAt: null,
    reportedById: 'user-1',
    reportedBy: { id: 'user-1', login: 'pwz', name: 'Pwz' },
    reportedAt: d,
    verifiedById: null,
    verifiedBy: null,
    verifiedAt: null,
    readyById: null,
    readyBy: null,
    readyAt: null,
    spedOrderNumber: null,
    notes: null,
    claim: null,
    createdAt: d,
    updatedAt: d,
    deletedAt: null,
  };
}

function makeRepo(row: ReturnType<typeof rawRow>): DelegationsRepository {
  const prisma = {
    tx: {
      delegation: {
        findFirst: jest.fn(async () => row),
      },
    },
  } as unknown as PrismaService;
  return new DelegationsRepository(prisma);
}

describe('DelegationsRepository — vehicle rate Decimal→number mapping', () => {
  it('converts Decimal-like rates to numbers on the flattened vehicle mini', async () => {
    const repo = makeRepo(
      rawRow({
        rateDe: decimal(1.05),
        rateUe: decimal(1.15),
        rateExport: decimal(1.25),
        rateImport: decimal(1.35),
      }),
    );
    const out = await repo.findById('deleg-1');
    expect(out?.vehicle?.rateDe).toBe(1.05);
    expect(out?.vehicle?.rateUe).toBe(1.15);
    expect(out?.vehicle?.rateExport).toBe(1.25);
    expect(out?.vehicle?.rateImport).toBe(1.35);
    // The mapped values are real numbers, not the Decimal wrapper.
    expect(typeof out?.vehicle?.rateDe).toBe('number');
  });

  it('passes plain-number rates through unchanged', async () => {
    const repo = makeRepo(
      rawRow({ rateDe: 2, rateUe: 3, rateExport: 4, rateImport: 5 }),
    );
    const out = await repo.findById('deleg-1');
    expect(out?.vehicle?.rateDe).toBe(2);
    expect(out?.vehicle?.rateImport).toBe(5);
  });

  it('maps a missing (null) rate to null', async () => {
    const repo = makeRepo(
      rawRow({
        rateDe: null,
        rateUe: decimal(1.1),
        rateExport: null,
        rateImport: null,
      }),
    );
    const out = await repo.findById('deleg-1');
    expect(out?.vehicle?.rateDe).toBeNull();
    expect(out?.vehicle?.rateUe).toBe(1.1);
    expect(out?.vehicle?.rateExport).toBeNull();
    expect(out?.vehicle?.rateImport).toBeNull();
  });
});

// ── docs/29 — the planista snapshot on the trip ─────────────

describe('DelegationsRepository — planista snapshot (docs/29)', () => {
  const RATES = { rateDe: null, rateUe: null, rateExport: null, rateImport: null };

  function makeCapturingRepo(): {
    repo: DelegationsRepository;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  } {
    const findMany = jest.fn(async () => [rawRow(RATES)]);
    const updateMany = jest.fn(async () => ({ count: 2 }));
    const prisma = {
      tx: {
        delegation: {
          findFirst: jest.fn(async () => rawRow(RATES)),
          findMany,
          updateMany,
        },
      },
    } as unknown as PrismaService;
    return { repo: new DelegationsRepository(prisma), findMany, updateMany };
  }

  it('maps the trip snapshot AND keeps the vehicle’s current planista apart', async () => {
    const { repo } = makeCapturingRepo();
    const out = await repo.findById('deleg-1');
    expect(out?.plannerId).toBe('plan-trip');
    expect(out?.planner).toEqual({ id: 'plan-trip', login: 'plan.trip', name: 'Plan Trip' });
    expect(out?.vehicle?.planner?.id).toBe('plan-now');
  });

  it('the planista list scope filters the trip column, not the vehicle relation', async () => {
    const { repo, findMany } = makeCapturingRepo();
    await repo.list({ plannerId: 'plan-trip', limit: 50 });
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0]
      .where;
    expect(where.plannerId).toBe('plan-trip');
    expect(where.vehicle).toBeUndefined();
  });

  it('the dyspozytor scope still reads the vehicle’s live team', async () => {
    const { repo, findMany } = makeCapturingRepo();
    await repo.list({ dispatchTeamId: 'team-1', limit: 50 });
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0]
      .where;
    expect(where.vehicle).toEqual({ dispatchTeamId: 'team-1' });
    expect(where.plannerId).toBeUndefined();
  });

  it('reassignPlannerSnapshot moves only the given statuses of the old planista on this vehicle', async () => {
    const { repo, updateMany } = makeCapturingRepo();
    const moved = await repo.reassignPlannerSnapshot({
      vehicleId: 'veh-1',
      fromPlannerId: 'p-old',
      toPlannerId: 'p-new',
      statuses: ['zgloszony', 'gotowy'],
    });
    expect(moved).toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        vehicleId: 'veh-1',
        plannerId: 'p-old',
        status: { in: ['zgloszony', 'gotowy'] },
      },
      data: { plannerId: 'p-new' },
    });
  });
});
