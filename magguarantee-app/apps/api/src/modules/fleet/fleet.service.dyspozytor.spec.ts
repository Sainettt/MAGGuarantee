import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository, type DriverRow } from '../drivers/drivers.repository';
import { TrailersRepository, type TrailerRow } from '../trailers/trailers.repository';
import {
  VehicleDelegationStatusRepository,
  type VehicleDelegationStatus,
} from '../vehicles/vehicle-delegation-status.repository';
import {
  VehiclesRepository,
  type VehicleListFilters,
  type VehicleRow,
} from '../vehicles/vehicles.repository';
import { FleetService } from './fleet.service';

// Anchor "now" — the delegation-driven lifecycle classifier measures CALENDAR
// days (Europe/Warsaw) from the idle anchor to this Warsaw "today"
// (2026-05-27). Vehicles are placed into buckets via a controlled
// delegation-status stub (`hasActiveDelegation` / `lastReturnAt`).
const NOW = new Date('2026-05-27T12:00:00.000Z');

/** `YYYY-MM-DD` → UTC-midnight Date (date-only convention for `lastReturnAt`). */
function U(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, d as number));
}

/** Empty dyspozytor/planista KPI strip (new delegation-driven shape). */
const ZERO_STATS = {
  liczbaAut: 0,
  aktywne: 0,
  stojace: 0,
  nieaktywne: 0,
  doUsuniecia: 0,
  wylaczone: 0,
  liczbaKierowcow: 0,
  liczbaNaczep: 0,
};

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
    fuelCard: false,
    fuelCardNumber: null,
    fuelCardExpiry: null,
    fuelCardPin: null,
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
    adrClasses: [],
    gpsMobilePhone: 'TRK-DEFAULT',
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
    opiekun: null,
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
    nationality: 'PL',
    languages: ['PL'],
    adrClasses: [],
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
    beams: null,
    beamsCount: null,
    innerLength: null,
    innerWidth: null,
    innerHeight: null,
    capacity: null,
    sideClearanceCm: 60,
    liftingRoof: false,
    slidingRoof: false,
    edscha: null,
    palletBox: false,
    certXl: null,
    multilock: null,
    notes: null,
    carrier: { id: 'c-1', login: 'pwz1', name: 'Pwz One' },
    attachments: [],
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

/**
 * Delegation-status stub — returns `{ hasActiveDelegation, lastReturnAt }` per
 * vehicle id from a per-id config (default: no active delegation, never
 * returned). Drives the delegation-driven lifecycle classification.
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

function newSvc(opts: {
  vehicles: VehicleRow[];
  drivers?: DriverRow[];
  trailers?: TrailerRow[];
  delegation?: Record<string, Partial<VehicleDelegationStatus>>;
  capturedVehicles?: { value?: VehicleListFilters };
  capturedDrivers?: { value?: { carrierIds?: string[] } };
}) {
  return new FleetService(
    noop<CarriersRepository>(),
    stubVehiclesRepo(opts.vehicles, opts.capturedVehicles),
    stubDriversRepo(opts.drivers ?? [], opts.capturedDrivers),
    stubTrailersRepo(opts.trailers ?? []),
    noop<CarrierReadinessService>(),
    stubDelegationStatusRepo(opts.delegation ?? {}),
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
    expect(out.stats).toEqual(ZERO_STATS);
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
    expect(out.stats).toEqual(ZERO_STATS);
  });
});

describe('FleetService.getDyspozytorFleet — stats buckets (delegation-driven)', () => {
  it('classifies every lifecycle bucket (aktywne/stojace/nieaktywne/doUsuniecia/wylaczone)', async () => {
    const svc = newSvc({
      vehicles: [
        // aktywne: active + active delegation
        makeVehicle({ id: 'v-a1', active: true }),
        // stojace: active, no delegation, returned 10 days ago
        makeVehicle({ id: 'v-s1', active: true }),
        // nieaktywne: active, no delegation, returned 20 days ago
        makeVehicle({ id: 'v-i1', active: true }),
        // doUsuniecia: active, no delegation, returned 40 days ago
        makeVehicle({ id: 'v-d1', active: true }),
        // wylaczone: manually deactivated (delegation state irrelevant)
        makeVehicle({ id: 'v-w1', active: false }),
      ],
      delegation: {
        'v-a1': { hasActiveDelegation: true },
        'v-s1': { lastReturnAt: U('2026-05-17') }, // 10 days
        'v-i1': { lastReturnAt: U('2026-05-07') }, // 20 days
        'v-d1': { lastReturnAt: U('2026-04-17') }, // 40 days
      },
      drivers: [makeDriver({ id: 'd-1' }), makeDriver({ id: 'd-2' })],
      trailers: [makeTrailer({ id: 't-1' })],
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stats).toEqual({
      liczbaAut: 5,
      aktywne: 1,
      stojace: 1,
      nieaktywne: 1,
      doUsuniecia: 1,
      wylaczone: 1,
      liczbaKierowcow: 2,
      liczbaNaczep: 1,
    });
    // Invariant: the five lifecycle buckets partition liczbaAut.
    expect(
      out.stats.aktywne +
        out.stats.stojace +
        out.stats.nieaktywne +
        out.stats.doUsuniecia +
        out.stats.wylaczone,
    ).toBe(out.stats.liczbaAut);
  });

  it('the 14→15-day boundary flips stojace→nieaktywne', async () => {
    const svc = newSvc({
      vehicles: [
        makeVehicle({ id: 'v-14', active: true }),
        makeVehicle({ id: 'v-15', active: true }),
      ],
      delegation: {
        'v-14': { lastReturnAt: U('2026-05-13') }, // exactly 14 days → stojace
        'v-15': { lastReturnAt: U('2026-05-12') }, // 15 days → nieaktywne
      },
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stats.stojace).toBe(1);
    expect(out.stats.nieaktywne).toBe(1);
    expect(out.stats.doUsuniecia).toBe(0);
  });

  it('an active vehicle with an active delegation is aktywne, never in stojaceList', async () => {
    const svc = newSvc({
      vehicles: [makeVehicle({ id: 'v-busy', active: true })],
      delegation: { 'v-busy': { hasActiveDelegation: true } },
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stats.aktywne).toBe(1);
    expect(out.stats.stojace).toBe(0);
    expect(out.stojaceList).toEqual([]);
  });

  it('never-returned vehicle anchors on createdAt (do_usuniecia when created long ago)', async () => {
    const svc = newSvc({
      // Default fixture createdAt = 2026-01-01 → ~146 days before NOW.
      vehicles: [makeVehicle({ id: 'v-new', active: true })],
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stats.doUsuniecia).toBe(1);
    expect(out.stats.stojace).toBe(0);
  });
});

describe('FleetService.getDyspozytorFleet — stojaceList shape', () => {
  it('surfaces nieaktywna/do_usuniecia vehicles with status + daysSinceReturn', async () => {
    const svc = newSvc({
      vehicles: [
        makeVehicle({
          id: 'v-i1',
          active: true,
          plateNumber: 'PL-IDLE',
          carrier: { id: 'c-1', login: 'pwz-idle', name: 'Pwz Idle' },
          planner: { id: 'plan-1', login: 'plan', name: 'Anna Planista' },
        }),
      ],
      delegation: { 'v-i1': { lastReturnAt: U('2026-05-07') } }, // 20 days
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stojaceList).toEqual([
      {
        plateNumber: 'PL-IDLE',
        carrierLogin: 'pwz-idle',
        status: 'nieaktywna',
        daysSinceReturn: 20,
        plannerName: 'Anna Planista',
      },
    ]);
  });

  it('plannerName is null when no planner relation is loaded; do_usuniecia surfaces', async () => {
    const svc = newSvc({
      vehicles: [
        makeVehicle({
          id: 'v-d2',
          active: true,
          plannerId: null,
          planner: null,
        }),
      ],
      delegation: { 'v-d2': { lastReturnAt: U('2026-04-17') } }, // 40 days
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stojaceList[0]?.plannerName).toBeNull();
    expect(out.stojaceList[0]?.status).toBe('do_usuniecia');
    expect(out.stojaceList[0]?.daysSinceReturn).toBe(40);
  });

  it('stojace (0–14d) and wylaczone vehicles never surface in stojaceList', async () => {
    const svc = newSvc({
      vehicles: [
        makeVehicle({ id: 'v-ok', active: true }),
        makeVehicle({ id: 'v-off', active: false }),
      ],
      delegation: {
        'v-ok': { lastReturnAt: U('2026-05-20') }, // 7 days → stojace
      },
    });
    const out = await svc.getDyspozytorFleet(makeAuth('dyspozytor', 'dys-self'));
    expect(out.stojaceList).toEqual([]);
    expect(out.stats.stojace).toBe(1);
    expect(out.stats.wylaczone).toBe(1);
  });
});
