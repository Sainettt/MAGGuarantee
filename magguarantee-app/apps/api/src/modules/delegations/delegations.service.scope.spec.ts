import { ForbiddenException } from '@nestjs/common';

import type { DelegationFilters } from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import {
  DelegationsRepository,
  type DelegationListFilters,
  type DelegationRow,
} from './delegations.repository';
import { DelegationsService } from './delegations.service';

const DISPATCHER_SUB = 'dys-1';
const PLANNER_SUB = 'plan-1';
const CARRIER_ID = 'carrier-1';
const CARRIER_USER = 'user-1';

function auth(role: AuthUser['role'], sub: string): AuthUser {
  return { sub, login: 'actor', email: 'actor@magtrans.eu', name: 'Actor', role };
}

function baseFilters(overrides: Partial<DelegationFilters> = {}): DelegationFilters {
  return { limit: 50, ...overrides } as DelegationFilters;
}

function makeRow(overrides: Partial<DelegationRow> = {}): DelegationRow {
  return {
    id: 'deleg-1',
    vehicleId: 'veh-1',
    vehicle: {
      id: 'veh-1',
      plateNumber: 'PL123',
      plannerId: PLANNER_SUB,
      dispatcherId: DISPATCHER_SUB,
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
 * Builds the service with a delegations repo whose `list` records the filters
 * it received (so the dispatcher-scope assertions can inspect them) and returns
 * a fixed page.
 */
function makeService(returned: DelegationRow[] = [makeRow()]) {
  const listSpy = jest.fn(async (_filters: DelegationListFilters) => returned);
  const findByIdSpy = jest.fn(async (_id: string) => returned[0] ?? null);
  const delegations = {
    list: listSpy,
    findById: findByIdSpy,
  } as unknown as DelegationsRepository;

  const carriers = {
    list: jest.fn(async () => [{ id: CARRIER_ID, userId: CARRIER_USER }]),
  } as unknown as CarriersRepository;

  const service = new DelegationsService(
    delegations,
    carriers,
    {} as unknown as VehiclesRepository,
    {} as unknown as DriversRepository,
    {} as unknown as TrailersRepository,
    {} as unknown as CarrierReadinessService,
  );
  return { service, listSpy, findByIdSpy };
}

describe('DelegationsService.list — dyspozytor auto-scope', () => {
  it('scopes to dispatcherId=user.sub (relation filter), not the all-access branch', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('dyspozytor', DISPATCHER_SUB), baseFilters());
    expect(listSpy).toHaveBeenCalledTimes(1);
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.dispatcherId).toBe(DISPATCHER_SUB);
  });

  it('IGNORES a client-supplied carrierId (server identity wins)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('dyspozytor', DISPATCHER_SUB),
      baseFilters({ carrierId: 'someone-elses-carrier' }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.dispatcherId).toBe(DISPATCHER_SUB);
    expect(passed.carrierId).toBeUndefined();
  });

  it('IGNORES a client-supplied vehicleId (server identity wins)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('dyspozytor', DISPATCHER_SUB),
      baseFilters({ vehicleId: 'someone-elses-vehicle' }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.dispatcherId).toBe(DISPATCHER_SUB);
    expect(passed.vehicleId).toBeUndefined();
  });

  it('preserves non-scope filters (status / from / limit) alongside the dispatcher scope', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('dyspozytor', DISPATCHER_SUB),
      baseFilters({ status: 'w_trasie', from: '2026-05-01T00:00:00.000Z', limit: 25 }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed).toMatchObject({
      dispatcherId: DISPATCHER_SUB,
      status: 'w_trasie',
      from: '2026-05-01T00:00:00.000Z',
      limit: 25,
    });
  });

  it('returns the mapped page for a dyspozytor caller', async () => {
    const { service } = makeService([makeRow({ id: 'd-A' }), makeRow({ id: 'd-B' })]);
    const out = await service.list(auth('dyspozytor', DISPATCHER_SUB), baseFilters());
    expect(out.items.map((i) => i.id)).toEqual(['d-A', 'd-B']);
    expect(out.nextCursor).toBeNull();
  });
});

describe('DelegationsService.list — planista auto-scope (Phase 6.4)', () => {
  it('scopes to plannerId=user.sub (relation filter), NOT the all-access branch', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('planista', PLANNER_SUB), baseFilters());
    expect(listSpy).toHaveBeenCalledTimes(1);
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.plannerId).toBe(PLANNER_SUB);
    // Planista must NOT receive a dispatcher scope (different axis).
    expect(passed.dispatcherId).toBeUndefined();
  });

  it('IGNORES a client-supplied carrierId (server identity wins)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('planista', PLANNER_SUB),
      baseFilters({ carrierId: 'someone-elses-carrier' }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.plannerId).toBe(PLANNER_SUB);
    expect(passed.carrierId).toBeUndefined();
  });

  it('IGNORES a client-supplied vehicleId (server identity wins)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('planista', PLANNER_SUB),
      baseFilters({ vehicleId: 'someone-elses-vehicle' }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.plannerId).toBe(PLANNER_SUB);
    expect(passed.vehicleId).toBeUndefined();
  });

  it('preserves non-scope filters (status / from / limit) alongside the planner scope', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('planista', PLANNER_SUB),
      baseFilters({ status: 'w_trasie', from: '2026-05-01T00:00:00.000Z', limit: 25 }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed).toMatchObject({
      plannerId: PLANNER_SUB,
      status: 'w_trasie',
      from: '2026-05-01T00:00:00.000Z',
      limit: 25,
    });
  });
});

describe('DelegationsService.list — other roles unchanged', () => {
  it('admin keeps full access (no dispatcher/planner scope injected)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('admin', 'admin-1'),
      baseFilters({ carrierId: 'any-carrier' }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.dispatcherId).toBeUndefined();
    expect(passed.plannerId).toBeUndefined();
    expect(passed.carrierId).toBe('any-carrier');
  });

  it.each(['opiekun', 'eksport', 'weryfikator'] as const)(
    'all-access role=%s keeps full access (no planner scope injected)',
    async (role) => {
      const { service, listSpy } = makeService();
      await service.list(
        auth(role, `${role}-1`),
        baseFilters({ carrierId: 'any-carrier' }),
      );
      const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
      expect(passed.plannerId).toBeUndefined();
      expect(passed.dispatcherId).toBeUndefined();
      expect(passed.carrierId).toBe('any-carrier');
    },
  );

  it('przewoznik is still scoped to its own carrierId', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('przewoznik', CARRIER_USER), baseFilters());
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.carrierId).toBe(CARRIER_ID);
    expect(passed.dispatcherId).toBeUndefined();
    expect(passed.plannerId).toBeUndefined();
  });

  it('pracownik is rejected (never sees delegacje — quirk #13)', async () => {
    const { service } = makeService();
    await expect(
      service.list(auth('pracownik', 'prac-1'), baseFilters()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('DelegationsService.getOne — by-id read scope (Phase 6.4)', () => {
  it('planista may read a delegation of a vehicle they plan', async () => {
    const row = makeRow({
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        plannerId: PLANNER_SUB,
        dispatcherId: 'other-dys',
      },
    });
    const { service } = makeService([row]);
    const out = await service.getOne(auth('planista', PLANNER_SUB), 'deleg-1');
    expect(out.id).toBe('deleg-1');
  });

  it("planista is 403 on another planner's delegation", async () => {
    const row = makeRow({
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        plannerId: 'someone-else',
        dispatcherId: DISPATCHER_SUB,
      },
    });
    const { service } = makeService([row]);
    await expect(
      service.getOne(auth('planista', PLANNER_SUB), 'deleg-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('dyspozytor may read a delegation of a vehicle they dispatch', async () => {
    const row = makeRow({
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        plannerId: 'other-plan',
        dispatcherId: DISPATCHER_SUB,
      },
    });
    const { service } = makeService([row]);
    const out = await service.getOne(
      auth('dyspozytor', DISPATCHER_SUB),
      'deleg-1',
    );
    expect(out.id).toBe('deleg-1');
  });

  it("dyspozytor is 403 on another dispatcher's delegation (Phase 6 closed this hole)", async () => {
    const row = makeRow({
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        plannerId: PLANNER_SUB,
        dispatcherId: 'someone-else',
      },
    });
    const { service } = makeService([row]);
    await expect(
      service.getOne(auth('dyspozytor', DISPATCHER_SUB), 'deleg-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('przewoznik may read its own carrier delegation', async () => {
    const row = makeRow({ carrierId: CARRIER_ID });
    const { service } = makeService([row]);
    const out = await service.getOne(auth('przewoznik', CARRIER_USER), 'deleg-1');
    expect(out.id).toBe('deleg-1');
  });

  it("przewoznik is 403 on another carrier's delegation", async () => {
    const row = makeRow({ carrierId: 'other-carrier' });
    const { service } = makeService([row]);
    await expect(
      service.getOne(auth('przewoznik', CARRIER_USER), 'deleg-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['admin', 'opiekun', 'eksport', 'weryfikator'] as const)(
    'all-access role=%s may read any delegation by id',
    async (role) => {
      const row = makeRow({
        carrierId: 'any-carrier',
        vehicle: {
          id: 'veh-1',
          plateNumber: 'PL123',
          plannerId: 'p-x',
          dispatcherId: 'd-x',
        },
      });
      const { service } = makeService([row]);
      const out = await service.getOne(auth(role, `${role}-1`), 'deleg-1');
      expect(out.id).toBe('deleg-1');
    },
  );
});
