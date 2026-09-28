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
const TEAM_ID = 'team-1';
const PLANNER_SUB = 'plan-1';
const CARRIER_ID = 'carrier-1';
const CARRIER_USER = 'user-1';
const OPIEKUN_SUB = 'op-1';
// Carrier NOT supervised by OPIEKUN_SUB — used for the opiekun 403 lanes.
const FOREIGN_CARRIER_ID = 'carrier-foreign';
// Km-guarantee rates baseline for the vehicle mini (EUR/km). Distinct values so
// a scrub-vs-passthrough assertion can pin each lane.
const RATE_DE = 1.05;
const RATE_UE = 1.15;
const RATE_EXPORT = 1.25;
const RATE_IMPORT = 1.35;

function auth(
  role: AuthUser['role'],
  sub: string,
  teamId: string | null = TEAM_ID,
): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
    mustChangePassword: false,
    teamId,
  };
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
      // Guarantee flag (Porozumienie) carried on the vehicle mini since the
      // claims guarantee gate. `null` baseline — scope tests don't depend on it.
      agreement: null,
      // Km-guarantee rates on the vehicle mini — non-null baseline so the
      // dedicated rates-scrub suite below can assert both the pass-through
      // (non-dyspozytor) and the dyspozytor nulling.
      rateDe: RATE_DE,
      rateUe: RATE_UE,
      rateExport: RATE_EXPORT,
      rateImport: RATE_IMPORT,
      plannerId: PLANNER_SUB,
      dispatchTeamId: TEAM_ID,
      // Phase 11 Шаг D — live dispatch team on the vehicle mini. `null` is the
      // baseline case (unassigned); the dedicated mapper test below exercises a
      // populated team.
      dispatchTeam: null,
      planner: null,
    },
    // docs/29 — the trip's own planista snapshot drives the planista scope.
    plannerId: PLANNER_SUB,
    planner: null,
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
    actualDepartureAt: null,
    actualReturnAt: null,
    reportedById: 'user-x',
    reportedBy: { id: 'user-x', login: 'pwz', name: 'Pwz' },
    reportedAt: new Date('2026-05-19T08:00:00.000Z'),
    verifiedById: null,
    verifiedBy: null,
    verifiedAt: null,
    readyById: null,
    readyBy: null,
    readyAt: null,
    spedOrderNumber: null,
    notes: null,
    claimId: null,
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
function makeService(
  returned: DelegationRow[] = [makeRow()],
  /**
   * Carriers supervised by the opiekun caller — backs the
   * `CarriersRepository.listIdsForOpiekun` fake the opiekun scope branch
   * consults (list: only when a `carrierId` is pinned; getOne: always).
   */
  ownedCarrierIds: string[] = [CARRIER_ID],
) {
  const listSpy = jest.fn(async (_filters: DelegationListFilters) => returned);
  const findByIdSpy = jest.fn(async (_id: string) => returned[0] ?? null);
  const delegations = {
    list: listSpy,
    findById: findByIdSpy,
  } as unknown as DelegationsRepository;

  const listIdsForOpiekunSpy = jest.fn(
    async (_opiekunId: string) => ownedCarrierIds,
  );
  const carriers = {
    list: jest.fn(async () => [{ id: CARRIER_ID, userId: CARRIER_USER }]),
    listIdsForOpiekun: listIdsForOpiekunSpy,
  } as unknown as CarriersRepository;

  const service = new DelegationsService(
    delegations,
    carriers,
    {} as unknown as VehiclesRepository,
    {} as unknown as DriversRepository,
    {} as unknown as TrailersRepository,
    {} as unknown as CarrierReadinessService,
  );
  return { service, listSpy, findByIdSpy, listIdsForOpiekunSpy };
}

describe('DelegationsService.list — dyspozytor auto-scope (Phase 11 — team)', () => {
  it('scopes to dispatchTeamId=user.teamId (relation filter), not the all-access branch', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('dyspozytor', DISPATCHER_SUB), baseFilters());
    expect(listSpy).toHaveBeenCalledTimes(1);
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.dispatchTeamId).toBe(TEAM_ID);
  });

  it('a dyspozytor with NO team passes the sentinel (0 rows, never "all")', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('dyspozytor', DISPATCHER_SUB, null), baseFilters());
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    // Sentinel id → no real team matches → empty result; never the all branch.
    expect(passed.dispatchTeamId).toBe('__no_dispatch_team__');
  });

  it('IGNORES a client-supplied carrierId (server identity wins)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('dyspozytor', DISPATCHER_SUB),
      baseFilters({ carrierId: 'someone-elses-carrier' }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.dispatchTeamId).toBe(TEAM_ID);
    expect(passed.carrierId).toBeUndefined();
  });

  it('IGNORES a client-supplied vehicleId (server identity wins)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('dyspozytor', DISPATCHER_SUB),
      baseFilters({ vehicleId: 'someone-elses-vehicle' }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.dispatchTeamId).toBe(TEAM_ID);
    expect(passed.vehicleId).toBeUndefined();
  });

  it('preserves non-scope filters (status / from / limit) alongside the team scope', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('dyspozytor', DISPATCHER_SUB),
      baseFilters({ status: 'w_trasie', from: '2026-05-01T00:00:00.000Z', limit: 25 }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed).toMatchObject({
      dispatchTeamId: TEAM_ID,
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
    // Planista must NOT receive a team scope (different axis).
    expect(passed.dispatchTeamId).toBeUndefined();
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

// docs/03-roles.md#opiekun — «Что НЕ может: действовать на перевозчиках с
// другим `opiekunId` (403)». The opiekun «Wszystkie wyjazdy» page hits
// `GET /delegations` with NO `carrierId`, so the scope MUST come from the
// server identity, not the query.
describe('DelegationsService.list — opiekun carrier scope', () => {
  it('scopes to carrierOpiekunId=user.sub (relation filter), NOT the all-access branch', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('opiekun', OPIEKUN_SUB), baseFilters());
    expect(listSpy).toHaveBeenCalledTimes(1);
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.carrierOpiekunId).toBe(OPIEKUN_SUB);
    // Different axis — opiekun must not pick up the vehicle-side scopes.
    expect(passed.plannerId).toBeUndefined();
    expect(passed.dispatchTeamId).toBeUndefined();
  });

  it('no carrierId pinned → no ownership lookup needed (relation filter carries the scope)', async () => {
    const { service, listIdsForOpiekunSpy } = makeService();
    await service.list(auth('opiekun', OPIEKUN_SUB), baseFilters());
    expect(listIdsForOpiekunSpy).not.toHaveBeenCalled();
  });

  it('keeps a carrierId pin for one of THEIR OWN carriers (narrowing is allowed)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('opiekun', OPIEKUN_SUB),
      baseFilters({ carrierId: CARRIER_ID }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.carrierId).toBe(CARRIER_ID);
    // The server scope is applied ANYWAY (defence-in-depth).
    expect(passed.carrierOpiekunId).toBe(OPIEKUN_SUB);
  });

  it("is 403 on a FOREIGN carrierId (another opiekun's carrier)", async () => {
    const { service, listSpy } = makeService();
    await expect(
      service.list(
        auth('opiekun', OPIEKUN_SUB),
        baseFilters({ carrierId: FOREIGN_CARRIER_ID }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('an opiekun with NO carriers gets an empty scope, never "all"', async () => {
    const { service, listSpy } = makeService([], []);
    const out = await service.list(auth('opiekun', OPIEKUN_SUB), baseFilters());
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    // The relation filter still pins the opiekun id → matches nothing.
    expect(passed.carrierOpiekunId).toBe(OPIEKUN_SUB);
    expect(out.items).toEqual([]);
  });

  it('never gets a status floor and preserves non-scope filters', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('opiekun', OPIEKUN_SUB),
      baseFilters({ status: 'zjechal', from: '2026-05-01T00:00:00.000Z', limit: 25 }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed).toMatchObject({
      carrierOpiekunId: OPIEKUN_SUB,
      status: 'zjechal',
      from: '2026-05-01T00:00:00.000Z',
      limit: 25,
    });
    expect(passed.statusIn).toBeUndefined();
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
    expect(passed.dispatchTeamId).toBeUndefined();
    expect(passed.plannerId).toBeUndefined();
    expect(passed.carrierId).toBe('any-carrier');
  });

  it('eksport keeps full access (no ownership scope injected)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('eksport', 'eksport-1'),
      baseFilters({ carrierId: 'any-carrier' }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.plannerId).toBeUndefined();
    expect(passed.dispatchTeamId).toBeUndefined();
    expect(passed.carrierOpiekunId).toBeUndefined();
    expect(passed.carrierId).toBe('any-carrier');
  });

  it('weryfikator sees the ACTIVE board (REWORK 2026-06-20 #4 — back on delegations, like eksport)', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('weryfikator', 'wer-1'), baseFilters());
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    // Active-status floor injected (default, history OFF): {zgloszony, gotowy,
    // w_trasie}. No ownership scope (all-access like eksport).
    expect(passed.statusIn).toEqual(['zgloszony', 'gotowy', 'w_trasie']);
    expect(passed.dispatchTeamId).toBeUndefined();
    expect(passed.plannerId).toBeUndefined();
  });

  it('weryfikator with includeHistory=true widens to all statuses (no floor)', async () => {
    const { service, listSpy } = makeService();
    await service.list(
      auth('weryfikator', 'wer-1'),
      baseFilters({ includeHistory: true }),
    );
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.statusIn).toBeUndefined();
  });

  it('przewoznik is still scoped to its own carrierId', async () => {
    const { service, listSpy } = makeService();
    await service.list(auth('przewoznik', CARRIER_USER), baseFilters());
    const passed = listSpy.mock.calls[0]![0] as DelegationListFilters;
    expect(passed.carrierId).toBe(CARRIER_ID);
    expect(passed.dispatchTeamId).toBeUndefined();
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
        agreement: null,
        rateDe: RATE_DE,
        rateUe: RATE_UE,
        rateExport: RATE_EXPORT,
        rateImport: RATE_IMPORT,
        plannerId: PLANNER_SUB,
        dispatchTeamId: 'other-team',
        dispatchTeam: null,
        planner: null,
      },
    });
    const { service } = makeService([row]);
    const out = await service.getOne(auth('planista', PLANNER_SUB), 'deleg-1');
    expect(out.id).toBe('deleg-1');
  });

  it("planista is 403 on another planner's delegation", async () => {
    // docs/29 — the trip's own snapshot is what counts: led by someone else.
    const row = makeRow({
      plannerId: 'someone-else',
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        agreement: null,
        rateDe: RATE_DE,
        rateUe: RATE_UE,
        rateExport: RATE_EXPORT,
        rateImport: RATE_IMPORT,
        plannerId: 'someone-else',
        dispatchTeamId: TEAM_ID,
        dispatchTeam: null,
        planner: null,
      },
    });
    const { service } = makeService([row]);
    await expect(
      service.getOne(auth('planista', PLANNER_SUB), 'deleg-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ── docs/29 — the planista scope reads the trip's SNAPSHOT, not the vehicle ──

  it('planista who LED the trip may still read it after the vehicle moved to another planista', async () => {
    // Transfer approved after the trip left (`w_trasie` stays with the old
    // planista — R6): the vehicle now belongs to 'new-plan', the snapshot
    // still names PLANNER_SUB.
    const row = makeRow({
      status: 'w_trasie',
      plannerId: PLANNER_SUB,
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        agreement: null,
        rateDe: RATE_DE,
        rateUe: RATE_UE,
        rateExport: RATE_EXPORT,
        rateImport: RATE_IMPORT,
        plannerId: 'new-plan',
        dispatchTeamId: TEAM_ID,
        dispatchTeam: null,
        planner: { id: 'new-plan', login: 'new.plan', name: 'New Plan' },
      },
    });
    const { service } = makeService([row]);
    const out = await service.getOne(auth('planista', PLANNER_SUB), 'deleg-1');
    expect(out.id).toBe('deleg-1');
    // The DTO carries both: the trip's planista and the vehicle's current one.
    expect(out.plannerId).toBe(PLANNER_SUB);
    expect(out.vehicle?.planner?.id).toBe('new-plan');
  });

  it('the NEW planista may not read a trip that stayed with the previous planista', async () => {
    const row = makeRow({
      status: 'zjechal',
      plannerId: 'old-plan',
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        agreement: null,
        rateDe: RATE_DE,
        rateUe: RATE_UE,
        rateExport: RATE_EXPORT,
        rateImport: RATE_IMPORT,
        plannerId: PLANNER_SUB,
        dispatchTeamId: TEAM_ID,
        dispatchTeam: null,
        planner: null,
      },
    });
    const { service } = makeService([row]);
    await expect(
      service.getOne(auth('planista', PLANNER_SUB), 'deleg-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('dyspozytor may read a delegation of a vehicle on their team (Phase 11)', async () => {
    const row = makeRow({
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        agreement: null,
        rateDe: RATE_DE,
        rateUe: RATE_UE,
        rateExport: RATE_EXPORT,
        rateImport: RATE_IMPORT,
        plannerId: 'other-plan',
        dispatchTeamId: TEAM_ID,
        dispatchTeam: null,
        planner: null,
      },
    });
    const { service } = makeService([row]);
    const out = await service.getOne(
      auth('dyspozytor', DISPATCHER_SUB, TEAM_ID),
      'deleg-1',
    );
    expect(out.id).toBe('deleg-1');
  });

  it("dyspozytor is 403 on another team's delegation (Phase 11)", async () => {
    const row = makeRow({
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        agreement: null,
        rateDe: RATE_DE,
        rateUe: RATE_UE,
        rateExport: RATE_EXPORT,
        rateImport: RATE_IMPORT,
        plannerId: PLANNER_SUB,
        dispatchTeamId: 'some-other-team',
        dispatchTeam: null,
        planner: null,
      },
    });
    const { service } = makeService([row]);
    await expect(
      service.getOne(auth('dyspozytor', DISPATCHER_SUB, TEAM_ID), 'deleg-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('dyspozytor with NO team is 403 even on a team delegation (Phase 11)', async () => {
    const row = makeRow({
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        agreement: null,
        rateDe: RATE_DE,
        rateUe: RATE_UE,
        rateExport: RATE_EXPORT,
        rateImport: RATE_IMPORT,
        plannerId: PLANNER_SUB,
        dispatchTeamId: TEAM_ID,
        dispatchTeam: null,
        planner: null,
      },
    });
    const { service } = makeService([row]);
    await expect(
      service.getOne(auth('dyspozytor', DISPATCHER_SUB, null), 'deleg-1'),
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

  it('opiekun may read a delegation of a carrier they supervise', async () => {
    const row = makeRow({ carrierId: CARRIER_ID });
    const { service } = makeService([row], [CARRIER_ID]);
    const out = await service.getOne(auth('opiekun', OPIEKUN_SUB), 'deleg-1');
    expect(out.id).toBe('deleg-1');
  });

  it("opiekun is 403 on another opiekun's carrier delegation", async () => {
    const row = makeRow({ carrierId: FOREIGN_CARRIER_ID });
    const { service } = makeService([row], [CARRIER_ID]);
    await expect(
      service.getOne(auth('opiekun', OPIEKUN_SUB), 'deleg-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('opiekun with NO carriers is 403 on any delegation (never "all")', async () => {
    const row = makeRow({ carrierId: CARRIER_ID });
    const { service } = makeService([row], []);
    await expect(
      service.getOne(auth('opiekun', OPIEKUN_SUB), 'deleg-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['admin', 'eksport'] as const)(
    'all-access role=%s may read any delegation by id',
    async (role) => {
      const row = makeRow({
        carrierId: 'any-carrier',
        vehicle: {
          id: 'veh-1',
          plateNumber: 'PL123',
          agreement: null,
          rateDe: RATE_DE,
          rateUe: RATE_UE,
          rateExport: RATE_EXPORT,
          rateImport: RATE_IMPORT,
          plannerId: 'p-x',
          dispatchTeamId: 'team-x',
          dispatchTeam: null,
          planner: null,
        },
      });
      const { service } = makeService([row]);
      const out = await service.getOne(auth(role, `${role}-1`), 'deleg-1');
      expect(out.id).toBe('deleg-1');
    },
  );
});

// Phase 11 Шаг D (additive) — the vehicle mini now carries the LIVE dispatch
// team so the «ZESPÓŁ PROWADZĄCY» block in DelegationDetailModal renders. The
// shape must be byte-identical to the one VehicleDto/VehicleListItem emit.
describe('DelegationsService.getOne — vehicle.dispatchTeam (live, additive)', () => {
  it('surfaces the populated dispatch team with its dispatcher roster', async () => {
    const row = makeRow({
      vehicle: {
        id: 'veh-1',
        plateNumber: 'PL123',
        agreement: null,
        rateDe: RATE_DE,
        rateUe: RATE_UE,
        rateExport: RATE_EXPORT,
        rateImport: RATE_IMPORT,
        plannerId: 'p-x',
        dispatchTeamId: 'team-99',
        dispatchTeam: {
          id: 'team-99',
          code: '1.1.13',
          name: 'Zespół Nocny',
          active: true,
          dispatchers: [
            { id: 'dys-a', name: 'Anna', login: 'anna' },
            { id: 'dys-b', name: null, login: 'bartek' },
          ],
        },
        // Lead forwarder rides the same vehicle mini (full-crew ZESPÓŁ block).
        planner: { id: 'p-x', login: 'planner.x', name: 'Planner X' },
      },
    });
    const { service } = makeService([row]);
    const out = await service.getOne(auth('admin', 'admin-1'), 'deleg-1');
    expect(out.vehicle?.dispatchTeam).toEqual({
      id: 'team-99',
      code: '1.1.13',
      name: 'Zespół Nocny',
      active: true,
      dispatchers: [
        { id: 'dys-a', name: 'Anna', login: 'anna' },
        { id: 'dys-b', name: null, login: 'bartek' },
      ],
    });
    expect(out.vehicle?.planner).toEqual({
      id: 'p-x',
      login: 'planner.x',
      name: 'Planner X',
    });
  });

  it('emits dispatchTeam=null when the vehicle is unassigned', async () => {
    const { service } = makeService([makeRow()]);
    const out = await service.getOne(auth('admin', 'admin-1'), 'deleg-1');
    // `makeRow` builds an unassigned vehicle by default.
    expect(out.vehicle?.dispatchTeam).toBeNull();
  });
});

// «Stawki» block — the four km-guarantee rates ride the vehicle mini and are
// SENSITIVE: every delegation-reading role sees them EXCEPT `dyspozytor`, which
// is scrubbed to `null` SERVER-SIDE (docs/14-design-system.md §6.4.2 / §6.15).
// The baseline `makeRow` carries non-null rates (RATE_*).
describe('DelegationsService — vehicle mini rate scrub (§6.4.2 / §6.15)', () => {
  it('getOne: a non-dyspozytor (eksport, all-access) receives the numeric rates', async () => {
    const { service } = makeService([makeRow()]);
    const out = await service.getOne(auth('eksport', 'eksport-1'), 'deleg-1');
    expect(out.vehicle?.rateDe).toBe(RATE_DE);
    expect(out.vehicle?.rateUe).toBe(RATE_UE);
    expect(out.vehicle?.rateExport).toBe(RATE_EXPORT);
    expect(out.vehicle?.rateImport).toBe(RATE_IMPORT);
  });

  it('getOne: a planista (rates-visible since 2026-06-26) receives the numeric rates', async () => {
    // `makeRow` pins `plannerId=PLANNER_SUB` → the planista read-scope passes.
    const { service } = makeService([makeRow()]);
    const out = await service.getOne(auth('planista', PLANNER_SUB), 'deleg-1');
    expect(out.vehicle?.rateDe).toBe(RATE_DE);
    expect(out.vehicle?.rateImport).toBe(RATE_IMPORT);
  });

  it('getOne: a dyspozytor gets ALL four rates scrubbed to null (other fields intact)', async () => {
    // `makeRow` pins `dispatchTeamId=TEAM_ID` → the dyspozytor read-scope passes,
    // so we reach `toDto` and can observe the scrub (not a 403).
    const { service } = makeService([makeRow()]);
    const out = await service.getOne(
      auth('dyspozytor', DISPATCHER_SUB, TEAM_ID),
      'deleg-1',
    );
    expect(out.vehicle?.rateDe).toBeNull();
    expect(out.vehicle?.rateUe).toBeNull();
    expect(out.vehicle?.rateExport).toBeNull();
    expect(out.vehicle?.rateImport).toBeNull();
    // Non-rate identity fields are NOT touched by the scrub.
    expect(out.vehicle?.plateNumber).toBe('PL123');
    expect(out.vehicle?.agreement).toBeNull();
  });

  it('list: a non-dyspozytor (eksport) receives the numeric rates on each item', async () => {
    const { service } = makeService([makeRow()]);
    const { items } = await service.list(auth('eksport', 'eksport-1'), baseFilters());
    expect(items[0]!.vehicle?.rateDe).toBe(RATE_DE);
    expect(items[0]!.vehicle?.rateExport).toBe(RATE_EXPORT);
  });

  it('list: a dyspozytor gets the rates scrubbed to null on each item', async () => {
    const { service } = makeService([makeRow()]);
    const { items } = await service.list(
      auth('dyspozytor', DISPATCHER_SUB, TEAM_ID),
      baseFilters(),
    );
    expect(items[0]!.vehicle?.rateDe).toBeNull();
    expect(items[0]!.vehicle?.rateUe).toBeNull();
    expect(items[0]!.vehicle?.rateExport).toBeNull();
    expect(items[0]!.vehicle?.rateImport).toBeNull();
  });
});
