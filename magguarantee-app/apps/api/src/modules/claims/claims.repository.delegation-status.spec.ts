// Repository round-trip for the linked-outing status surfaced by the read
// surface (`includeShape().delegation.status` → `ClaimRow.delegationStatus`).
//
// `flatten()` is private; we exercise it through the public `findByNrZgl` with a
// fake `PrismaService` whose `tx.claim.findFirst` returns a raw Prisma-shaped
// row. Asserts the enum flows when the outing is linked and collapses to `null`
// when there is none — the FE gate + the service in-transit guard both key off
// this exact field.

import type { DelegationStatus } from '@magguarantee/shared';

import type { PrismaService } from '../prisma/prisma.service';
import { ClaimsRepository } from './claims.repository';

/** Minimal raw row covering every column `flatten()` reads. */
function makeRawRow(
  delegation:
    | { status: DelegationStatus; departureAt: Date | null }
    | null,
): Record<string, unknown> {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    nrZgl: 'GWA/001/04/26',
    carrierId: 'c-1',
    carrier: null,
    vehicleId: 'v-1',
    vehicle: { id: 'v-1', plateNumber: 'WX12345' },
    vehiclePlateSnapshot: 'WX12345',
    dateStart: new Date('2026-04-01T00:00:00.000Z'),
    dateEnd: new Date('2026-04-20T00:00:00.000Z'),
    timeFrom: '08:00',
    timeTo: '18:00',
    drivenDays: 20,
    mileage: 8_000,
    kmPerDay: 400,
    kmGuaranteed: 10_800,
    kmDifference: 2_800,
    paymentEur: 1_400,
    ratePerKmEffective: 0.5,
    breakdown: null,
    status: 'NA_WERYFIKACJI',
    statusChangedAt: null,
    decidedById: null,
    decidedBy: null,
    verifiedAt: null,
    verifiedById: null,
    verifiedBy: null,
    comment: null,
    orderNumber: null,
    orderDate: null,
    amountRequested: 1_400,
    amountApproved: null,
    reklamacjaSubmitted: false,
    reklamacjaText: null,
    reklamacjaResponse: null,
    reklamacjaAmount: null,
    statusBeforeReklamacja: null,
    origDateStart: null,
    origDateEnd: null,
    origMileage: null,
    origPaymentEur: null,
    origTimeFrom: null,
    origTimeTo: null,
    origHoursAdjusted: null,
    hoursAdjustedValue: null,
    maksimGateRequired: false,
    maksimGateNotifiedAt: null,
    maksimGateNotifiedAmount: null,
    maksimGateClearedAt: null,
    maksimGateClearedById: null,
    attachments: [],
    delegationId: delegation ? 'deleg-1' : null,
    delegation: delegation
      ? {
          status: delegation.status,
          departureAt: delegation.departureAt,
          actualDepartureAt: null,
          plannedReturnAt: null,
          actualReturnAt: null,
        }
      : null,
    periodAdjustedByVerifier: false,
    autoRecalcState: 'none',
    createdAt: new Date('2026-04-21T08:00:00.000Z'),
    updatedAt: new Date('2026-04-21T08:00:00.000Z'),
    deletedAt: null,
  };
}

function makeRepo(raw: Record<string, unknown> | null): {
  repo: ClaimsRepository;
  findFirst: jest.Mock;
} {
  const findFirst = jest.fn(async () => raw);
  const prisma = {
    get tx() {
      return { claim: { findFirst } };
    },
  } as unknown as PrismaService;
  return { repo: new ClaimsRepository(prisma), findFirst };
}

describe('ClaimsRepository.flatten — delegationStatus round-trip', () => {
  it('maps the linked outing status through when the outing is linked', async () => {
    const { repo } = makeRepo(
      makeRawRow({ status: 'w_trasie', departureAt: null }),
    );

    const row = await repo.findByNrZgl('GWA/001/04/26');

    expect(row).not.toBeNull();
    expect(row!.delegationId).toBe('deleg-1');
    expect(row!.delegationStatus).toBe('w_trasie');
  });

  it('collapses delegationStatus to null when there is no linked outing', async () => {
    const { repo } = makeRepo(makeRawRow(null));

    const row = await repo.findByNrZgl('GWA/001/04/26');

    expect(row).not.toBeNull();
    expect(row!.delegationId).toBeNull();
    expect(row!.delegationStatus).toBeNull();
  });
});
