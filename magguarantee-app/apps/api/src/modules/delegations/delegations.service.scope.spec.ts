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
    vehicle: { id: 'veh-1', plateNumber: 'PL123' },
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
  const delegations = { list: listSpy } as unknown as DelegationsRepository;

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
  return { service, listSpy };
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

describe('DelegationsService.list — other roles unchanged', () => {
  it('admin keeps full access (no dispatcher scope injected)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('admin', 'admin-1'),
      baseFilters({ carrierId: 'any-carrier' }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.dispatcherId).toBeUndefined();
    expect(passed.carrierId).toBe('any-carrier');
  });

  it('przewoznik is still scoped to its own carrierId', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('przewoznik', CARRIER_USER), baseFilters());
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.carrierId).toBe(CARRIER_ID);
    expect(passed.dispatcherId).toBeUndefined();
  });

  it('pracownik is rejected (never sees delegacje — quirk #13)', async () => {
    const { service } = makeService();
    await expect(
      service.list(auth('pracownik', 'prac-1'), baseFilters()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
