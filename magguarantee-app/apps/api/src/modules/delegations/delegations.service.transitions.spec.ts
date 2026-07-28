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

import {
  MarkReadySchema,
  type CancelDelegationDto,
  type MarkInTransitDto,
  type MarkReadyDto,
  type MarkReturnedDto,
} from '@magguarantee/shared';

import type { ClaimsService } from '../claims/claims.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
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
      // Porozumienie flag carried on the vehicle mini (claims guarantee gate);
      // transitions tests don't depend on it → `null` baseline.
      agreement: null,
      // Km-guarantee rates on the mini (Decimal→number). Non-null baseline so
      // the transitions tests exercise the real values passing through toDto;
      // the dedicated rates-scrub spec covers the dyspozytor nulling.
      rateDe: 1.1,
      rateUe: 1.2,
      rateExport: 1.3,
      rateImport: 1.4,
      plannerId: null,
      dispatchTeamId: null,
      dispatchTeam: null,
      planner: null,
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
    actualDepartureAt: null,
    actualReturnAt: null,
    reportedById: null,
    reportedBy: null,
    reportedAt: new Date('2026-05-31T08:00:00.000Z'),
    verifiedById: null,
    verifiedBy: null,
    verifiedAt: null,
    readyById: null,
    readyBy: null,
    readyAt: null,
    spedOrderNumber: null,
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
  recalcDepartureSpy: jest.Mock;
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
  const recalcDepartureSpy = jest.fn(async () => undefined);
  const claimsService = {
    recalcFromDelegation: recalcSpy,
    recalcDepartureFromDelegation: recalcDepartureSpy,
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
    claimsService,
  );
  return {
    service,
    updateSpy,
    vehicleUpdateSpy,
    vehicleFindSpy,
    recalcSpy,
    recalcDepartureSpy,
  };
}

// ─── markReady ───────────────────────────────────────────────

describe('DelegationsService.markReady', () => {
  // Forward flip now carries the mandatory "Nr zlecenia ze spedu".
  const dto: MarkReadyDto = { rollback: false, spedOrderNumber: 'SPED-123' };

  it('flips zgloszony → gotowy', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'zgloszony' }) });
    const out = await service.markReady(auth('eksport'), 'deleg-1', dto);
    expect(out.status).toBe('gotowy');
    expect(updateSpy.mock.calls[0]![1]).toMatchObject({ status: 'gotowy' });
  });

  it('forward flip persists spedOrderNumber + stamps readyBy/At', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'zgloszony' }) });
    const out = await service.markReady(auth('eksport'), 'deleg-1', dto);
    const patch = updateSpy.mock.calls[0]![1];
    expect(patch.spedOrderNumber).toBe('SPED-123');
    expect(patch.readyById).toBe('u-eksport');
    expect(patch.readyAt).toBeInstanceOf(Date);
    // …and it round-trips onto the wire DTO.
    expect(out.spedOrderNumber).toBe('SPED-123');
  });

  it('rollback gotowy → zgloszony is allowed (pre-w_trasie)', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'gotowy' }) });
    const out = await service.markReady(auth('eksport'), 'deleg-1', {
      rollback: true,
    });
    expect(out.status).toBe('zgloszony');
    expect(updateSpy.mock.calls[0]![1]).toMatchObject({ status: 'zgloszony' });
  });

  it('rollback CLEARS spedOrderNumber (fresh number required to re-advance)', async () => {
    const { service, updateSpy } = build({
      row: makeRow({ status: 'gotowy', spedOrderNumber: 'SPED-OLD' }),
    });
    const out = await service.markReady(auth('eksport'), 'deleg-1', {
      rollback: true,
    });
    const patch = updateSpy.mock.calls[0]![1];
    expect(patch.spedOrderNumber).toBeNull();
    // …and it does NOT re-stamp readyBy on the rollback branch.
    expect(patch.readyById).toBeUndefined();
    expect(out.spedOrderNumber).toBeNull();
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

// ─── MarkReadySchema (Zod cross-field: sped order number) ─────

describe('MarkReadySchema — spedOrderNumber requirement', () => {
  it('rejects a forward flip WITHOUT spedOrderNumber (issue on spedOrderNumber)', () => {
    const res = MarkReadySchema.safeParse({ rollback: false });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'spedOrderNumber')).toBe(
        true,
      );
    }
  });

  it('rejects a forward flip with a blank spedOrderNumber (trim → empty)', () => {
    const res = MarkReadySchema.safeParse({
      rollback: false,
      spedOrderNumber: '   ',
    });
    expect(res.success).toBe(false);
  });

  it('accepts a forward flip WITH a spedOrderNumber (and trims it)', () => {
    const res = MarkReadySchema.safeParse({
      rollback: false,
      spedOrderNumber: '  SPED-77 ',
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.spedOrderNumber).toBe('SPED-77');
  });

  it('accepts a rollback WITHOUT spedOrderNumber (not required on rollback)', () => {
    const res = MarkReadySchema.safeParse({ rollback: true });
    expect(res.success).toBe(true);
  });

  it('defaults rollback→false and thus still requires spedOrderNumber', () => {
    const res = MarkReadySchema.safeParse({});
    expect(res.success).toBe(false);
  });
});

// ─── markInTransit ───────────────────────────────────────────

describe('DelegationsService.markInTransit', () => {
  // The baseline row departs 2026-06-01; a valid actual-departure is on/after
  // that day and not in the future. `2026-06-03` is safely in the past relative
  // to the fixed test-clock era (the future check reads the real system clock,
  // so we keep the valid fixture well behind any plausible run date).
  const dto: MarkInTransitDto = { actualDepartureAt: '2026-06-03' };

  it('gotowy → w_trasie persists actualDepartureAt + stamps verifiedBy/At', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'gotowy' }) });
    const out = await service.markInTransit(auth('weryfikator'), 'deleg-1', dto);
    expect(out.status).toBe('w_trasie');
    const patch = updateSpy.mock.calls[0]![1];
    expect(patch.status).toBe('w_trasie');
    expect((patch.actualDepartureAt as Date).toISOString()).toBe(
      '2026-06-03T00:00:00.000Z',
    );
    expect(patch.verifiedById).toBe('u-weryfikator');
    expect(patch.verifiedAt).toBeInstanceOf(Date);
  });

  it('surfaces actualDepartureAt on the returned DTO', async () => {
    const { service } = build({ row: makeRow({ status: 'gotowy' }) });
    const out = await service.markInTransit(auth('weryfikator'), 'deleg-1', dto);
    expect(out.actualDepartureAt).toBe('2026-06-03T00:00:00.000Z');
  });

  it('stores the FULL actualDepartureAt datetime verbatim (no midnight normalisation)', async () => {
    // The weryfikator now captures the exact moment — the wall-clock time must
    // survive (the linked wniosek derives `timeFrom` from it).
    const { service, updateSpy } = build({ row: makeRow({ status: 'gotowy' }) });
    const out = await service.markInTransit(auth('weryfikator'), 'deleg-1', {
      actualDepartureAt: '2026-06-03T14:20:00.000Z',
    });
    expect(out.status).toBe('w_trasie');
    const patch = updateSpy.mock.calls[0]![1];
    expect((patch.actualDepartureAt as Date).toISOString()).toBe(
      '2026-06-03T14:20:00.000Z',
    );
    // …and it round-trips onto the wire DTO with the time preserved.
    expect(out.actualDepartureAt).toBe('2026-06-03T14:20:00.000Z');
  });

  it('an actual-departure on the reported departure DAY is allowed (>= boundary)', async () => {
    // departureAt is 2026-06-01T08:00Z; a same-DAY actual departure (00:00Z)
    // must pass the not-before-departureAt gate (UTC-day granularity).
    const { service, updateSpy } = build({ row: makeRow({ status: 'gotowy' }) });
    const out = await service.markInTransit(auth('weryfikator'), 'deleg-1', {
      actualDepartureAt: '2026-06-01',
    });
    expect(out.status).toBe('w_trasie');
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects a FUTURE actual-departure (422, DEPARTURE_DATE_FUTURE) — writes nothing', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'gotowy' }) });
    let thrown: unknown;
    try {
      await service.markInTransit(auth('weryfikator'), 'deleg-1', {
        actualDepartureAt: '2999-01-01',
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect((thrown as UnprocessableEntityException).getResponse()).toMatchObject(
      { extensions: { code: 'DEPARTURE_DATE_FUTURE' } },
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('rejects an actual-departure BEFORE the reported departureAt (422, DEPARTURE_BEFORE_REPORTED) — writes nothing', async () => {
    // departureAt is 2026-06-01; 2026-05-31 is one day earlier → hard 422.
    const { service, updateSpy } = build({ row: makeRow({ status: 'gotowy' }) });
    let thrown: unknown;
    try {
      await service.markInTransit(auth('weryfikator'), 'deleg-1', {
        actualDepartureAt: '2026-05-31',
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect((thrown as UnprocessableEntityException).getResponse()).toMatchObject(
      { extensions: { code: 'DEPARTURE_BEFORE_REPORTED' } },
    );
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('recalcs the linked wniosek with (delegationId, actualDepartureAt)', async () => {
    const { service, recalcDepartureSpy } = build({
      row: makeRow({ status: 'gotowy' }),
    });
    await service.markInTransit(auth('weryfikator'), 'deleg-1', dto);
    expect(recalcDepartureSpy).toHaveBeenCalledTimes(1);
    const [delegationId, actualDepartureAt] =
      recalcDepartureSpy.mock.calls[0]!;
    expect(delegationId).toBe('deleg-1');
    expect((actualDepartureAt as Date).toISOString()).toBe(
      '2026-06-03T00:00:00.000Z',
    );
  });

  it('does NOT bump Vehicle.lastDroveAt (that is the return-flow signal)', async () => {
    const { service, vehicleUpdateSpy } = build({
      row: makeRow({ status: 'gotowy' }),
      vehicleLastDroveAt: null,
    });
    await service.markInTransit(auth('weryfikator'), 'deleg-1', dto);
    expect(vehicleUpdateSpy).not.toHaveBeenCalled();
  });

  it('rejects in-transit from zgloszony (must go through gotowy) — 422', async () => {
    const { service, updateSpy } = build({ row: makeRow({ status: 'zgloszony' }) });
    await expect(
      service.markInTransit(auth('weryfikator'), 'deleg-1', dto),
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

  it('stores the FULL actualReturnAt datetime verbatim (no midnight normalisation)', async () => {
    // The weryfikator captures the exact return moment — the wall-clock time
    // must survive (the linked wniosek derives `timeTo` from it).
    const { service, updateSpy } = build({ row: makeRow({ status: 'w_trasie' }) });
    const out = await service.markReturned(auth('weryfikator'), 'deleg-1', {
      actualReturnAt: '2026-06-07T16:45:00.000Z',
    });
    const patch = updateSpy.mock.calls[0]![1];
    expect((patch.actualReturnAt as Date).toISOString()).toBe(
      '2026-06-07T16:45:00.000Z',
    );
    expect(out.actualReturnAt).toBe('2026-06-07T16:45:00.000Z');
  });

  it('rejects a FUTURE actualReturnAt (422 RETURN_DATE_FUTURE) — writes nothing', async () => {
    const { service, updateSpy, recalcSpy } = build({
      row: makeRow({ status: 'w_trasie' }),
    });
    let thrown: unknown;
    try {
      await service.markReturned(auth('weryfikator'), 'deleg-1', {
        actualReturnAt: '2999-01-01T00:00:00.000Z',
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect((thrown as UnprocessableEntityException).getResponse()).toMatchObject(
      { extensions: { code: 'RETURN_DATE_FUTURE' } },
    );
    expect(updateSpy).not.toHaveBeenCalled();
    expect(recalcSpy).not.toHaveBeenCalled();
  });

  it('rejects an actualReturnAt BEFORE the actual departure (422 RETURN_BEFORE_DEPARTURE) — writes nothing', async () => {
    // Outing left 2026-06-05T10:00; a return at 08:00 the same day is impossible.
    const { service, updateSpy, recalcSpy } = build({
      row: makeRow({
        status: 'w_trasie',
        actualDepartureAt: new Date('2026-06-05T10:00:00.000Z'),
      }),
    });
    let thrown: unknown;
    try {
      await service.markReturned(auth('weryfikator'), 'deleg-1', {
        actualReturnAt: '2026-06-05T08:00:00.000Z',
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(UnprocessableEntityException);
    expect((thrown as UnprocessableEntityException).getResponse()).toMatchObject(
      { extensions: { code: 'RETURN_BEFORE_DEPARTURE' } },
    );
    expect(updateSpy).not.toHaveBeenCalled();
    expect(recalcSpy).not.toHaveBeenCalled();
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
