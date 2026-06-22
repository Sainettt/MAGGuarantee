// Phase 7 REWORK (2026-06-20 #4) — delegation status transition unit tests.
//
// Covers:
//   - markReady (zgloszony→gotowy flip + rollback gotowy→zgloszony pre-w_trasie,
//     and the rollback-after-w_trasie 422),
//   - markInTransit (gotowy→w_trasie, stamps verifiedBy/At),
//   - markReturned (w_trasie→zjechal: actualReturnAt, lastDroveAt = max(...),
//     and the claims auto-recalc call),
//   - cancel (admin any active; carrier own zgloszony unchanged).
//
// Style: hand-rolled fakes over `jest.fn`, mirroring `delegations.service.spec`.

import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  CancelDelegationDto,
  MarkReadyDto,
  MarkReturnedDto,
} from '@magguarantee/shared';

import type { ClaimsService } from '../claims/claims.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { ChatNotifierService } from '../integrations/chat/chat-notifier.service';
import type { TrailersRepository } from '../trailers/trailers.repository';
import type { VehiclesRepository } from '../vehicles/vehicles.repository';
import {
  DelegationsRepository,
  type DelegationRow,
} from './delegations.repository';
import { DelegationsService } from './delegations.service';

const VEHICLE_ID = 'veh-1';
const CARRIER_ID = 'carrier-1';
const CARRIER_USER = 'user-1';

function auth(role: AuthUser['role'], sub = `u-${role}`): AuthUser {
  return {
    sub,
    login: role,
    email: `${role}@magtrans.eu`,
    name: role,
    role,
    mustChangePassword: false,
  };
}

function makeRow(overrides: Partial<DelegationRow> = {}): DelegationRow {
  return {
    id: 'deleg-1',
    vehicleId: VEHICLE_ID,
    vehicle: {
      id: VEHICLE_ID,
      plateNumber: 'PL123',
      plannerId: null,
      dispatchTeamId: null,
      dispatchTeam: null,
    },
    trailerId: 'trl-1',
    trailer: null,
    driverId: 'drv-1',
    driver: null,
    carrierId: CARRIER_ID,
    carrier: null,
    driverNameSnapshot: null,
    driverPhoneSnapshot: null,
    departureAt: new Date('2026-06-01T08:00:00.000Z'),
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: new Date('2026-06-05T00:00:00.000Z'),
    returnCountry: 'PL',
    returnPostalCode: '00-001',
    status: 'zgloszony',
    actualReturnAt: null,
    reportedById: null,
    reportedBy: null,
    reportedAt: new Date('2026-05-31T08:00:00.000Z'),
    verifiedById: null,
    verifiedBy: null,
    verifiedAt: null,
    notes: null,
    claimId: null,
    createdAt: new Date('2026-05-31T08:00:00.000Z'),
    updatedAt: new Date('2026-05-31T08:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

interface Built {
  service: DelegationsService;
  updateSpy: jest.Mock;
  vehicleUpdateSpy: jest.Mock;
  vehicleFindSpy: jest.Mock;
  recalcSpy: jest.Mock;
}

function build(opts: {
  row: DelegationRow;
  vehicleLastDroveAt?: Date | null;
}): Built {
  const updateSpy = jest.fn(
    async (id: string, data: Partial<DelegationRow>) => ({
      ...opts.row,
      ...data,
      id,
    }),
  );
  const findByIdSpy = jest.fn(async () => opts.row);
  const delegations = {
    findById: findByIdSpy,
    update: updateSpy,
  } as unknown as DelegationsRepository;

  const vehicleUpdateSpy = jest.fn(async () => ({}));
  const vehicleFindSpy = jest.fn(async () => ({
    id: VEHICLE_ID,
    lastDroveAt: opts.vehicleLastDroveAt ?? null,
  }));
  const vehicles = {
    findById: vehicleFindSpy,
    update: vehicleUpdateSpy,
  } as unknown as VehiclesRepository;

  const recalcSpy = jest.fn(async () => undefined);
  const claimsService = {
    recalcFromDelegation: recalcSpy,
  } as unknown as ClaimsService;

  const carriers = {
    list: jest.fn(async () => [{ id: CARRIER_ID, userId: CARRIER_USER }]),
  } as unknown as CarriersRepository;

  const service = new DelegationsService(
    delegations,
    carriers,
    vehicles,
    {} as unknown as DriversRepository,
    {} as unknown as TrailersRepository,
    {} as unknown as CarrierReadinessService,
    {} as unknown as ChatNotifierService,
    claimsService,
  );
  return { service, updateSpy, vehicleUpdateSpy, vehicleFindSpy, recalcSpy };
}

// ─── markReady ───────────────────────────────────────────────

describe('DelegationsService.markReady', () => {
  const dto: MarkReadyDto = { rollback: false };

  it('flips zgloszony → gotowy', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'zgloszony' }) });
    const out = await service.markReady(auth('eksport'), 'deleg-1', dto);
    expect(out.status).toBe('gotowy');
    expect(updateSpy.mock.calls[0]![1]).toMatchObject({ status: 'gotowy' });
  });

  it('rollback gotowy → zgloszony is allowed (pre-w_trasie)', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'gotowy' }) });
    const out = await service.markReady(auth('eksport'), 'deleg-1', {
      rollback: true,
    });
    expect(out.status).toBe('zgloszony');
    expect(updateSpy.mock.calls[0]![1]).toMatchObject({ status: 'zgloszony' });
  });

  it('rollback after w_trasie is rejected (422) and writes nothing', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'w_trasie' }) });
    await expect(
      service.markReady(auth('eksport'), 'deleg-1', { rollback: true }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('flip from a non-zgloszony status is rejected (422)', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'w_trasie' }) });
    await expect(
      service.markReady(auth('eksport'), 'deleg-1', dto),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ─── markInTransit ───────────────────────────────────────────

describe('DelegationsService.markInTransit', () => {
  it('gotowy → w_trasie stamps verifiedBy/At', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'gotowy' }) });
    const out = await service.markInTransit(auth('weryfikator'), 'deleg-1', {});
    expect(out.status).toBe('w_trasie');
    const patch = updateSpy.mock.calls[0]![1];
    expect(patch.status).toBe('w_trasie');
    expect(patch.verifiedById).toBe('u-weryfikator');
    expect(patch.verifiedAt).toBeInstanceOf(Date);
  });

  it('rejects in-transit from zgloszony (must go through gotowy) — 422', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'zgloszony' }) });
    await expect(
      service.markInTransit(auth('weryfikator'), 'deleg-1', {}),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ─── markReturned ────────────────────────────────────────────

describe('DelegationsService.markReturned', () => {
  const dto: MarkReturnedDto = { actualReturnAt: '2026-06-07' };

  it('w_trasie → zjechal sets actualReturnAt + verifiedBy/At', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'w_trasie' }) });
    const out = await service.markReturned(auth('weryfikator'), 'deleg-1', dto);
    expect(out.status).toBe('zjechal');
    const patch = updateSpy.mock.calls[0]![1];
    expect(patch.status).toBe('zjechal');
    expect((patch.actualReturnAt as Date).toISOString()).toBe(
      '2026-06-07T00:00:00.000Z',
    );
    expect(patch.verifiedById).toBe('u-weryfikator');
  });

  it('advances lastDroveAt to actualReturnAt when it is newer', async () => {
    const { service, vehicleUpdateSpy } = build({
      row: makeRow({ status: 'w_trasie' }),
      vehicleLastDroveAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    await service.markReturned(auth('weryfikator'), 'deleg-1', dto);
    expect(vehicleUpdateSpy).toHaveBeenCalledTimes(1);
    expect(
      (vehicleUpdateSpy.mock.calls[0]![1].lastDroveAt as Date).toISOString(),
    ).toBe('2026-06-07T00:00:00.000Z');
  });

  it('does NOT move lastDroveAt backwards (max semantics)', async () => {
    const { service, vehicleUpdateSpy } = build({
      row: makeRow({ status: 'w_trasie' }),
      vehicleLastDroveAt: new Date('2026-06-20T00:00:00.000Z'),
    });
    await service.markReturned(auth('weryfikator'), 'deleg-1', dto);
    // 2026-06-07 < 2026-06-20 → no bump.
    expect(vehicleUpdateSpy).not.toHaveBeenCalled();
  });

  it('sets lastDroveAt when it was null', async () => {
    const { service, vehicleUpdateSpy } = build({
      row: makeRow({ status: 'w_trasie' }),
      vehicleLastDroveAt: null,
    });
    await service.markReturned(auth('weryfikator'), 'deleg-1', dto);
    expect(vehicleUpdateSpy).toHaveBeenCalledTimes(1);
  });

  it('calls the claims auto-recalc with (delegationId, actualReturnAt)', async () => {
    const { service, recalcSpy } = build({ row: makeRow({ status: 'w_trasie' }) });
    await service.markReturned(auth('weryfikator'), 'deleg-1', dto);
    expect(recalcSpy).toHaveBeenCalledTimes(1);
    const [delegationId, actualReturnAt] = recalcSpy.mock.calls[0]!;
    expect(delegationId).toBe('deleg-1');
    expect((actualReturnAt as Date).toISOString()).toBe(
      '2026-06-07T00:00:00.000Z',
    );
  });

  it('rejects returned from gotowy (must go through w_trasie) — 422', async () => {
    const { service, updateSpy, recalcSpy } = build({
      row: makeRow({ status: 'gotowy' }),
    });
    await expect(
      service.markReturned(auth('weryfikator'), 'deleg-1', dto),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(recalcSpy).not.toHaveBeenCalled();
  });
});

// ─── cancel ──────────────────────────────────────────────────

describe('DelegationsService.cancel — admin (Phase 7 REWORK)', () => {
  const dto: CancelDelegationDto = { reason: 'rejs sorvался' };

  it.each(['zgloszony', 'gotowy', 'w_trasie'] as const)(
    'admin anulates any active status (%s)',
    async (status) => {
      const { service, updateSpy } = build({ row: makeRow({ status }) });
      const out = await service.cancel(auth('admin'), 'deleg-1', dto);
      expect(out.status).toBe('anulowany');
      expect(updateSpy.mock.calls[0]![1]).toMatchObject({
        status: 'anulowany',
      });
    },
  );

  it.each(['zjechal', 'anulowany'] as const)(
    'admin cannot anulate a terminal status (%s) — 409',
    async (status) => {
      const { service, updateSpy } = build({ row: makeRow({ status }) });
      await expect(
        service.cancel(auth('admin'), 'deleg-1', dto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(updateSpy).not.toHaveBeenCalled();
    },
  );
});

describe('DelegationsService.cancel — carrier (unchanged)', () => {
  const dto: CancelDelegationDto = {};

  it('carrier anulates their OWN zgloszony', async () => {
    const { service, updateSpy } = build({
      row: makeRow({ status: 'zgloszony', carrierId: CARRIER_ID }),
    });
    const out = await service.cancel(
      auth('przewoznik', CARRIER_USER),
      'deleg-1',
      dto,
    );
    expect(out.status).toBe('anulowany');
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it("carrier cannot cancel a non-zgloszony status (gotowy) — 409", async () => {
    const { service, updateSpy } = build({
      row: makeRow({ status: 'gotowy', carrierId: CARRIER_ID }),
    });
    await expect(
      service.cancel(auth('przewoznik', CARRIER_USER), 'deleg-1', dto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("carrier cannot cancel another carrier's outing — 403", async () => {
    const { service, updateSpy } = build({
      row: makeRow({ status: 'zgloszony', carrierId: 'other-carrier' }),
    });
    await expect(
      service.cancel(auth('przewoznik', CARRIER_USER), 'deleg-1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
