// Regression coverage for the preview endpoints exposed by ClaimsService.
//
// Locks in the multi-role contract of `previewForExisting` per
// docs/13-api-design.md (`POST /claims/:nrZgl/preview` row — admin /
// pracownik / przewoznik) after the carrier-only delegation bug:
// `previewForExisting` used to call `previewKmCalc(user, dto)`, which in turn
// called `_requireCarrierProfile(user)` → 403 for admin / pracownik. The fix
// extracts a pure math helper (`_runPreviewCalc`) and has both routes call
// it directly, while `previewKmCalc` keeps its carrier-only gate for the
// new-claim form path (`POST /claims/preview`).
//
// Style mirrors `claims.service.update.spec.ts`: hand-rolled fakes, no
// jest-mock-extended.

import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  KmCalcResult,
  PreviewClaimDto,
} from '@magguarantee/shared';

import type { AuditWriter } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type {
  CarrierRow,
  CarriersRepository,
} from '../carriers/carriers.repository';
import type {
  DelegationRow,
  DelegationsRepository,
} from '../delegations/delegations.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { KmCalcService } from '../km-calc/km-calc.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TrailersRepository } from '../trailers/trailers.repository';
import type { VehicleDailyKmRepository } from '../vehicles/vehicle-daily-km.repository';
import type {
  VehicleRow,
  VehiclesRepository,
} from '../vehicles/vehicles.repository';
import { ClaimsService } from './claims.service';
import type {
  ClaimRow,
  ClaimsRepository,
} from './claims.repository';
import type { NrZglService } from './nr-zgl.service';

// ─── fixtures ────────────────────────────────────────────────

const NOW = new Date('2026-05-15T10:00:00.000Z');

function makeAuth(
  role: AuthUser['role'],
  sub = 'u-actor',
): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
    mustChangePassword: false,
  };
}

function makeClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: 'claim-id-1',
    nrZgl: 'GWA/001/04/26',
    carrierId: 'c-1',
    carrier: { id: 'c-1', login: 'pwz1', name: 'Pwz One' },
    vehicleId: 'v-1',
    vehicle: { id: 'v-1', plateNumber: 'WX12345' },
    vehiclePlateSnapshot: 'WX12345',
    dateStart: new Date('2026-04-01T00:00:00.000Z'),
    dateEnd: new Date('2026-04-20T00:00:00.000Z'),
    timeFrom: '08:00',
    timeTo: '18:00',
    drivenDays: 20,
    mileage: 8_000,
    kmPerDay: 400,
    kmGuaranteed: 10_800,
    kmDifference: 2_800,
    paymentEur: 1_400,
    ratePerKmEffective: 0.5,
    breakdown: {
      totalDays: 20,
      rawTotalDays: 20,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
      breakdown: [],
    },
    status: 'NA_WERYFIKACJI',
    statusChangedAt: new Date('2026-04-21T08:00:00.000Z'),
    decidedById: null,
    decidedBy: null,
    comment: null,
    orderNumber: null,
    orderDate: null,
    authorizationRequired: false,
    authorizationDescription: null,
    authorizationToken: null,
    authorizationDecidedAt: null,
    amountRequested: 1_500,
    amountApproved: null,
    margin: null,
    amountMaximum: null,
    reklamacjaSubmitted: false,
    reklamacjaText: null,
    reklamacjaResponse: null,
    reklamacjaAmount: null,
    statusBeforeReklamacja: null,
    origDateStart: new Date('2026-04-01T00:00:00.000Z'),
    origDateEnd: new Date('2026-04-20T00:00:00.000Z'),
    origMileage: 8_000,
    origTimeFrom: '08:00',
    origTimeTo: '18:00',
    // Decimal(5,2) hours-adjustment columns post-migration — preview path
    // doesn't touch them, but the fake row must satisfy the new ClaimRow shape.
    origHoursAdjusted: 0,
    hoursAdjustedValue: 0,
    authScreenshotUrl: null,
    attachments: [],
    delegationId: null,
    delegationPlannedReturnAt: null,
    delegationActualReturnAt: null,
    periodAdjustedByVerifier: false,
    autoRecalcState: 'none',
    createdAt: new Date('2026-04-21T08:00:00.000Z'),
    updatedAt: new Date('2026-04-21T08:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeCarrier(overrides: Partial<CarrierRow> = {}): CarrierRow {
  return {
    id: 'c-1',
    userId: 'u-przewoznik-1',
    login: 'pwz1',
    email: 'p@example.com',
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
    insuranceValue: 100_000,
    insuranceExpiry: NOW,
    licenseExpiry: NOW,
    numberOfVehicle: null,
    companyAddress: 'ul. Testowa 1',
    counts: { vehicles: 1, trailers: 1, drivers: 1 },
    opiekunId: 'op-fixture',
    opiekun: { id: 'op-fixture', login: 'op', name: null },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<VehicleRow> = {}): VehicleRow {
  // Only the fields read by `_requireOwnedVehicle` are populated; the rest
  // are inert for the preview path. Cast through `unknown` because VehicleRow
  // tightened post-phase3 with many NOT NULL columns the preview never touches.
  return {
    id: 'v-1',
    carrierId: 'c-1',
    plateNumber: 'WX12345',
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  } as unknown as VehicleRow;
}

// Existing-claim / verifier inspection path (`POST /claims/:nrZgl/preview`):
// caller-supplied dates + an optional `vehicleId` for the mileage sum. No body
// `mileage` (Phase 7 §0″ finish — mileage is always the daily-km sum).
const PREVIEW_DTO: PreviewClaimDto = {
  vehicleId: 'v-1',
  dateStart: '2026-04-01',
  dateEnd: '2026-04-20',
  timeFrom: '08:00',
  timeTo: '18:00',
  hoursAdjusted: 0,
};

// ─── fakes ───────────────────────────────────────────────────

function makeClaimsRepo(seed: ClaimRow[] = []): ClaimsRepository {
  const rows = new Map<string, ClaimRow>();
  for (const r of seed) rows.set(r.nrZgl, r);
  return {
    findByNrZgl: jest.fn(async (nrZgl: string) => rows.get(nrZgl) ?? null),
  } as unknown as ClaimsRepository;
}

function makeCarriersRepo(seed: CarrierRow[] = []): CarriersRepository {
  return {
    list: jest.fn(async () => seed),
  } as unknown as CarriersRepository;
}

function makeVehiclesRepo(seed: VehicleRow[] = []): VehiclesRepository {
  const byId = new Map(seed.map((v) => [v.id, v] as const));
  return {
    findById: jest.fn(async (id: string) => byId.get(id) ?? null),
  } as unknown as VehiclesRepository;
}

function makeKmCalcService(): {
  svc: KmCalcService;
  calls: { input: unknown }[];
} {
  const calls: { input: unknown }[] = [];
  const result: KmCalcResult = {
    totalDays: 20,
    rawTotalDays: 20,
    kmGuaranteed: 10_800,
    ratePerKmEffective: 0.5,
    breakdown: [],
  };
  const svc = {
    calc: jest.fn(async (input: unknown) => {
      calls.push({ input });
      return result;
    }),
  } as unknown as KmCalcService;
  return { svc, calls };
}

function makePrismaService(): PrismaService {
  // Preview path doesn't open any transaction — it's a pure read + km-calc.
  // Pre-Phase-4.4 only needs `tx` on the surface; the older `$transaction`
  // wrapper is gone.
  const client = {
    user: { findFirst: jest.fn(async () => null) },
    carrier: { findFirst: jest.fn(async () => null) },
    vehicle: { findFirst: jest.fn(async () => null) },
    appConfig: { findMany: jest.fn(async () => []) },
  };
  return {
    client,
    get tx() {
      return client;
    },
  } as unknown as PrismaService;
}

function makeAuditWriter(): AuditWriter {
  return { log: jest.fn(async () => undefined) } as unknown as AuditWriter;
}

/**
 * Daily-km repo fake. Phase 7 §0″ finish — preview mileage is ALWAYS the
 * daily-km sum (no body override), so the existing-claim preview path needs
 * this injected to reproduce the `mileage: 8_000` the assertions expect.
 */
function makeDailyKmRepo(sum: number): VehicleDailyKmRepository {
  return {
    sumDroveKm: jest.fn(async () => sum),
  } as unknown as VehicleDailyKmRepository;
}

function makeService(
  claimsRepo: ClaimsRepository,
  carriersRepo: CarriersRepository,
  vehiclesRepo: VehiclesRepository,
  km: KmCalcService,
  dailyKm: VehicleDailyKmRepository = makeDailyKmRepo(8_000),
  delegations?: DelegationsRepository,
): ClaimsService {
  const noop = {} as unknown;
  return new ClaimsService(
    claimsRepo,
    carriersRepo,
    vehiclesRepo,
    noop as DriversRepository,
    noop as TrailersRepository,
    km,
    noop as NrZglService,
    makePrismaService(),
    makeAuditWriter(),
    undefined,
    undefined,
    dailyKm,
    // Phase 7 §0″ — delegation-derived preview path (`dto.delegationId`). When
    // omitted, the carrier new-claim preview falls back to the vehicleId/dates
    // path; the guarantee-gate cases below inject a stub so the delegation seam
    // (`_resolveDelegationContext`) is exercised.
    delegations,
  );
}

// ─── delegation-derived preview fixtures (guarantee gate) ────

/**
 * Minimal outing row for the carrier new-claim preview path. `agreement` on the
 * eager `vehicle` mini drives the guarantee gate in `_resolveDelegationContext`
 * (only `true` passes; `false`/`null` → 422 `VEHICLE_NOT_GUARANTEED`).
 */
function makeDelegationForPreview(
  agreement: boolean | null,
): DelegationRow {
  return {
    id: 'deleg-1',
    vehicleId: 'v-1',
    vehicle: {
      id: 'v-1',
      plateNumber: 'WX12345',
      agreement,
      plannerId: null,
      dispatchTeamId: null,
      dispatchTeam: null,
    },
    trailerId: 'trl-1',
    trailer: { id: 'trl-1', plateNumber: 'TR9999' },
    driverId: 'drv-1',
    driver: { id: 'drv-1', firstName: 'Jan', lastName: 'Kowalski' },
    carrierId: 'c-1',
    carrier: null,
    driverNameSnapshot: 'Jan Kowalski',
    driverPhoneSnapshot: '+48000000000',
    departureAt: new Date('2026-05-01T06:30:00.000Z'),
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: new Date('2026-05-09T00:00:00.000Z'),
    returnCountry: 'PL',
    returnPostalCode: '00-001',
    status: 'zjechal',
    actualReturnAt: new Date('2026-05-10T00:00:00.000Z'),
    reportedById: null,
    reportedBy: null,
    reportedAt: new Date('2026-04-30T08:00:00.000Z'),
    verifiedById: null,
    verifiedBy: null,
    verifiedAt: null,
    readyById: null,
    readyBy: null,
    readyAt: null,
    notes: null,
    claimId: null,
    createdAt: new Date('2026-04-30T08:00:00.000Z'),
    updatedAt: new Date('2026-04-30T08:00:00.000Z'),
    deletedAt: null,
  };
}

function makeDelegationsRepo(deleg: DelegationRow): DelegationsRepository {
  return {
    findById: jest.fn(async (_id: string) => deleg),
  } as unknown as DelegationsRepository;
}

// ─── tests ───────────────────────────────────────────────────

describe('ClaimsService.previewForExisting — multi-role gate', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('admin → returns calc payload (no carrier-profile lookup, no 403)', async () => {
    // Regression: this exact path used to throw 403 "Wymaga konta przewoźnika"
    // because previewForExisting delegated to previewKmCalc, which is
    // carrier-only. After the fix, admin must get the calc envelope back.
    const seeded = makeClaim();
    const claimsRepo = makeClaimsRepo([seeded]);
    const carriersRepo = makeCarriersRepo([]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    const svc = makeService(claimsRepo, carriersRepo, vehiclesRepo, km.svc);

    const out = await svc.previewForExisting(
      makeAuth('admin'),
      seeded.nrZgl,
      PREVIEW_DTO,
    );

    expect(out.kmGuaranteed).toBe(10_800);
    // 10_800 - 8_000 = 2_800
    expect(out.kmDifference).toBe(2_800);
    // 2_800 * 0.5 = 1_400.00
    expect(out.paymentEur).toBe(1_400);
    expect(out.ratePerKmEffective).toBe(0.5);
    expect(out.breakdown.totalDays).toBe(20);

    expect(km.calls).toHaveLength(1);
    // Critical: the admin path MUST NOT consult the carriers repo at all.
    expect(carriersRepo.list).not.toHaveBeenCalled();
    // Vehicle-ownership re-check is also skipped for admin — see comment in
    // previewForExisting().
    expect(vehiclesRepo.findById).not.toHaveBeenCalled();
  });

  it('pracownik → same multi-role contract as admin (calc payload, no 403)', async () => {
    const seeded = makeClaim();
    const claimsRepo = makeClaimsRepo([seeded]);
    const carriersRepo = makeCarriersRepo([]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    const svc = makeService(claimsRepo, carriersRepo, vehiclesRepo, km.svc);

    const out = await svc.previewForExisting(
      makeAuth('pracownik'),
      seeded.nrZgl,
      PREVIEW_DTO,
    );

    expect(out.paymentEur).toBe(1_400);
    expect(km.calls).toHaveLength(1);
    expect(carriersRepo.list).not.toHaveBeenCalled();
  });

  it('przewoznik owning the claim → calc payload (carrier path unbroken)', async () => {
    const carrier = makeCarrier();
    const seeded = makeClaim({ carrierId: carrier.id });
    const claimsRepo = makeClaimsRepo([seeded]);
    const carriersRepo = makeCarriersRepo([carrier]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    const svc = makeService(claimsRepo, carriersRepo, vehiclesRepo, km.svc);

    const out = await svc.previewForExisting(
      makeAuth('przewoznik', carrier.userId),
      seeded.nrZgl,
      PREVIEW_DTO,
    );

    expect(out.paymentEur).toBe(1_400);
    expect(km.calls).toHaveLength(1);
    // Carrier path DOES resolve the carrier profile (ownership check above
    // line 453 in the service).
    expect(carriersRepo.list).toHaveBeenCalledTimes(1);
  });

  it('przewoznik NOT owning the claim → 403 (existing ownership check intact)', async () => {
    const owningCarrier = makeCarrier({
      id: 'c-1',
      userId: 'u-owner',
    });
    const intruder = makeCarrier({
      id: 'c-other',
      userId: 'u-intruder',
      login: 'pwz-other',
    });
    const seeded = makeClaim({ carrierId: owningCarrier.id });
    const claimsRepo = makeClaimsRepo([seeded]);
    // The carriers list contains the intruder so `_requireCarrierProfile`
    // resolves them to `c-other`, which does NOT match `seeded.carrierId`.
    const carriersRepo = makeCarriersRepo([owningCarrier, intruder]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    const svc = makeService(claimsRepo, carriersRepo, vehiclesRepo, km.svc);

    await expect(
      svc.previewForExisting(
        makeAuth('przewoznik', intruder.userId),
        seeded.nrZgl,
        PREVIEW_DTO,
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(km.calls).toHaveLength(0);
  });

  it('claim not found → 404 for every role (no calc, no profile lookup)', async () => {
    const claimsRepo = makeClaimsRepo([]);
    const carriersRepo = makeCarriersRepo([]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    const svc = makeService(claimsRepo, carriersRepo, vehiclesRepo, km.svc);

    await expect(
      svc.previewForExisting(
        makeAuth('admin'),
        'GWA/999/04/26',
        PREVIEW_DTO,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(km.calls).toHaveLength(0);
  });
});

describe('ClaimsService.previewKmCalc — carrier-only entry point intact', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('carrier with owned vehicle → calc payload', async () => {
    const carrier = makeCarrier();
    const vehicle = makeVehicle({ carrierId: carrier.id });
    const claimsRepo = makeClaimsRepo([]);
    const carriersRepo = makeCarriersRepo([carrier]);
    const vehiclesRepo = makeVehiclesRepo([vehicle]);
    const km = makeKmCalcService();
    const svc = makeService(claimsRepo, carriersRepo, vehiclesRepo, km.svc);

    const out = await svc.previewKmCalc(
      makeAuth('przewoznik', carrier.userId),
      PREVIEW_DTO,
    );

    expect(out.paymentEur).toBe(1_400);
    expect(km.calls).toHaveLength(1);
    expect(vehiclesRepo.findById).toHaveBeenCalledWith(vehicle.id);
  });

  it('non-carrier role → 403 (defence-in-depth, controller already gates)', async () => {
    // The route is @Roles('przewoznik') in the controller, but the service
    // must still reject other roles in case it's invoked directly (tests,
    // future internal callers).
    const claimsRepo = makeClaimsRepo([]);
    const carriersRepo = makeCarriersRepo([]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    const svc = makeService(claimsRepo, carriersRepo, vehiclesRepo, km.svc);

    await expect(
      svc.previewKmCalc(makeAuth('admin'), PREVIEW_DTO),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      svc.previewKmCalc(makeAuth('pracownik'), PREVIEW_DTO),
    ).rejects.toThrow(ForbiddenException);

    expect(km.calls).toHaveLength(0);
  });
});

describe('ClaimsService.previewKmCalc — guarantee gate (delegation-derived path)', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // The carrier new-claim preview sends `delegationId` (no vehicleId/dates) and
  // hits `_resolveDelegationContext`, where the guarantee gate fires.
  const DELEGATION_PREVIEW_DTO: PreviewClaimDto = {
    delegationId: 'deleg-1',
    timeFrom: '08:00',
    timeTo: '18:00',
    hoursAdjusted: 0,
  };

  // Reads the single-code 422 envelope thrown by the guarantee gate.
  function readExtensionsCode(err: unknown): string | null {
    if (!(err instanceof UnprocessableEntityException)) return null;
    const body = err.getResponse() as { extensions?: { code?: unknown } };
    return typeof body.extensions?.code === 'string'
      ? body.extensions.code
      : null;
  }

  function makeGateService(
    agreement: boolean | null,
    km = makeKmCalcService(),
  ): { svc: ClaimsService; km: ReturnType<typeof makeKmCalcService> } {
    const carrier = makeCarrier();
    const claimsRepo = makeClaimsRepo([]);
    const carriersRepo = makeCarriersRepo([carrier]);
    // Eager relation carries `agreement`; the gate prefers it and never needs
    // the vehiclesRepo fallback here.
    const vehiclesRepo = makeVehiclesRepo([]);
    const delegations = makeDelegationsRepo(makeDelegationForPreview(agreement));
    const svc = makeService(
      claimsRepo,
      carriersRepo,
      vehiclesRepo,
      km.svc,
      makeDailyKmRepo(8_000),
      delegations,
    );
    return { svc, km };
  }

  it('vehicle agreement=false → 422 VEHICLE_NOT_GUARANTEED, no km-calc', async () => {
    const { svc, km } = makeGateService(false);
    let caught: unknown;
    try {
      await svc.previewKmCalc(
        makeAuth('przewoznik', makeCarrier().userId),
        DELEGATION_PREVIEW_DTO,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect(readExtensionsCode(caught)).toBe('VEHICLE_NOT_GUARANTEED');
    // Gate fires before the math — km-calc must not have run.
    expect(km.calls).toHaveLength(0);
  });

  it('vehicle agreement=null → same 422 (null treated as not guaranteed)', async () => {
    const { svc, km } = makeGateService(null);
    let caught: unknown;
    try {
      await svc.previewKmCalc(
        makeAuth('przewoznik', makeCarrier().userId),
        DELEGATION_PREVIEW_DTO,
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect(readExtensionsCode(caught)).toBe('VEHICLE_NOT_GUARANTEED');
    expect(km.calls).toHaveLength(0);
  });

  it('vehicle agreement=true → passes the gate, reaches km-calc', async () => {
    const { svc, km } = makeGateService(true);
    const out = await svc.previewKmCalc(
      makeAuth('przewoznik', makeCarrier().userId),
      DELEGATION_PREVIEW_DTO,
    );
    // Guaranteed → the normal preview math runs and returns a payload.
    expect(km.calls).toHaveLength(1);
    expect(out.paymentEur).toBe(1_400);
  });
});
