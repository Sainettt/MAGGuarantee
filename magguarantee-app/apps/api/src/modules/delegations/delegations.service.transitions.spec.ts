import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import type {
  CancelDelegationDto,
  DelegationStatus,
  MarkReturnedDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import {
  DelegationsRepository,
  type DelegationRow,
  type UpdateDelegationData,
} from './delegations.repository';
import { DelegationsService } from './delegations.service';

const VERIFIER_SUB = 'wer-1';
const VEHICLE_ID = 'veh-1';

function auth(role: AuthUser['role'], sub: string): AuthUser {
  return { sub, login: 'actor', email: 'actor@magtrans.eu', name: 'Actor', role };
}

function makeRow(overrides: Partial<DelegationRow> = {}): DelegationRow {
  return {
    id: 'deleg-1',
    vehicleId: VEHICLE_ID,
    vehicle: {
      id: VEHICLE_ID,
      plateNumber: 'PL123',
      plannerId: 'plan-1',
      dispatcherId: 'dys-1',
    },
    trailerId: 'trl-1',
    trailer: { id: 'trl-1', plateNumber: 'TR1' },
    driverId: 'drv-1',
    driver: { id: 'drv-1', firstName: 'Jan', lastName: 'Kowalski' },
    carrierId: 'carrier-x',
    carrier: { id: 'carrier-x', login: 'pwz', name: 'Pwz' },
    driverNameSnapshot: 'Jan Kowalski',
    driverPhoneSnapshot: '111',
    departureAt: new Date('2026-05-20T08:00:00.000Z'),
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: new Date('2026-05-25T00:00:00.000Z'),
    returnCountry: 'PL',
    returnPostalCode: '00-001',
    status: 'zgloszony',
    actualReturnAt: null,
    reportedById: 'user-x',
    reportedBy: { id: 'user-x', login: 'pwz', name: 'Pwz' },
    reportedAt: new Date('2026-05-19T08:00:00.000Z'),
    verifiedById: null,
    verifiedBy: null,
    verifiedAt: null,
    notes: null,
    createdAt: new Date('2026-05-19T08:00:00.000Z'),
    updatedAt: new Date('2026-05-19T08:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Builds the service so `delegations.findById` returns `row` (or null), and
 * `delegations.update` / `vehicles.update` echo their input merged onto the
 * row so the DTO mapper has a full shape. The update spies are returned so
 * the assertions can inspect exactly what was written.
 */
function makeService(row: DelegationRow | null) {
  const findByIdSpy = jest.fn(async (_id: string) => row);
  const updateSpy = jest.fn(
    async (id: string, data: UpdateDelegationData): Promise<DelegationRow> =>
      makeRow({
        id,
        ...(data.status ? { status: data.status } : {}),
        ...(data.actualReturnAt !== undefined
          ? { actualReturnAt: data.actualReturnAt }
          : {}),
        ...(data.verifiedById !== undefined
          ? { verifiedById: data.verifiedById }
          : {}),
        ...(data.verifiedAt !== undefined
          ? { verifiedAt: data.verifiedAt }
          : {}),
      }),
  );
  const delegations = {
    findById: findByIdSpy,
    update: updateSpy,
  } as unknown as DelegationsRepository;

  const vehicleUpdateSpy = jest.fn(
    async (_id: string, _data: Record<string, unknown>) => ({}),
  );
  const vehicles = {
    update: vehicleUpdateSpy,
  } as unknown as VehiclesRepository;

  const service = new DelegationsService(
    delegations,
    {} as unknown as CarriersRepository,
    vehicles,
    {} as unknown as DriversRepository,
    {} as unknown as TrailersRepository,
    {} as unknown as CarrierReadinessService,
  );
  return { service, findByIdSpy, updateSpy, vehicleUpdateSpy };
}

describe('DelegationsService.markInTransit', () => {
  it('happy path: zgloszony → w_trasie, stamps verifiedBy/At', async () => {
    const { service, updateSpy } = makeService(makeRow({ status: 'zgloszony' }));
    const before = Date.now();
    const out = await service.markInTransit(
      auth('weryfikator', VERIFIER_SUB),
      'deleg-1',
    );
    expect(out.status).toBe('w_trasie');
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [, data] = updateSpy.mock.calls[0]!;
    expect(data.status).toBe('w_trasie');
    expect(data.verifiedById).toBe(VERIFIER_SUB);
    expect(data.verifiedAt).toBeInstanceOf(Date);
    expect((data.verifiedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    // No actualReturnAt is touched on in-transit.
    expect(data.actualReturnAt).toBeUndefined();
  });

  it('admin may also drive the transition', async () => {
    const { service, updateSpy } = makeService(makeRow({ status: 'zgloszony' }));
    const out = await service.markInTransit(auth('admin', 'adm-1'), 'deleg-1');
    expect(out.status).toBe('w_trasie');
    expect(updateSpy.mock.calls[0]![1].verifiedById).toBe('adm-1');
  });

  it('404 when the delegation does not exist', async () => {
    const { service, updateSpy } = makeService(null);
    await expect(
      service.markInTransit(auth('weryfikator', VERIFIER_SUB), 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it.each(['w_trasie', 'zjechal', 'anulowany'] as DelegationStatus[])(
    'illegal source status %s → 409, no write',
    async (status) => {
      const { service, updateSpy } = makeService(makeRow({ status }));
      await expect(
        service.markInTransit(auth('weryfikator', VERIFIER_SUB), 'deleg-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(updateSpy).not.toHaveBeenCalled();
    },
  );
});

describe('DelegationsService.markReturned', () => {
  const dto: MarkReturnedDto = { actualReturnAt: '2026-05-24' };

  it('happy path: w_trasie → zjechal, sets actualReturnAt + verifiedBy/At', async () => {
    const { service, updateSpy } = makeService(makeRow({ status: 'w_trasie' }));
    const out = await service.markReturned(
      auth('weryfikator', VERIFIER_SUB),
      'deleg-1',
      dto,
    );
    expect(out.status).toBe('zjechal');
    const [, data] = updateSpy.mock.calls[0]!;
    expect(data.status).toBe('zjechal');
    expect(data.verifiedById).toBe(VERIFIER_SUB);
    expect(data.verifiedAt).toBeInstanceOf(Date);
    // Date-only parsed to UTC midnight, exactly like plannedReturnAt.
    expect((data.actualReturnAt as Date).toISOString()).toBe(
      '2026-05-24T00:00:00.000Z',
    );
  });

  it('updates Vehicle.lastDroveAt atomically to actualReturnAt (UTC midnight)', async () => {
    const { service, vehicleUpdateSpy } = makeService(
      makeRow({ status: 'w_trasie' }),
    );
    await service.markReturned(
      auth('weryfikator', VERIFIER_SUB),
      'deleg-1',
      dto,
    );
    expect(vehicleUpdateSpy).toHaveBeenCalledTimes(1);
    const [vehicleId, vehData] = vehicleUpdateSpy.mock.calls[0]!;
    expect(vehicleId).toBe(VEHICLE_ID);
    expect((vehData.lastDroveAt as Date).toISOString()).toBe(
      '2026-05-24T00:00:00.000Z',
    );
  });

  it('admin may also drive the transition', async () => {
    const { service, updateSpy } = makeService(makeRow({ status: 'w_trasie' }));
    const out = await service.markReturned(auth('admin', 'adm-1'), 'deleg-1', dto);
    expect(out.status).toBe('zjechal');
    expect(updateSpy.mock.calls[0]![1].verifiedById).toBe('adm-1');
  });

  it('404 when the delegation does not exist', async () => {
    const { service, updateSpy, vehicleUpdateSpy } = makeService(null);
    await expect(
      service.markReturned(auth('weryfikator', VERIFIER_SUB), 'missing', dto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(vehicleUpdateSpy).not.toHaveBeenCalled();
  });

  it.each(['zgloszony', 'zjechal', 'anulowany'] as DelegationStatus[])(
    'illegal source status %s → 409, no delegation/vehicle write',
    async (status) => {
      const { service, updateSpy, vehicleUpdateSpy } = makeService(
        makeRow({ status }),
      );
      await expect(
        service.markReturned(auth('weryfikator', VERIFIER_SUB), 'deleg-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(updateSpy).not.toHaveBeenCalled();
      expect(vehicleUpdateSpy).not.toHaveBeenCalled();
    },
  );
});

/**
 * Regression — cancel is carrier-only and gated to `zgloszony`. Phase 7 must
 * NOT have touched this path (the verifier has no cancel authority and the
 * state machine is not consulted here). These assertions pin the existing
 * service-level behaviour so a future refactor can't silently widen it.
 */
describe('DelegationsService.cancel — Phase 7 regression (unchanged)', () => {
  const CANCEL_CARRIER_ID = 'carrier-x';
  const CANCEL_CARRIER_USER = 'pwz-user';
  const cancelDto: CancelDelegationDto = { reason: undefined };

  function makeCancelService(row: DelegationRow | null) {
    const updateSpy = jest.fn(
      async (id: string, data: UpdateDelegationData): Promise<DelegationRow> =>
        makeRow({ id, status: data.status ?? 'anulowany' }),
    );
    const delegations = {
      findById: jest.fn(async () => row),
      update: updateSpy,
    } as unknown as DelegationsRepository;
    const carriers = {
      list: jest.fn(async () => [
        { id: CANCEL_CARRIER_ID, userId: CANCEL_CARRIER_USER },
      ]),
    } as unknown as CarriersRepository;
    const service = new DelegationsService(
      delegations,
      carriers,
      {} as unknown as VehiclesRepository,
      {} as unknown as DriversRepository,
      {} as unknown as TrailersRepository,
      {} as unknown as CarrierReadinessService,
    );
    return { service, updateSpy };
  }

  it('carrier may cancel their own zgloszony → anulowany', async () => {
    const { service, updateSpy } = makeCancelService(
      makeRow({ status: 'zgloszony', carrierId: CANCEL_CARRIER_ID }),
    );
    const out = await service.cancel(
      auth('przewoznik', CANCEL_CARRIER_USER),
      'deleg-1',
      cancelDto,
    );
    expect(out.status).toBe('anulowany');
    expect(updateSpy.mock.calls[0]![1].status).toBe('anulowany');
  });

  it('non-zgloszony status → 409 (status gate unchanged), no write', async () => {
    const { service, updateSpy } = makeCancelService(
      makeRow({ status: 'w_trasie', carrierId: CANCEL_CARRIER_ID }),
    );
    await expect(
      service.cancel(auth('przewoznik', CANCEL_CARRIER_USER), 'deleg-1', cancelDto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('a weryfikator cannot cancel at the service layer (403, no verifier path)', async () => {
    const { service, updateSpy } = makeCancelService(
      makeRow({ status: 'zgloszony', carrierId: CANCEL_CARRIER_ID }),
    );
    await expect(
      service.cancel(auth('weryfikator', 'wer-1'), 'deleg-1', cancelDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
