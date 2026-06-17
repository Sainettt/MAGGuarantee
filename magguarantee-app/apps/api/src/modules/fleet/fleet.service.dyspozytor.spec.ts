import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierAttachmentsRepository } from '../carriers/carrier-attachments.repository';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository, type DriverRow } from '../drivers/drivers.repository';
import { TrailersRepository, type TrailerRow } from '../trailers/trailers.repository';
import {
  VehiclesRepository,
  type VehicleListFilters,
  type VehicleRow,
} from '../vehicles/vehicles.repository';
import { FleetService } from './fleet.service';

// Anchor "now" — vehicles classified jezdzace / stojace use the 7-day window
// past lastDroveAt measured from this timestamp (shared DRIVING_RECENCY_DAYS).
const NOW = new Date('2026-05-27T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function makeAuth(
  role: AuthUser['role'],
  sub = 'dys-self',
  teamId: string | null = 'team-1',
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

function makeVehicle(overrides: Partial<VehicleRow> = {}): VehicleRow {
  return {
    id: 'v-1',
    carrierId: 'c-1',
    plateNumber: 'PL0001',
    active: true,
    notes: null,
    certificateL: false,
    euro: 'VI',
    gps: false,
    fuelCard: false,
    type: 'STD',
    gb: null,
    it: null,
    fr: null,
    agreement: null,
    rateDe: null,
    rateUe: null,
    rateExport: null,
    rateImport: null,
    wasteAllowed: false,
    wasteCountries: [],
    cabotageDe: false,
    cabotageFr: false,
    adr: false,
    gpsMobilePhone: null,
    sideNumber: null,
    lastDroveAt: null,
    plannerId: 'plan-1',
    planner: { id: 'plan-1', login: 'plan', name: 'Planner One' },
    dispatchTeamId: 'team-1',
    dispatchTeam: {
      id: 'team-1',
      code: '1.1.13',
      name: 'Zespół 1.1.13',
      active: true,
      dispatchers: [{ id: 'dys-self', login: 'dys', name: 'Dispatcher One' }],
    },
    carrier: { id: 'c-1', login: 'pwz1', name: 'Pwz One' },
    attachments: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeDriver(overrides: Partial<DriverRow> = {}): DriverRow {
  return {
    id: 'd-1',
    carrierId: 'c-1',
    loginSlug: 'jan-kowalski',
    firstName: 'Jan',
    lastName: 'Kowalski',
    phone: '111',
    phone2: null,
    email: null,
    idDocumentNumber: 'ABC123',
    licenseExpiry: null,
    notes: null,
    active: true,
    adr: false,
    carrier: { id: 'c-1', login: 'pwz1', name: 'Pwz One' },
    attachments: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeTrailer(overrides: Partial<TrailerRow> = {}): TrailerRow {
  return {
    id: 't-1',
    carrierId: 'c-1',
    plateNumber: 'TR0001',
    active: true,
    trailerTypeId: 'tt-1',
    trailerType: { id: 'tt-1', name: 'Plandeka', shortCode: 'PL', active: true },
    belts: null,
    beltsCount: null,
    mats: null,
    matsCount: null,
    innerLength: null,
    innerWidth: null,
    innerHeight: null,
    capacity: null,
    airSuspension: null,
    certXl: null,
    multilock: null,
    notes: null,
    carrier: { id: 'c-1', login: 'pwz1', name: 'Pwz One' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function stubVehiclesRepo(
  seed: VehicleRow[],
  captured?: { value?: VehicleListFilters },
): VehiclesRepository {
  return {
    list: jest.fn(async (filters: VehicleListFilters) => {
      if (captured) captured.value = filters;
      if (filters.dispatchTeamId !== undefined) {
        return seed.filter((v) => v.dispatchTeamId === filters.dispatchTeamId);
      }
      return [...seed];
    }),
  } as unknown as VehiclesRepository;
}

function stubDriversRepo(
  seed: DriverRow[],
  captured?: { value?: { carrierIds?: string[] } },
): DriversRepository {
  return {
    list: jest.fn(async (filters: { carrierIds?: string[] }) => {
      if (captured) captured.value = filters;
      if (filters.carrierIds) {
        return seed.filter((d) => filters.carrierIds!.includes(d.carrierId));
      }
      return [...seed];
    }),
  } as unknown as DriversRepository;
}

function stubTrailersRepo(
  seed: TrailerRow[],
  captured?: { value?: { carrierIds?: string[] } },
): TrailersRepository {
  return {
    list: jest.fn(async (filters: { carrierIds?: string[] }) => {
      if (captured) captured.value = filters;
      if (filters.carrierIds) {
        return seed.filter((t) => filters.carrierIds!.includes(t.carrierId));
      }
      return [...seed];
    }),
  } as unknown as TrailersRepository;
}

function noop<T>(): T {
  return {} as unknown as T;
}

function newSvc(opts: {
  vehicles: VehicleRow[];
  drivers?: DriverRow[];
  trailers?: TrailerRow[];
  capturedVehicles?: { value?: VehicleListFilters };
  capturedDrivers?: { value?: { carrierIds?: string[] } };
}) {
  return new FleetService(
    noop<CarriersRepository>(),
    stubVehiclesRepo(opts.vehicles, opts.capturedVehicles),
    stubDriversRepo(opts.drivers ?? [], opts.capturedDrivers),
    stubTrailersRepo(opts.trailers ?? []),
    noop<CarrierReadinessService>(),
    noop<CarrierAttachmentsRepository>(),
  );
}

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterAll(() => {
  jest.useRealTimers();
});

describe('FleetService.getDyspozytorFleet — role gating', () => {
  it.each([
    'przewoznik',
    'opiekun',
    'planista',
    'eksport',
    'weryfikator',
    'pracownik',
  ] as const)('rejects role=%s with 403', async (role) => {
    const svc = newSvc({ vehicles: [] });
    await expect(
      svc.getDyspozytorFleet(makeAuth(role)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('FleetService.getDyspozytorFleet — dispatchTeamId scoping (Phase 11)', () => {
  it('forwards dispatchTeamId=user.teamId and returns only the team vehicles', async () => {
    const captured: { value?: VehicleListFilters } = {};
    const svc = newSvc({
      vehicles: [
        makeVehicle({ id: 'v-mine', dispatchTeamId: 'team-1', carrierId: 'c-1' }),
        makeVehicle({ id: 'v-other', dispatchTeamId: 'team-2', carrierId: 'c-2' }),
      ],
      drivers: [
        makeDriver({ id: 'd-1', carrierId: 'c-1' }),
        makeDriver({ id: 'd-2', carrierId: 'c-2' }),
      ],
      capturedVehicles: captured,
    });
    const out = await svc.getDyspozytorFleet(
      makeAuth('dyspozytor', 'dys-self', 'team-1'),
    );
    expect(captured.value?.dispatchTeamId).toBe('team-1');
    expect(out.vehicles.map((v) => v.id)).toEqual(['v-mine']);
    expect(out.drivers.map((d) => d.id)).toEqual(['d-1']);
  });

  it('admin sees all vehicles (no dispatchTeamId scope)', async () => {
    const captured: { value?: VehicleListFilters } = {};
    const svc = newSvc({
      vehicles: [
        makeVehicle({ id: 'v-1', dispatchTeamId: 'team-a', carrierId: 'c-1' }),
        makeVehicle({ id: 'v-2', dispatchTeamId: 'team-b', carrierId: 'c-2' }),
      ],
      capturedVehicles: captured,
    });
    const out = await svc.getDyspozytorFleet(makeAuth('admin', 'admin-1'));
    expect(captured.value?.dispatchTeamId).toBeUndefined();
    expect(out.vehicles).toHaveLength(2);
  });

  it('a dyspozytor with NO team gets an empty payload (no query, never "all")', async () => {
    const captured: { value?: VehicleListFilters } = {};
    const svc = newSvc({
      // Seed vehicles that WOULD be returned if the scope leaked to "all".
      vehicles: [
        makeVehicle({ id: 'v-x', dispatchTeamId: 'team-1', carrierId: 'c-1' }),
      ],
      drivers: [makeDriver({ id: 'd-1', carrierId: 'c-1' })],
      capturedVehicles: captured,
    });
    const out = await svc.getDyspozytorFleet(
      makeAuth('dyspozytor', 'dys-noteam', null),
    );
    expect(out.vehicles).toEqual([]);
    expect(out.drivers).toEqual([]);
    expect(out.trailers).toEqual([]);
    expect(out.stojaceList).toEqual([]);
    expect(out.stats).toEqual({
      liczbaAut: 0,
      autaAktywne: 0,
      autaJezdzace: 0,
      autaStojace7dni: 0,
      autaNieaktywne: 0,
      liczbaKierowcow: 0,
      liczbaNaczep: 0,
    });
    // Early return — no vehicle query was issued.
    expect(captured.value).toBeUndefined();
  });

  it('returns empty payload + zeroed stats when the team has no vehicles', async () => {
    const svc = newSvc({
      vehicles: [
        makeVehicle({ id: 'v-other', dispatchTeamId: 'team-other', carrierId: 'c-1' }),
      ],
      drivers: [makeDriver({ id: 'd-1', carrierId: 'c-1' })],
    });
    const out = await svc.getDyspozytorFleet(
      makeAuth('dyspozytor', 'dys-self', 'team-empty'),
    );
    expect(out.vehicles).toEqual([]);
    expect(out.drivers).toEqual([]);
    expect(out.trailers).toEqual([]);
    expect(out.stojaceList).toEqual([]);
    expect(out.stats).toEqual({
      liczbaAut: 0,
      autaAktywne: 0,
      autaJezdzace: 0,
      autaStojace7dni: 0,
      autaNieaktywne: 0,
      liczbaKierowcow: 0,
      liczbaNaczep: 0,
    });
  });
});

describe('FleetService.getDyspozytorFleet — stats buckets', () => {
  it('classifies every bucket with the 7-day cutoff and the no-lastDroveAt rule', async () => {
    const svc = newSvc({
      vehicles: [
        // jezdzace: active + recent
        makeVehicle({ id: 'v-r1', active: true, lastDroveAt: new Date(NOW.getTime() - 1 * DAY_MS) }),
        // jezdzace: active + null lastDroveAt (no data → driving)
        makeVehicle({ id: 'v-r2', active: true, lastDroveAt: null }),
        // stojace: active + 10 days idle
        makeVehicle({ id: 'v-s1', active: true, lastDroveAt: new Date(NOW.getTime() - 10 * DAY_MS) }),
        // nieaktywne (idle date irrelevant — inactive short-circuits first)
        makeVehicle({ id: 'v-n1', active: false, lastDroveAt: new Date(NOW.getTime() - 30 * DAY_MS) }),
      ],
      drivers: [makeDriver({ id: 'd-1' }), makeDriver({ id: 'd-2' })],
      trailers: [makeTrailer({ id: 't-1' })],
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stats).toEqual({
      liczbaAut: 4,
      autaAktywne: 3,
      autaJezdzace: 2,
      autaStojace7dni: 1,
      autaNieaktywne: 1,
      liczbaKierowcow: 2,
      liczbaNaczep: 1,
    });
    // Legacy invariants.
    expect(out.stats.autaJezdzace + out.stats.autaStojace7dni).toBe(
      out.stats.autaAktywne,
    );
    expect(out.stats.autaAktywne + out.stats.autaNieaktywne).toBe(
      out.stats.liczbaAut,
    );
  });

  it('treats a lastDroveAt exactly at the 7-day boundary as jezdzace (strict > 7d → stojace)', async () => {
    const boundary = new Date(NOW.getTime() - 7 * DAY_MS);
    const svc = newSvc({
      vehicles: [makeVehicle({ id: 'v-edge', active: true, lastDroveAt: boundary })],
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stats.autaJezdzace).toBe(1);
    expect(out.stats.autaStojace7dni).toBe(0);
    expect(out.stojaceList).toEqual([]);
  });

  it('a vehicle with no lastDroveAt is jezdzace and never appears in stojaceList', async () => {
    const svc = newSvc({
      vehicles: [makeVehicle({ id: 'v-nodata', active: true, lastDroveAt: null })],
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stats.autaJezdzace).toBe(1);
    expect(out.stats.autaStojace7dni).toBe(0);
    expect(out.stojaceList).toEqual([]);
  });
});

describe('FleetService.getDyspozytorFleet — stojaceList shape', () => {
  it('builds one stojące row per idle>7d vehicle with the documented field names', async () => {
    const lastDrove = new Date(NOW.getTime() - 10 * DAY_MS);
    const svc = newSvc({
      vehicles: [
        makeVehicle({
          id: 'v-s1',
          active: true,
          plateNumber: 'PL-IDLE',
          lastDroveAt: lastDrove,
          carrier: { id: 'c-1', login: 'pwz-idle', name: 'Pwz Idle' },
          planner: { id: 'plan-1', login: 'plan', name: 'Anna Planista' },
        }),
      ],
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stojaceList).toEqual([
      {
        plateNumber: 'PL-IDLE',
        carrierLogin: 'pwz-idle',
        lastDroveAt: lastDrove.toISOString(),
        daysIdle: 10,
        plannerName: 'Anna Planista',
      },
    ]);
  });

  it('plannerName is null when no planner relation is loaded', async () => {
    const svc = newSvc({
      vehicles: [
        makeVehicle({
          id: 'v-s2',
          active: true,
          lastDroveAt: new Date(NOW.getTime() - 14 * DAY_MS),
          plannerId: null,
          planner: null,
        }),
      ],
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stojaceList[0]?.plannerName).toBeNull();
    expect(out.stojaceList[0]?.daysIdle).toBe(14);
  });

  it('inactive vehicles never surface in stojaceList even if long idle', async () => {
    const svc = newSvc({
      vehicles: [
        makeVehicle({
          id: 'v-dead',
          active: false,
          lastDroveAt: new Date(NOW.getTime() - 100 * DAY_MS),
        }),
      ],
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stojaceList).toEqual([]);
    expect(out.stats.autaNieaktywne).toBe(1);
    expect(out.stats.autaStojace7dni).toBe(0);
  });
});
