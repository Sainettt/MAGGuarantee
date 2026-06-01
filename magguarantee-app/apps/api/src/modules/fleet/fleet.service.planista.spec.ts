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

// ─── Fixture builders ────────────────────────────────────

function makeAuth(role: AuthUser['role'], sub = 'plan-self'): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
  };
}

function makeVehicle(overrides: Partial<VehicleRow> = {}): VehicleRow {
  return {
    id: 'v-1',
    carrierId: 'c-1',
    plateNumber: 'PL0001',
    active: true,
    brand: 'Volvo',
    model: 'FH',
    year: 2020,
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
    plannerId: 'plan-self',
    planner: { id: 'plan-self', login: 'plan', name: 'Planner One' },
    dispatcherId: null,
    dispatcher: null,
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
    brand: 'Schmitz',
    model: 'SCB',
    year: 2019,
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

/**
 * Vehicles repo stub for the planista path. Captures the filters the service
 * sends to `list` and returns rows filtered by `plannerId` (mimicking the
 * Prisma `where: { plannerId }` the real repo applies).
 */
function stubVehiclesRepo(
  seed: VehicleRow[],
  captured?: { value?: VehicleListFilters },
): VehiclesRepository {
  return {
    list: jest.fn(async (filters: VehicleListFilters) => {
      if (captured) captured.value = filters;
      if (filters.plannerId !== undefined) {
        return seed.filter((v) => v.plannerId === filters.plannerId);
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
  capturedTrailers?: { value?: { carrierIds?: string[] } };
}) {
  return new FleetService(
    noop<CarriersRepository>(),
    stubVehiclesRepo(opts.vehicles, opts.capturedVehicles),
    stubDriversRepo(opts.drivers ?? [], opts.capturedDrivers),
    stubTrailersRepo(opts.trailers ?? [], opts.capturedTrailers),
    noop<CarrierReadinessService>(),
    noop<CarrierAttachmentsRepository>(),
  );
}

describe('FleetService.getPlanistaFleet — role gating', () => {
  it.each([
    'przewoznik',
    'opiekun',
    'dyspozytor',
    'eksport',
    'weryfikator',
    'pracownik',
  ] as const)('rejects role=%s with 403', async (role) => {
    const svc = newSvc({ vehicles: [] });
    await expect(
      svc.getPlanistaFleet(makeAuth(role)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a planista caller', async () => {
    const svc = newSvc({ vehicles: [] });
    await expect(
      svc.getPlanistaFleet(makeAuth('planista', 'plan-self')),
    ).resolves.toEqual({ vehicles: [], drivers: [], trailers: [] });
  });
});

describe('FleetService.getPlanistaFleet — plannerId scoping', () => {
  it('forwards plannerId=user.sub and returns only own vehicles', async () => {
    const captured: { value?: VehicleListFilters } = {};
    const svc = newSvc({
      vehicles: [
        makeVehicle({ id: 'v-mine', plannerId: 'plan-self', carrierId: 'c-1' }),
        makeVehicle({ id: 'v-other', plannerId: 'plan-other', carrierId: 'c-2' }),
      ],
      drivers: [makeDriver({ id: 'd-1', carrierId: 'c-1' })],
      trailers: [makeTrailer({ id: 't-1', carrierId: 'c-1' })],
      capturedVehicles: captured,
    });
    const out = await svc.getPlanistaFleet(makeAuth('planista', 'plan-self'));
    expect(captured.value?.plannerId).toBe('plan-self');
    expect(out.vehicles.map((v) => v.id)).toEqual(['v-mine']);
    // Drivers/trailers derived from the surviving vehicle's carrier only.
    expect(out.drivers.map((d) => d.id)).toEqual(['d-1']);
    expect(out.trailers.map((t) => t.id)).toEqual(['t-1']);
  });

  it('derives the carrierIds union from the scoped vehicles (other carriers excluded)', async () => {
    const capturedDrivers: { value?: { carrierIds?: string[] } } = {};
    const svc = newSvc({
      vehicles: [
        makeVehicle({ id: 'v-1', plannerId: 'plan-self', carrierId: 'c-1' }),
        makeVehicle({ id: 'v-2', plannerId: 'plan-self', carrierId: 'c-2' }),
        // Belongs to another planner → must NOT contribute its carrier.
        makeVehicle({ id: 'v-3', plannerId: 'plan-other', carrierId: 'c-3' }),
      ],
      drivers: [
        makeDriver({ id: 'd-1', carrierId: 'c-1' }),
        makeDriver({ id: 'd-2', carrierId: 'c-2' }),
        makeDriver({ id: 'd-3', carrierId: 'c-3' }),
      ],
      capturedDrivers,
    });
    const out = await svc.getPlanistaFleet(makeAuth('planista', 'plan-self'));
    expect(capturedDrivers.value?.carrierIds?.sort()).toEqual(['c-1', 'c-2']);
    expect(out.drivers.map((d) => d.id).sort()).toEqual(['d-1', 'd-2']);
  });

  it('admin sees all vehicles (no plannerId scope)', async () => {
    const captured: { value?: VehicleListFilters } = {};
    const svc = newSvc({
      vehicles: [
        makeVehicle({ id: 'v-1', plannerId: 'plan-a', carrierId: 'c-1' }),
        makeVehicle({ id: 'v-2', plannerId: 'plan-b', carrierId: 'c-2' }),
      ],
      drivers: [
        makeDriver({ id: 'd-1', carrierId: 'c-1' }),
        makeDriver({ id: 'd-2', carrierId: 'c-2' }),
      ],
      capturedVehicles: captured,
    });
    const out = await svc.getPlanistaFleet(makeAuth('admin', 'admin-1'));
    expect(captured.value?.plannerId).toBeUndefined();
    expect(out.vehicles).toHaveLength(2);
    expect(out.drivers).toHaveLength(2);
  });

  it('returns the empty payload when the planista has no vehicles (no drivers/trailers query)', async () => {
    const capturedDrivers: { value?: { carrierIds?: string[] } } = {};
    const svc = newSvc({
      vehicles: [
        makeVehicle({ id: 'v-other', plannerId: 'someone-else', carrierId: 'c-1' }),
      ],
      drivers: [makeDriver({ id: 'd-1', carrierId: 'c-1' })],
      capturedDrivers,
    });
    const out = await svc.getPlanistaFleet(makeAuth('planista', 'plan-empty'));
    expect(out).toEqual({ vehicles: [], drivers: [], trailers: [] });
    // No vehicles → no carrier union → drivers/trailers repos never queried.
    expect(capturedDrivers.value).toBeUndefined();
  });

  it('maps vehicle rows to the slim list-item shape', async () => {
    const svc = newSvc({
      vehicles: [
        makeVehicle({
          id: 'v-1',
          plannerId: 'plan-self',
          plateNumber: 'PL9999',
          active: true,
          brand: 'Scania',
          model: 'R450',
          type: 'MEGA',
          sideNumber: 'SN-7',
        }),
      ],
    });
    const out = await svc.getPlanistaFleet(makeAuth('planista', 'plan-self'));
    expect(out.vehicles[0]).toEqual({
      id: 'v-1',
      plateNumber: 'PL9999',
      active: true,
      brand: 'Scania',
      model: 'R450',
      type: 'MEGA',
      sideNumber: 'SN-7',
    });
  });
});
