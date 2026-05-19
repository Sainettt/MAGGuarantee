import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarrierRow } from '../carriers/carriers.repository';
import { CarriersRepository } from '../carriers/carriers.repository';
import { UsersRepository, type UserRow } from '../users/users.repository';
import { VehiclesRepository, type VehicleRow } from './vehicles.repository';
import { VehiclesService } from './vehicles.service';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeVehicle(overrides: Partial<VehicleRow> = {}): VehicleRow {
  return {
    id: 'v-1',
    carrierId: 'c-1',
    plateNumber: 'WA0001',
    active: true,
    brand: null,
    model: null,
    year: null,
    notes: null,
    // Required post-phase3_blocks. `certificateL` was collapsed enum→boolean
    // in 20260515130307_vehicle_certificate_l_to_boolean.
    certificateL: true,
    euro: 'V',
    adrClasses: [],
    gps: false,
    fuelCard: false,
    type: 'STD',
    gb: null,
    it: null,
    fr: null,
    agreement: null,
    contract: null,
    rateDe: 0.5,
    rateUe: 0.5,
    rateExport: 0.5,
    rateImport: 0.5,
    wasteAllowed: false,
    wasteCountries: [],
    cabotageDe: false,
    cabotageFr: false,
    gpsMobilePhone: null,
    nextInspectionDate: null,
    sideNumber: null,
    lastDroveAt: null,
    plannerId: null,
    planner: null,
    dispatcherId: null,
    dispatcher: null,
    carrier: { id: 'c-1', login: 'pwz1', name: 'Pwz One' },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeCarrier(overrides: Partial<CarrierRow> = {}): CarrierRow {
  return {
    id: 'c-1',
    userId: 'u-c-1',
    login: 'pwz1',
    // Required post-phase3_blocks.
    email: 'carrier@magtrans.eu',
    name: 'Pwz One',
    company: null,
    active: true,
    nip: '0000000000',
    vatId: 'PL0000000000',
    contactPerson: 'Jan Kontakt',
    phone: '+48000000000',
    ordersEmail: 'zlecenia@example.com',
    accountEur: 'PL00 0000 0000 0000',
    accountPln: null,
    paymentTerms: 30,
    insuranceValue: 100000,
    insuranceExpiry: NOW,
    licenseExpiry: NOW,
    numberOfPermits: null,
    companyAddress: 'ul. Testowa 1',
    onboardingStatus: 'COMPLETE',
    opiekunId: 'op-fixture',
    opiekun: { id: 'op-fixture', login: 'op', name: null },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-pl-1',
    login: 'plan',
    email: 'plan@magtrans.eu',
    passwordHash: 'hash',
    role: 'planista',
    name: 'Plan',
    active: true,
    liderEmail: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeAuth(role: AuthUser['role'], sub = 'u-actor'): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
  };
}

function makeVehiclesRepo(seed: VehicleRow[] = []): VehiclesRepository {
  const rows = new Map<string, VehicleRow>();
  for (const r of seed) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    list: jest.fn(async (filters: { limit: number; carrierId?: string }) => {
      let arr = [...rows.values()];
      if (filters.carrierId)
        arr = arr.filter((r) => r.carrierId === filters.carrierId);
      return arr.slice(0, filters.limit + 1);
    }),
    create: jest.fn(async (data) => {
      // Composite unique (carrierId, plateNumber).
      if (
        [...rows.values()].some(
          (r) =>
            r.carrierId === data.carrierId && r.plateNumber === data.plateNumber,
        )
      ) {
        throw Object.assign(new Error('P2002'), {
          code: 'P2002',
          meta: { target: ['carrierId', 'plateNumber'] },
        });
      }
      const row = makeVehicle({
        id: `v-${rows.size + 1}`,
        carrierId: data.carrierId,
        plateNumber: data.plateNumber,
        plannerId: data.plannerId ?? null,
        dispatcherId: data.dispatcherId ?? null,
      });
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('not found');
      const next: VehicleRow = { ...cur, ...(patch as Partial<VehicleRow>) };
      rows.set(id, next);
      return next;
    }),
    setActive: jest.fn(async (id: string, active: boolean) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('not found');
      const next = { ...cur, active };
      rows.set(id, next);
      return next;
    }),
    softDelete: jest.fn(async (id: string) => {
      const cur = rows.get(id);
      if (cur) rows.set(id, { ...cur, deletedAt: NOW });
    }),
  } as unknown as VehiclesRepository;
}

function makeCarriersRepo(seed: CarrierRow[] = []): CarriersRepository {
  const rows = new Map<string, CarrierRow>();
  for (const r of seed) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    list: jest.fn(async (filters: { limit: number; opiekunId?: string }) => {
      let arr = [...rows.values()];
      if (filters.opiekunId)
        arr = arr.filter((r) => r.opiekunId === filters.opiekunId);
      return arr.slice(0, filters.limit + 1);
    }),
    // Onboarding-status advancement — mirrors `updateMany` semantics: only
    // moves the column forward if the current value is in `lowerStatuses`.
    advanceOnboardingStatus: jest.fn(
      async (
        id: string,
        next: CarrierRow['onboardingStatus'],
        lowerStatuses: CarrierRow['onboardingStatus'][],
      ) => {
        const cur = rows.get(id);
        if (!cur || !lowerStatuses.includes(cur.onboardingStatus)) return 0;
        rows.set(id, { ...cur, onboardingStatus: next });
        return 1;
      },
    ),
  } as unknown as CarriersRepository;
}

function makeUsersRepo(seed: UserRow[] = []): UsersRepository {
  const map = new Map<string, UserRow>();
  for (const u of seed) map.set(u.id, u);
  return {
    findById: jest.fn(async (id: string) => map.get(id) ?? null),
  } as unknown as UsersRepository;
}

/** Minimal payload required by the post-phase3_blocks schema. */
const REQUIRED_VEHICLE_FIELDS = {
  // `certificateL` is Boolean since
  // 20260515130307_vehicle_certificate_l_to_boolean — TAK = true, NIE = false.
  certificateL: true,
  euro: 'V' as const,
  type: 'STD' as const,
  // plannerId/dispatcherId are required (no .optional()); tests targeting
  // role rejection put `'u-x'` AFTER the spread to override these defaults.
  plannerId: 'u-pl',
  dispatcherId: 'u-dy',
  rateDe: 0.5,
  rateUe: 0.5,
  rateExport: 0.5,
  rateImport: 0.5,
};

/** Helper — valid planista/dyspozytor users to register in users-repo so the
 *  role check at lines 70-72 of vehicles.service passes for tests that
 *  aren't targeting the role-rejection path. */
function makeValidPeople(): UserRow[] {
  return [
    makeUser({ id: 'u-pl', role: 'planista' }),
    makeUser({ id: 'u-dy', role: 'dyspozytor' }),
  ];
}

describe('VehiclesService', () => {
  it('admin can create with valid plannerId/dispatcherId', async () => {
    const planner = makeUser({ id: 'u-pl', role: 'planista' });
    const disp = makeUser({ id: 'u-dy', role: 'dyspozytor' });
    const carrier = makeCarrier();
    const svc = new VehiclesService(
      makeVehiclesRepo(),
      makeUsersRepo([planner, disp]),
      makeCarriersRepo([carrier]),
    );
    const out = await svc.create(makeAuth('admin', 'a-1'), {
      carrierId: 'c-1',
      plateNumber: 'WA0002',
      gps: false,
      fuelCard: false,
      wasteAllowed: false,
      cabotageDe: false,
      cabotageFr: false,
      ...REQUIRED_VEHICLE_FIELDS,
    });
    expect(out.plateNumber).toBe('WA0002');
    expect(out.plannerId).toBe('u-pl');
  });

  it('rejects wrong role for plannerId (422)', async () => {
    const wrong = makeUser({ id: 'u-x', role: 'opiekun' });
    const svc = new VehiclesService(
      makeVehiclesRepo(),
      // Register a valid dispatcher so the dispatcher check would pass — the
      // failure must come from plannerId.
      makeUsersRepo([wrong, makeUser({ id: 'u-dy', role: 'dyspozytor' })]),
      makeCarriersRepo([makeCarrier()]),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        carrierId: 'c-1',
        plateNumber: 'WA0002',
        gps: false,
        fuelCard: false,
        wasteAllowed: false,
        cabotageDe: false,
        cabotageFr: false,
        ...REQUIRED_VEHICLE_FIELDS,
        // Override AFTER the spread so the wrong-role id wins.
        plannerId: 'u-x',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects wrong role for dispatcherId (422)', async () => {
    const wrong = makeUser({ id: 'u-x', role: 'opiekun' });
    const svc = new VehiclesService(
      makeVehiclesRepo(),
      // Register a valid planista so the planner check would pass — failure
      // must come from dispatcherId.
      makeUsersRepo([wrong, makeUser({ id: 'u-pl', role: 'planista' })]),
      makeCarriersRepo([makeCarrier()]),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        carrierId: 'c-1',
        plateNumber: 'WA0002',
        gps: false,
        fuelCard: false,
        wasteAllowed: false,
        cabotageDe: false,
        cabotageFr: false,
        ...REQUIRED_VEHICLE_FIELDS,
        // Override AFTER the spread so the wrong-role id wins.
        dispatcherId: 'u-x',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('translates duplicate (carrierId, plateNumber) into 409', async () => {
    const dup = makeVehicle({ carrierId: 'c-1', plateNumber: 'WA0001' });
    const svc = new VehiclesService(
      makeVehiclesRepo([dup]),
      makeUsersRepo(makeValidPeople()),
      makeCarriersRepo([makeCarrier()]),
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        carrierId: 'c-1',
        plateNumber: 'WA0001',
        gps: false,
        fuelCard: false,
        wasteAllowed: false,
        cabotageDe: false,
        cabotageFr: false,
        ...REQUIRED_VEHICLE_FIELDS,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('opiekun cannot write to a carrier they do not own', async () => {
    const carrier = makeCarrier({ id: 'c-other', opiekunId: 'op-2' });
    const svc = new VehiclesService(
      makeVehiclesRepo(),
      makeUsersRepo(makeValidPeople()),
      makeCarriersRepo([carrier]),
    );
    await expect(
      svc.create(makeAuth('opiekun', 'op-1'), {
        carrierId: 'c-other',
        plateNumber: 'WA0002',
        gps: false,
        fuelCard: false,
        wasteAllowed: false,
        cabotageDe: false,
        cabotageFr: false,
        ...REQUIRED_VEHICLE_FIELDS,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('przewoznik can create only on their own carrier', async () => {
    const carrier = makeCarrier({ id: 'c-mine', userId: 'u-self' });
    const svc = new VehiclesService(
      makeVehiclesRepo(),
      makeUsersRepo(makeValidPeople()),
      makeCarriersRepo([carrier]),
    );
    await expect(
      svc.create(makeAuth('przewoznik', 'u-self'), {
        carrierId: 'c-mine',
        plateNumber: 'WA0002',
        gps: false,
        fuelCard: false,
        wasteAllowed: false,
        cabotageDe: false,
        cabotageFr: false,
        ...REQUIRED_VEHICLE_FIELDS,
      }),
    ).resolves.toMatchObject({ plateNumber: 'WA0002' });
  });

  it('list for przewoznik forces carrierId=their own', async () => {
    const carrier = makeCarrier({ id: 'c-mine', userId: 'u-self' });
    const v1 = makeVehicle({ id: 'v-1', carrierId: 'c-mine' });
    const v2 = makeVehicle({ id: 'v-2', carrierId: 'c-other' });
    const svc = new VehiclesService(
      makeVehiclesRepo([v1, v2]),
      makeUsersRepo(),
      makeCarriersRepo([carrier]),
    );
    const out = await svc.list(makeAuth('przewoznik', 'u-self'), { limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]?.id).toBe('v-1');
  });

  it('getById 404 for missing vehicle', async () => {
    const svc = new VehiclesService(
      makeVehiclesRepo(),
      makeUsersRepo(),
      makeCarriersRepo(),
    );
    await expect(svc.getById('missing')).rejects.toThrow(NotFoundException);
  });

  it('deactivate flips active=false and rejects double-deactivate', async () => {
    const v = makeVehicle({ active: true });
    const svc = new VehiclesService(
      makeVehiclesRepo([v]),
      makeUsersRepo(),
      makeCarriersRepo(),
    );
    const out = await svc.deactivate(v.id);
    expect(out.active).toBe(false);
    await expect(svc.deactivate(v.id)).rejects.toThrow(ConflictException);
  });

  // ── Onboarding-status side-effect ────────────────────────
  // Wired in `VehiclesService.create` per the API contract: vehicle created
  // → bump carrier from PENDING_VEHICLE to PENDING_TRAILER, but never
  // regress an already-advanced carrier.

  it('advances carrier onboardingStatus PENDING_VEHICLE → PENDING_TRAILER', async () => {
    const carrier = makeCarrier({ onboardingStatus: 'PENDING_VEHICLE' });
    const carriersRepo = makeCarriersRepo([carrier]);
    const svc = new VehiclesService(
      makeVehiclesRepo(),
      makeUsersRepo(makeValidPeople()),
      carriersRepo,
    );
    await svc.create(makeAuth('admin', 'a-1'), {
      carrierId: 'c-1',
      plateNumber: 'WA9001',
      gps: false,
      fuelCard: false,
      wasteAllowed: false,
      cabotageDe: false,
      cabotageFr: false,
      ...REQUIRED_VEHICLE_FIELDS,
    });
    expect(carriersRepo.advanceOnboardingStatus).toHaveBeenCalledWith(
      'c-1',
      'PENDING_TRAILER',
      ['PENDING_VEHICLE'],
    );
    const after = await carriersRepo.findById('c-1');
    expect(after?.onboardingStatus).toBe('PENDING_TRAILER');
  });

  it('does NOT regress an already PENDING_DRIVER carrier', async () => {
    const carrier = makeCarrier({ onboardingStatus: 'PENDING_DRIVER' });
    const carriersRepo = makeCarriersRepo([carrier]);
    const svc = new VehiclesService(
      makeVehiclesRepo(),
      makeUsersRepo(makeValidPeople()),
      carriersRepo,
    );
    await svc.create(makeAuth('admin', 'a-1'), {
      carrierId: 'c-1',
      plateNumber: 'WA9002',
      gps: false,
      fuelCard: false,
      wasteAllowed: false,
      cabotageDe: false,
      cabotageFr: false,
      ...REQUIRED_VEHICLE_FIELDS,
    });
    const after = await carriersRepo.findById('c-1');
    expect(after?.onboardingStatus).toBe('PENDING_DRIVER');
  });

  it('does NOT regress an already COMPLETE carrier', async () => {
    const carrier = makeCarrier({ onboardingStatus: 'COMPLETE' });
    const carriersRepo = makeCarriersRepo([carrier]);
    const svc = new VehiclesService(
      makeVehiclesRepo(),
      makeUsersRepo(makeValidPeople()),
      carriersRepo,
    );
    await svc.create(makeAuth('admin', 'a-1'), {
      carrierId: 'c-1',
      plateNumber: 'WA9003',
      gps: false,
      fuelCard: false,
      wasteAllowed: false,
      cabotageDe: false,
      cabotageFr: false,
      ...REQUIRED_VEHICLE_FIELDS,
    });
    const after = await carriersRepo.findById('c-1');
    expect(after?.onboardingStatus).toBe('COMPLETE');
  });

  it('a 409 duplicate-plate failure does NOT advance onboardingStatus', async () => {
    const dup = makeVehicle({ carrierId: 'c-1', plateNumber: 'WA0001' });
    const carrier = makeCarrier({ onboardingStatus: 'PENDING_VEHICLE' });
    const carriersRepo = makeCarriersRepo([carrier]);
    const svc = new VehiclesService(
      makeVehiclesRepo([dup]),
      makeUsersRepo(makeValidPeople()),
      carriersRepo,
    );
    await expect(
      svc.create(makeAuth('admin', 'a-1'), {
        carrierId: 'c-1',
        plateNumber: 'WA0001',
        gps: false,
        fuelCard: false,
        wasteAllowed: false,
        cabotageDe: false,
        cabotageFr: false,
        ...REQUIRED_VEHICLE_FIELDS,
      }),
    ).rejects.toThrow(ConflictException);
    expect(carriersRepo.advanceOnboardingStatus).not.toHaveBeenCalled();
    const after = await carriersRepo.findById('c-1');
    expect(after?.onboardingStatus).toBe('PENDING_VEHICLE');
  });
});
