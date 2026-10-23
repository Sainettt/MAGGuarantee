import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import {
  CarriersRepository,
  type OpiekunAggregateCarrierRow,
} from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import {
  VehicleDelegationStatusRepository,
  type VehicleDelegationStatus,
} from '../vehicles/vehicle-delegation-status.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import { FleetService } from './fleet.service';
import { makeAuthUser } from '../../common/testing/make-auth-user';

// Anchor "now" — the delegation-driven lifecycle classifier counts CALENDAR
// days (Europe/Warsaw) from the idle anchor to this Warsaw "today"
// (2026-05-27). Buckets are driven by a controlled delegation-status stub and
// per-vehicle `createdAt` (fallback anchor for a never-returned truck).
const NOW = new Date('2026-05-27T12:00:00.000Z');

/** `YYYY-MM-DD` → UTC-midnight Date (date-only convention for `lastReturnAt`). */
function U(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, d as number));
}

/** Zeroed per-carrier vehicle stats (new delegation-driven shape). */
const ZERO_VEHICLE_STATS = {
  aktywne: 0,
  stojace: 0,
  nieaktywne: 0,
  doUsuniecia: 0,
  wylaczone: 0,
  potencjalne: 0,
  total: 0,
};

/** One aggregate-row vehicle entry. `createdAt` defaults far in the past. */
function veh(
  id: string,
  active: boolean,
  createdAt: Date = U('2026-01-01'),
): { id: string; active: boolean; createdAt: Date } {
  return { id, active, createdAt };
}

function makeAuth(role: AuthUser['role'], sub = 'op-self'): AuthUser {
  return makeAuthUser(role, {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    mustChangePassword: false,
  });
}

function makeCarrierRow(
  overrides: Partial<OpiekunAggregateCarrierRow> = {},
): OpiekunAggregateCarrierRow {
  return {
    id: 'c-1',
    login: 'pwz1',
    name: 'Pwz One',
    company: 'Pwz One Sp.',
    nip: '1234567890',
    active: true,
    numberOfVehicle: null,
    vehicles: [],
    counts: { vehicles: 0, drivers: 0, trailers: 0 },
    ...overrides,
  };
}

function makeCarriersRepo(
  seed: OpiekunAggregateCarrierRow[] = [],
  captured?: { value?: { opiekunId?: string } },
): CarriersRepository {
  return {
    listForOpiekunAggregate: jest.fn(
      async (filters: { opiekunId?: string }) => {
        if (captured) captured.value = filters;
        if (filters.opiekunId !== undefined) {
          // Service forwards the opiekun's `sub`; mimic Prisma's where match
          // against `Carrier.opiekunId` by tagging fixture rows via a hidden
          // sentinel keyed off `id`.
          return seed.filter((r) => (r as { opiekunId?: string }).opiekunId === filters.opiekunId);
        }
        return [...seed];
      },
    ),
  } as unknown as CarriersRepository;
}

/**
 * Helper — same as `makeCarrierRow` but tags the row with a virtual
 * `opiekunId` the mock repo filters on. The production repo applies the
 * filter at the DB layer; the mock proxies it to the test fixture.
 */
function ownedBy(
  opiekunId: string,
  overrides: Partial<OpiekunAggregateCarrierRow> = {},
): OpiekunAggregateCarrierRow {
  return Object.assign(makeCarrierRow(overrides), { opiekunId });
}

/**
 * Vehicles repo stub for the opiekun-fleet path. Readiness now derives purely
 * from the carrier `_count` on the aggregate row (ADR queries removed
 * 2026-07), so the vehicles repo is untouched here — a bare stub suffices.
 */
function noopVehiclesRepo(): VehiclesRepository {
  return {} as unknown as VehiclesRepository;
}
function noopDriversRepo(): DriversRepository {
  return {} as unknown as DriversRepository;
}
function noopTrailersRepo(): TrailersRepository {
  return {} as unknown as TrailersRepository;
}

/**
 * Delegation-status stub — returns `{ hasActiveDelegation, lastReturnAt }` per
 * vehicle id from a per-id config (default: no active delegation, never
 * returned → anchors on `createdAt`).
 */
function stubDelegationStatusRepo(
  config: Record<string, Partial<VehicleDelegationStatus>> = {},
): VehicleDelegationStatusRepository {
  return {
    getByVehicleIds: jest.fn(async (ids: string[]) => {
      const map = new Map<string, VehicleDelegationStatus>();
      for (const id of ids) {
        const c = config[id];
        map.set(id, {
          hasActiveDelegation: c?.hasActiveDelegation ?? false,
          lastReturnAt: c?.lastReturnAt ?? null,
        });
      }
      return map;
    }),
  } as unknown as VehicleDelegationStatusRepository;
}

function newSvc(
  seed: OpiekunAggregateCarrierRow[] = [],
  captured?: { value?: { opiekunId?: string } },
  delegation: Record<string, Partial<VehicleDelegationStatus>> = {},
) {
  const carriersRepo = makeCarriersRepo(seed, captured);
  const vehiclesRepo = noopVehiclesRepo();
  // The readiness service's batched path (`forCarriers`) is PURE — it derives
  // from pre-fetched inputs and never touches a repo — so a real instance
  // faithfully exercises the production code.
  const readiness = new CarrierReadinessService(carriersRepo);
  return new FleetService(
    carriersRepo,
    vehiclesRepo,
    noopDriversRepo(),
    noopTrailersRepo(),
    readiness,
    stubDelegationStatusRepo(delegation),
  );
}

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterAll(() => {
  jest.useRealTimers();
});

describe('FleetService.getOpiekunFleet — role gating', () => {
  it('forwards opiekunId=user.sub when the caller is an opiekun', async () => {
    const captured: { value?: { opiekunId?: string } } = {};
    const svc = newSvc(
      [
        ownedBy('op-self', { id: 'c-mine' }),
        ownedBy('op-other', { id: 'c-other' }),
      ],
      captured,
    );
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(captured.value).toEqual({ opiekunId: 'op-self' });
    expect(out.carriers.map((c) => c.carrierId)).toEqual(['c-mine']);
    expect(out.totals.liczbaPrzewoznikow).toBe(1);
  });

  it('admin gets no opiekunId scope (sees all carriers)', async () => {
    const captured: { value?: { opiekunId?: string } } = {};
    const svc = newSvc(
      [
        ownedBy('op-1', { id: 'c-1' }),
        ownedBy('op-2', { id: 'c-2' }),
        ownedBy('op-3', { id: 'c-3' }),
      ],
      captured,
    );
    const out = await svc.getOpiekunFleet(makeAuth('admin', 'admin-1'));
    expect(captured.value).toEqual({});
    expect(out.carriers).toHaveLength(3);
    expect(out.totals.liczbaPrzewoznikow).toBe(3);
  });

  it.each(['przewoznik', 'planista', 'dyspozytor', 'eksport', 'weryfikator', 'pracownik'] as const)(
    'rejects role=%s with 403',
    async (role) => {
      const svc = newSvc();
      await expect(
        svc.getOpiekunFleet(makeAuth(role)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('returns empty carriers and zeroed totals when the opiekun has no assignments', async () => {
    const svc = newSvc([ownedBy('someone-else', { id: 'c-x' })]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-empty'));
    expect(out.carriers).toEqual([]);
    expect(out.totals).toEqual({
      liczbaPrzewoznikow: 0,
      vehicles: ZERO_VEHICLE_STATS,
    });
  });
});

describe('FleetService.getOpiekunFleet — vehicle classification (delegation-driven)', () => {
  it('classifies every lifecycle bucket correctly and total = sum', async () => {
    const row = ownedBy('op-self', {
      id: 'c-mix',
      numberOfVehicle: 10,
      vehicles: [
        veh('v-a1', true), // aktywne (active delegation)
        veh('v-s1', true), // stojace (returned 10 days ago)
        veh('v-i1', true), // nieaktywne (returned 20 days ago)
        veh('v-d1', true), // do_usuniecia (returned 40 days ago)
        veh('v-w1', false), // wylaczone
      ],
    });
    const svc = newSvc([row], undefined, {
      'v-a1': { hasActiveDelegation: true },
      'v-s1': { lastReturnAt: U('2026-05-17') }, // 10 days
      'v-i1': { lastReturnAt: U('2026-05-07') }, // 20 days
      'v-d1': { lastReturnAt: U('2026-04-17') }, // 40 days
    });
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    const c = out.carriers[0];
    expect(c).toBeDefined();
    expect(c?.vehicles).toEqual({
      aktywne: 1,
      stojace: 1,
      nieaktywne: 1,
      doUsuniecia: 1,
      wylaczone: 1,
      // potencjalne = max(0, 10 KREPTD - 5 total) = 5
      potencjalne: 5,
      total: 5,
    });
    // total must equal the sum of the five lifecycle buckets.
    if (c) {
      expect(c.vehicles.total).toBe(
        c.vehicles.aktywne +
          c.vehicles.stojace +
          c.vehicles.nieaktywne +
          c.vehicles.doUsuniecia +
          c.vehicles.wylaczone,
      );
    }
  });

  it('the 14→15-day boundary flips stojace→nieaktywne', async () => {
    const row = ownedBy('op-self', {
      vehicles: [veh('v-14', true), veh('v-15', true)],
    });
    const svc = newSvc([row], undefined, {
      'v-14': { lastReturnAt: U('2026-05-13') }, // 14 days → stojace
      'v-15': { lastReturnAt: U('2026-05-12') }, // 15 days → nieaktywne
    });
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.vehicles).toMatchObject({
      stojace: 1,
      nieaktywne: 1,
      doUsuniecia: 0,
    });
  });

  it('a never-returned active vehicle anchors on createdAt (recent → stojace)', async () => {
    const row = ownedBy('op-self', {
      vehicles: [veh('v-new', true, U('2026-05-20'))], // created 7 days ago
    });
    const svc = newSvc([row]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.vehicles.stojace).toBe(1);
    expect(out.carriers[0]?.vehicles.doUsuniecia).toBe(0);
  });

  it('clamps potencjalne at 0 when the carrier registered more vehicles than KREPTD entries', async () => {
    const row = ownedBy('op-self', {
      numberOfVehicle: 2,
      vehicles: [
        veh('v-1', true, U('2026-05-25')),
        veh('v-2', true, U('2026-05-25')),
        veh('v-3', true, U('2026-05-25')),
        veh('v-4', false),
      ],
    });
    const svc = newSvc([row]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.vehicles.potencjalne).toBe(0);
    expect(out.carriers[0]?.vehicles.total).toBe(4);
  });

  it('treats missing KREPTD (numberOfVehicle=null) as 0 potencjalne', async () => {
    const row = ownedBy('op-self', {
      numberOfVehicle: null,
      vehicles: [veh('v-1', true, U('2026-05-25'))],
    });
    const svc = newSvc([row]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.vehicles.potencjalne).toBe(0);
  });

  it('aggregates totals across multiple carriers', async () => {
    const a = ownedBy('op-self', {
      id: 'c-a',
      numberOfVehicle: 3,
      vehicles: [
        veh('v-a1', true, U('2026-05-25')), // stojace (created 2 days ago)
        veh('v-a2', false), // wylaczone
      ],
    });
    const b = ownedBy('op-self', {
      id: 'c-b',
      numberOfVehicle: 5,
      vehicles: [veh('v-b1', true)], // do_usuniecia (created 2026-01-01)
    });
    const svc = newSvc([a, b]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.totals).toEqual({
      liczbaPrzewoznikow: 2,
      vehicles: {
        aktywne: 0,
        stojace: 1,
        nieaktywne: 0,
        doUsuniecia: 1,
        wylaczone: 1,
        // a: max(0, 3-2)=1; b: max(0, 5-1)=4 ⇒ 5
        potencjalne: 5,
        total: 3,
      },
    });
  });

  it('maps every per-carrier field through to the wire DTO', async () => {
    const row = ownedBy('op-self', {
      id: 'c-zzz',
      login: 'zzz-trans',
      name: 'Zzz Display Name',
      company: 'Zzz Logistics Sp. z o.o.',
      nip: '9999999999',
      active: false,
      numberOfVehicle: 4,
      vehicles: [],
    });
    const svc = newSvc([row]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]).toEqual({
      carrierId: 'c-zzz',
      login: 'zzz-trans',
      nazwa: 'Zzz Display Name',
      firma: 'Zzz Logistics Sp. z o.o.',
      nip: '9999999999',
      aktywny: false,
      liczbaWypisow: 4,
      vehicles: {
        aktywne: 0,
        stojace: 0,
        nieaktywne: 0,
        doUsuniecia: 0,
        wylaczone: 0,
        potencjalne: 4,
        total: 0,
      },
      // No active vehicle/trailer/driver on this fixture → incompleteFleet.
      attentionReasons: ['incompleteFleet'],
    });
  });
});

describe('FleetService.getOpiekunFleet — attentionReasons (carrier readiness)', () => {
  // A carrier with a complete active fleet (≥1 vehicle, trailer, driver) →
  // ready → empty attentionReasons. Readiness now derives ONLY from the active
  // fleet counts (ADR removed 2026-07), so `incompleteFleet` is the sole
  // possible attention reason.
  function fullFleetRow(
    overrides: Partial<OpiekunAggregateCarrierRow> = {},
  ): OpiekunAggregateCarrierRow {
    return ownedBy('op-self', {
      counts: { vehicles: 2, drivers: 1, trailers: 1 },
      vehicles: [veh('v', true)],
      ...overrides,
    });
  }

  it('empty attentionReasons when the carrier is ready (full fleet)', async () => {
    const svc = newSvc([fullFleetRow({ id: 'c-ready' })]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.attentionReasons).toEqual([]);
  });

  it('flags incompleteFleet when a child type is missing (no trailer)', async () => {
    const svc = newSvc([
      fullFleetRow({ id: 'c-no-trailer', counts: { vehicles: 1, drivers: 1, trailers: 0 } }),
    ]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.attentionReasons).toEqual(['incompleteFleet']);
  });

  it.each([
    ['no vehicle', { vehicles: 0, drivers: 1, trailers: 1 }],
    ['no driver', { vehicles: 1, drivers: 0, trailers: 1 }],
    ['no trailer', { vehicles: 1, drivers: 1, trailers: 0 }],
  ])('flags incompleteFleet when %s', async (_label, counts) => {
    const svc = newSvc([fullFleetRow({ id: 'c-incomplete', counts })]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.attentionReasons).toEqual(['incompleteFleet']);
  });

  it('derives readiness per carrier across a multi-carrier batch (no extra queries)', async () => {
    const svc = newSvc([
      fullFleetRow({ id: 'c-1' }), // ready
      fullFleetRow({ id: 'c-2', counts: { vehicles: 1, drivers: 1, trailers: 0 } }), // incomplete
      fullFleetRow({ id: 'c-3', counts: { vehicles: 0, drivers: 1, trailers: 1 } }), // incomplete
    ]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    const byId = new Map(out.carriers.map((c) => [c.carrierId, c.attentionReasons]));
    expect(byId.get('c-1')).toEqual([]);
    expect(byId.get('c-2')).toEqual(['incompleteFleet']);
    expect(byId.get('c-3')).toEqual(['incompleteFleet']);
  });
});
