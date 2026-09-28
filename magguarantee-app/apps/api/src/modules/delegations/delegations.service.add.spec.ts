import { ConflictException } from '@nestjs/common';

import type {
  DelegationStatus,
  SubmitDelegationDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CarrierReadinessService,
  type CarrierReadiness,
} from '../carriers/carrier-readiness.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import {
  DelegationsRepository,
  type DelegationRow,
} from './delegations.repository';
import { DelegationsService } from './delegations.service';

const CARRIER_ID = 'carrier-1';
const CARRIER_USER = 'user-1';
const VEHICLE_ID = 'veh-1';
const VEHICLE_PLANNER = 'plan-1';

function authCarrier(): AuthUser {
  return {
    sub: CARRIER_USER,
    login: 'pwz',
    email: 'pwz@magtrans.eu',
    name: 'Carrier',
    role: 'przewoznik',
    mustChangePassword: false,
  };
}

function submitDto(): SubmitDelegationDto {
  return {
    vehicleId: VEHICLE_ID,
    trailerId: 'trl-1',
    driverId: 'drv-1',
    departureAt: '2026-06-01T08:00:00.000Z',
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: '2026-06-05',
    returnCountry: 'PL',
    returnPostalCode: '00-001',
    comment: undefined,
  } as SubmitDelegationDto;
}

function readyState(): CarrierReadiness {
  return {
    hasVehicle: true,
    hasTrailer: true,
    hasDriver: true,
    incompleteFleet: false,
    ready: true,
  };
}

/**
 * Minimal active-delegation row for the conflict lookup. Only the fields the
 * guard reads (`status`, `departureAt`) need realistic values; the rest are
 * filled so the shape type-checks as a `DelegationRow`.
 */
function activeRow(
  status: DelegationStatus,
  departureAt = new Date('2026-05-20T07:00:00.000Z'),
): DelegationRow {
  return {
    id: 'deleg-active',
    vehicleId: VEHICLE_ID,
    vehicle: null,
    plannerId: null,
    planner: null,
    trailerId: 'trl-1',
    trailer: null,
    driverId: 'drv-1',
    driver: null,
    carrierId: CARRIER_ID,
    carrier: null,
    driverNameSnapshot: null,
    driverPhoneSnapshot: null,
    departureAt,
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: new Date('2026-05-25T00:00:00.000Z'),
    returnCountry: 'PL',
    returnPostalCode: '00-001',
    status,
    actualDepartureAt: null,
    actualReturnAt: null,
    reportedById: CARRIER_USER,
    reportedBy: null,
    reportedAt: new Date('2026-05-19T00:00:00.000Z'),
    verifiedById: null,
    verifiedBy: null,
    verifiedAt: null,
    readyById: null,
    readyBy: null,
    readyAt: null,
    spedOrderNumber: null,
    notes: null,
    claimId: null,
    createdAt: new Date('2026-05-19T00:00:00.000Z'),
    updatedAt: new Date('2026-05-19T00:00:00.000Z'),
    deletedAt: null,
  };
}

/**
 * Builds a DelegationsService whose delegations-repo `findActiveByVehicle`
 * returns `conflict` (the existing active outing, or `null` when the vehicle is
 * free). `create` records the persisted row so the "no row on 409" assertion
 * can be made. Mirrors the positional-fake convention in
 * `delegations.service.spec.ts`.
 */
function makeService(conflict: DelegationRow | null) {
  const createSpy = jest.fn(async (data: Record<string, unknown>) => ({
    id: 'deleg-new',
    ...data,
    vehicle: null,
    trailer: null,
    driver: null,
    carrier: null,
    reportedBy: null,
    verifiedBy: null,
    verifiedById: null,
    verifiedAt: null,
    readyById: null,
    readyBy: null,
    readyAt: null,
    actualDepartureAt: null,
    actualReturnAt: null,
    status: 'zgloszony',
    reportedAt: new Date('2026-05-29T00:00:00.000Z'),
    createdAt: new Date('2026-05-29T00:00:00.000Z'),
    updatedAt: new Date('2026-05-29T00:00:00.000Z'),
    deletedAt: null,
  }));

  const findActiveSpy = jest.fn(
    async (vehicleId: string): Promise<DelegationRow | null> =>
      conflict && conflict.vehicleId === vehicleId ? conflict : null,
  );

  const delegations = {
    create: createSpy,
    findActiveByVehicle: findActiveSpy,
  } as unknown as DelegationsRepository;

  const carriers = {
    list: jest.fn(async () => [{ id: CARRIER_ID, userId: CARRIER_USER }]),
  } as unknown as CarriersRepository;

  const vehicles = {
    findById: jest.fn(async () => ({
      id: VEHICLE_ID,
      carrierId: CARRIER_ID,
      plateNumber: 'PL123',
      active: true,
      // docs/29 — the vehicle's current planista, stamped onto the new trip.
      plannerId: VEHICLE_PLANNER,
    })),
  } as unknown as VehiclesRepository;

  const drivers = {
    findById: jest.fn(async () => ({
      id: 'drv-1',
      carrierId: CARRIER_ID,
      firstName: 'Jan',
      lastName: 'Kowalski',
      phone: '111',
      active: true,
    })),
  } as unknown as DriversRepository;

  const trailers = {
    findById: jest.fn(async () => ({
      id: 'trl-1',
      carrierId: CARRIER_ID,
      plateNumber: 'TR1',
    })),
  } as unknown as TrailersRepository;

  const readinessSvc = {
    forCarrier: jest.fn(async () => readyState()),
  } as unknown as CarrierReadinessService;

  const service = new DelegationsService(
    delegations,
    carriers,
    vehicles,
    drivers,
    trailers,
    readinessSvc,
  );
  return { service, createSpy, findActiveSpy };
}

/** Asserts the promise rejects with a 409 ConflictException naming the outing. */
async function expectActiveTripConflict(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(ConflictException);
  try {
    await promise;
    throw new Error('expected to throw');
  } catch (err) {
    expect(err).toBeInstanceOf(ConflictException);
    const status = (err as ConflictException).getStatus();
    expect(status).toBe(409);
    const message = (err as ConflictException).message;
    // Message NAMES the conflicting outing (departure date + active-trip copy).
    expect(message).toMatch(/aktywnego wyjazdu/i);
    expect(message).toMatch(/z dnia/i);
    expect(message).toMatch(/status:/i);
  }
}

describe('DelegationsService.add — ≤1 active delegation per vehicle (CREATE guard)', () => {
  it.each<DelegationStatus>(['zgloszony', 'gotowy', 'w_trasie'])(
    'blocks (409) when the vehicle already has a %s delegation, no row created',
    async (status) => {
      const { service, createSpy } = makeService(activeRow(status));
      await expectActiveTripConflict(service.add(authCarrier(), submitDto()));
      expect(createSpy).not.toHaveBeenCalled();
    },
  );

  it('409 message carries the PL status label and the departure date', async () => {
    const { service } = makeService(
      activeRow('w_trasie', new Date('2026-05-20T07:00:00.000Z')),
    );
    try {
      await service.add(authCarrier(), submitDto());
      throw new Error('expected to throw');
    } catch (err) {
      const message = (err as ConflictException).message;
      expect(message).toContain('w trasie'); // human PL label, not `w_trasie`
      expect(message).toContain('20.05.2026'); // departure date (Europe/Warsaw)
      expect(message).not.toContain('w_trasie'); // raw enum must not leak
    }
  });

  it.each<DelegationStatus>(['zjechal', 'anulowany'])(
    'allows when the only existing delegation is terminal (%s)',
    async (status) => {
      // Terminal rows are outside the active set, so the repo returns null.
      // Model that by passing `null` (the repo would not surface a terminal row).
      const terminal = activeRow(status);
      const { service, createSpy, findActiveSpy } = makeService(null);
      // sanity: the fake's conflict input was terminal but the guard only sees
      // what `findActiveByVehicle` returns (null for terminal).
      expect(terminal.status).toBe(status);
      const out = await service.add(authCarrier(), submitDto());
      expect(out.id).toBe('deleg-new');
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(findActiveSpy).toHaveBeenCalledWith(
        VEHICLE_ID,
        expect.arrayContaining(['zgloszony', 'gotowy', 'w_trasie']),
      );
    },
  );

  it('allows when the only existing delegation is soft-deleted (deletedAt set)', async () => {
    // A soft-deleted row is excluded by `findActiveByVehicle` (deletedAt: null
    // filter), so the repo returns null even though a row exists in the table.
    const { service, createSpy } = makeService(null);
    const out = await service.add(authCarrier(), submitDto());
    expect(out.id).toBe('deleg-new');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('allows when the vehicle has no prior delegation', async () => {
    const { service, createSpy } = makeService(null);
    const out = await service.add(authCarrier(), submitDto());
    expect(out.id).toBe('deleg-new');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('(sanity) a DIFFERENT vehicle’s active delegation does NOT block', async () => {
    // The conflict row is for another vehicle, so the repo (keyed by vehicleId)
    // returns null for this submit's vehicle.
    const otherVehicleActive = activeRow('w_trasie');
    otherVehicleActive.vehicleId = 'veh-OTHER';
    const { service, createSpy, findActiveSpy } =
      makeService(otherVehicleActive);
    const out = await service.add(authCarrier(), submitDto());
    expect(out.id).toBe('deleg-new');
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(findActiveSpy).toHaveBeenCalledWith(VEHICLE_ID, expect.anything());
  });
});

describe('DelegationsService.add — planista snapshot (docs/29 §3.3)', () => {
  it("stamps Delegation.plannerId = the vehicle's current planista and returns it", async () => {
    const { service, createSpy } = makeService(null);
    const out = await service.add(authCarrier(), submitDto());
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ vehicleId: VEHICLE_ID, plannerId: VEHICLE_PLANNER }),
    );
    expect(out.plannerId).toBe(VEHICLE_PLANNER);
  });
});
