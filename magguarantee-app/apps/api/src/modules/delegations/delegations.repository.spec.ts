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
      planner: null,
    },
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
