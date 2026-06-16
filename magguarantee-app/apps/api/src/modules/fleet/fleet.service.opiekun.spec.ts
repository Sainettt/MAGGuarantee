import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierAttachmentsRepository } from '../carriers/carrier-attachments.repository';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import {
  CarriersRepository,
  type OpiekunAggregateCarrierRow,
} from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import { FleetService } from './fleet.service';

// Anchor "now" — vehicles classified as `jezdzace` / `stojace` use the
// 7-day window past `lastDroveAt` measured from this timestamp.
const NOW = new Date('2026-05-27T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function makeAuth(role: AuthUser['role'], sub = 'op-self'): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
    mustChangePassword: false,
  };
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
 * Vehicles repo stub for the opiekun-fleet path. Only the batched
 * `countActiveAdrByCarriers` is exercised here — its return map is seeded per
 * test via `adrVehicleCounts` (carrierId → active-ADR-vehicle count).
 */
function stubVehiclesRepo(
  adrVehicleCounts: Record<string, number> = {},
): VehiclesRepository {
  return {
    countActiveAdrByCarriers: jest.fn(async (ids: string[]) => {
      const out = new Map<string, number>();
      for (const id of ids) {
        if (adrVehicleCounts[id] !== undefined) {
          out.set(id, adrVehicleCounts[id]!);
        }
      }
      return out;
    }),
  } as unknown as VehiclesRepository;
}
function noopDriversRepo(): DriversRepository {
  return {} as unknown as DriversRepository;
}
function noopTrailersRepo(): TrailersRepository {
  return {} as unknown as TrailersRepository;
}

/**
 * Carrier-attachments repo stub — only the batched
 * `countActiveByCategoryForCarriers` (category `adr`) is used. Seeded per test
 * via `adrDocCounts` (carrierId → active-ADR-doc count).
 */
function stubAttachmentsRepo(
  adrDocCounts: Record<string, number> = {},
): CarrierAttachmentsRepository {
  return {
    countActiveByCategoryForCarriers: jest.fn(
      async (ids: string[], _category: string) => {
        const out = new Map<string, number>();
        for (const id of ids) {
          if (adrDocCounts[id] !== undefined) {
            out.set(id, adrDocCounts[id]!);
          }
        }
        return out;
      },
    ),
  } as unknown as CarrierAttachmentsRepository;
}

function newSvc(
  seed: OpiekunAggregateCarrierRow[] = [],
  captured?: { value?: { opiekunId?: string } },
  adr: { vehicles?: Record<string, number>; docs?: Record<string, number> } = {},
) {
  const carriersRepo = makeCarriersRepo(seed, captured);
  const vehiclesRepo = stubVehiclesRepo(adr.vehicles);
  const attachmentsRepo = stubAttachmentsRepo(adr.docs);
  // The readiness service's batched path (`forCarriers`) is PURE — it derives
  // from pre-fetched inputs and never touches a repo — so a real instance
  // wired with the stub repos faithfully exercises the production code.
  const readiness = new CarrierReadinessService(
    carriersRepo,
    vehiclesRepo,
    attachmentsRepo,
  );
  return new FleetService(
    carriersRepo,
    vehiclesRepo,
    noopDriversRepo(),
    noopTrailersRepo(),
    readiness,
    attachmentsRepo,
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
      vehicles: {
        jezdzace: 0,
        stojace: 0,
        nieaktywne: 0,
        potencjalne: 0,
        total: 0,
      },
    });
  });
});

describe('FleetService.getOpiekunFleet — vehicle classification', () => {
  it('classifies every bucket correctly and total = sum', async () => {
    const row = ownedBy('op-self', {
      id: 'c-mix',
      numberOfVehicle: 10,
      vehicles: [
        // jezdzace: active + recent (1 day ago)
        { id: 'v-r1', active: true, lastDroveAt: new Date(NOW.getTime() - 1 * DAY_MS) },
        // jezdzace: active + null lastDroveAt (legacy "no data = driving")
        { id: 'v-r2', active: true, lastDroveAt: null },
        // stojace: active but 10 days idle
        { id: 'v-s1', active: true, lastDroveAt: new Date(NOW.getTime() - 10 * DAY_MS) },
        // stojace: active but a year idle
        { id: 'v-s2', active: true, lastDroveAt: new Date(NOW.getTime() - 365 * DAY_MS) },
        // nieaktywne
        { id: 'v-n1', active: false, lastDroveAt: new Date(NOW.getTime() - 1 * DAY_MS) },
      ],
    });
    const svc = newSvc([row]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    const c = out.carriers[0];
    expect(c).toBeDefined();
    expect(c?.vehicles).toEqual({
      jezdzace: 2,
      stojace: 2,
      nieaktywne: 1,
      // potencjalne = max(0, 10 KREPTD - 5 total) = 5
      potencjalne: 5,
      total: 5,
    });
    // The total bucket must equal the sum of jezdzace+stojace+nieaktywne.
    if (c) {
      expect(c.vehicles.total).toBe(
        c.vehicles.jezdzace + c.vehicles.stojace + c.vehicles.nieaktywne,
      );
    }
  });

  it('treats a lastDroveAt exactly at the 7-day boundary as jezdzace (legacy: strict > 7d → stojace)', async () => {
    const boundary = new Date(NOW.getTime() - 7 * DAY_MS);
    const row = ownedBy('op-self', {
      vehicles: [
        { id: 'v-edge', active: true, lastDroveAt: boundary },
      ],
    });
    const svc = newSvc([row]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.vehicles).toEqual({
      jezdzace: 1,
      stojace: 0,
      nieaktywne: 0,
      potencjalne: 0,
      total: 1,
    });
  });

  it('clamps potencjalne at 0 when the carrier registered more vehicles than KREPTD entries', async () => {
    const row = ownedBy('op-self', {
      numberOfVehicle: 2,
      vehicles: [
        { id: 'v-1', active: true, lastDroveAt: null },
        { id: 'v-2', active: true, lastDroveAt: null },
        { id: 'v-3', active: true, lastDroveAt: null },
        { id: 'v-4', active: false, lastDroveAt: null },
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
      vehicles: [
        { id: 'v-1', active: true, lastDroveAt: null },
      ],
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
        { id: 'v-a1', active: true, lastDroveAt: null }, // jezdzace
        { id: 'v-a2', active: false, lastDroveAt: null }, // nieaktywne
      ],
    });
    const b = ownedBy('op-self', {
      id: 'c-b',
      numberOfVehicle: 5,
      vehicles: [
        { id: 'v-b1', active: true, lastDroveAt: new Date(NOW.getTime() - 30 * DAY_MS) }, // stojace
      ],
    });
    const svc = newSvc([a, b]);
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.totals).toEqual({
      liczbaPrzewoznikow: 2,
      vehicles: {
        jezdzace: 1,
        stojace: 1,
        nieaktywne: 1,
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
        jezdzace: 0,
        stojace: 0,
        nieaktywne: 0,
        potencjalne: 4,
        total: 0,
      },
      // No active vehicle/trailer/driver on this fixture → incompleteFleet.
      attentionReasons: ['incompleteFleet'],
    });
  });
});

describe('FleetService.getOpiekunFleet — attentionReasons (carrier readiness)', () => {
  // A carrier with a complete active fleet (≥1 vehicle, trailer, driver) and
  // no ADR vehicle → ready → empty attentionReasons.
  function fullFleetRow(
    overrides: Partial<OpiekunAggregateCarrierRow> = {},
  ): OpiekunAggregateCarrierRow {
    return ownedBy('op-self', {
      counts: { vehicles: 2, drivers: 1, trailers: 1 },
      vehicles: [{ id: 'v', active: true, lastDroveAt: null }],
      ...overrides,
    });
  }

  it('empty attentionReasons when the carrier is ready (full fleet, no ADR vehicle)', async () => {
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

  it('flags adrDocMissing when an ADR vehicle exists but no ADR doc', async () => {
    const svc = newSvc(
      [fullFleetRow({ id: 'c-adr' })],
      undefined,
      { vehicles: { 'c-adr': 1 }, docs: {} },
    );
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.attentionReasons).toEqual(['adrDocMissing']);
  });

  it('clears adrDocMissing when the ADR doc is on file', async () => {
    const svc = newSvc(
      [fullFleetRow({ id: 'c-adr-ok' })],
      undefined,
      { vehicles: { 'c-adr-ok': 1 }, docs: { 'c-adr-ok': 1 } },
    );
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.attentionReasons).toEqual([]);
  });

  it('stacks both reasons (incomplete fleet + ADR vehicle without doc)', async () => {
    const svc = newSvc(
      [
        fullFleetRow({
          id: 'c-both',
          counts: { vehicles: 1, drivers: 0, trailers: 1 },
        }),
      ],
      undefined,
      { vehicles: { 'c-both': 2 }, docs: {} },
    );
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.attentionReasons).toEqual([
      'incompleteFleet',
      'adrDocMissing',
    ]);
  });

  it('does not require an ADR doc when the carrier has no ADR vehicle', async () => {
    const svc = newSvc(
      [fullFleetRow({ id: 'c-no-adr' })],
      undefined,
      { vehicles: {}, docs: {} },
    );
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    expect(out.carriers[0]?.attentionReasons).toEqual([]);
  });

  it('zips ADR maps per carrier across a multi-carrier batch (one groupBy each)', async () => {
    const svc = newSvc(
      [
        fullFleetRow({ id: 'c-1' }), // ready
        fullFleetRow({ id: 'c-2' }), // ADR vehicle, no doc
        fullFleetRow({ id: 'c-3', counts: { vehicles: 0, drivers: 1, trailers: 1 } }), // incomplete
      ],
      undefined,
      { vehicles: { 'c-2': 1 }, docs: {} },
    );
    const out = await svc.getOpiekunFleet(makeAuth('opiekun', 'op-self'));
    const byId = new Map(out.carriers.map((c) => [c.carrierId, c.attentionReasons]));
    expect(byId.get('c-1')).toEqual([]);
    expect(byId.get('c-2')).toEqual(['adrDocMissing']);
    expect(byId.get('c-3')).toEqual(['incompleteFleet']);
  });
});
