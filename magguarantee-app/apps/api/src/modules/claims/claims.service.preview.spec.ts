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
  BoardDay,
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
      firstDay: null,
      lastDay: null,
      // Settlement fields (2026-09-20): every month of this fixture has its
      // guarantee ON, so the active day count equals the total.
      daysActive: 20,
      daysTotal: 20,
    },
    status: 'NA_WERYFIKACJI',
    statusChangedAt: new Date('2026-04-21T08:00:00.000Z'),
    decidedById: null,
    decidedBy: null,
    verifiedAt: null,
    verifiedById: null,
    verifiedBy: null,
    comment: null,
    orderNumber: null,
    orderDate: null,
    amountApproved: null,
    reklamacjaSubmitted: false,
    reklamacjaText: null,
    reklamacjaResponse: null,
    reklamacjaAmount: null,
    // Reklamacja decision columns (REWORK 2026-07-31) — default "no reklamacja".
    reklamacjaResolution: null,
    reklamacjaOrderNumber: null,
    reklamacjaSubmittedAt: null,
    reklamacjaDecidedAt: null,
    reklamacjaDecidedById: null,
    statusBeforeReklamacja: null,
    origDateStart: new Date('2026-04-01T00:00:00.000Z'),
    origDateEnd: new Date('2026-04-20T00:00:00.000Z'),
    origMileage: 8_000,
    origPaymentEur: 1_400,
    origTimeFrom: '08:00',
    origTimeTo: '18:00',
    // Decimal(5,2) hours-adjustment columns post-migration — preview path
    // doesn't touch them, but the fake row must satisfy the new ClaimRow shape.
    origHoursAdjusted: 0,
    hoursAdjustedValue: 0,
    maksimGateRequired: false,
    maksimGateNotifiedAt: null,
    maksimGateNotifiedAmount: null,
    maksimGateClearedAt: null,
    maksimGateClearedById: null,
    attachments: [],
    delegationId: null,
    delegationDepartureAt: null,
    delegationActualDepartureAt: null,
    delegationPlannedReturnAt: null,
    delegationActualReturnAt: null,
    delegationStatus: null,
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
    firstDay: { date: '2026-04-01', fraction: 0.67 },
    lastDay: { date: '2026-04-20', fraction: 0.75 },
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
    delegation: { findFirst: jest.fn(async () => null) },
    vehiclePlannerAssignment: { findMany: jest.fn(async () => []) },
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
 * Daily-km repo fake. `sumDroveKm` backs the bare-vehicle preview fallback;
 * `listBoardDays` returns the board rows a MIXED period is settled on
 * (docs/20 §0⁵). An all-active period must never call the latter.
 */
function makeDailyKmRepo(
  sum: number,
  board: BoardDay[] = [],
): VehicleDailyKmRepository {
  return {
    sumDroveKm: jest.fn(async () => sum),
    listBoardDays: jest.fn(async () => board),
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
      // Km-guarantee rates on the delegation vehicle mini (unused by preview;
      // present so the widened `DelegationRow.vehicle` shape type-checks).
      rateDe: null,
      rateUe: null,
      rateExport: null,
      rateImport: null,
      plannerId: null,
      dispatchTeamId: null,
      dispatchTeam: null,
      planner: null,
    },
    plannerId: null,
    planner: null,
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
    // `actualDepartureAt` null → derived `timeFrom` falls back to `departureAt`
    // ("06:30"); `actualReturnAt` carries a real time → derived `timeTo` "14:30".
    actualDepartureAt: null,
    actualReturnAt: new Date('2026-05-10T14:30:00.000Z'),
    reportedById: null,
    reportedBy: null,
    reportedAt: new Date('2026-04-30T08:00:00.000Z'),
    verifiedById: null,
    verifiedBy: null,
    verifiedAt: null,
    readyById: null,
    readyBy: null,
    readyAt: null,
    spedOrderNumber: null,
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
    // The preview must surface the engine's boundary-day credited fractions so
    // the web "Miesiąc" block can render "ile z pierwszego / ostatniego dnia".
    expect(out.breakdown.firstDay).toEqual({ date: '2026-04-01', fraction: 0.67 });
    expect(out.breakdown.lastDay).toEqual({ date: '2026-04-20', fraction: 0.75 });

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

describe('ClaimsService.previewForExisting — verifier mileage override', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // Existing-claim / verifier inspection preview WITH a caller-supplied
  // `mileage`. On the verifier path this REPLACES the daily-km sum so the
  // ClaimModal's live dopłata / RecalcBadge / accept-gate track a km edit before
  // the PATCH commits (the bug fix). On the carrier path it is IGNORED.
  const OVERRIDE_DTO: PreviewClaimDto = {
    vehicleId: 'v-1',
    dateStart: '2026-04-01',
    dateEnd: '2026-04-20',
    hoursAdjusted: 0,
    // Override differs from the daily-km sum fake (8_000) so we can tell which
    // one drove the math.
    mileage: 5_000,
  };

  it('pracownik supplying mileage → override drives kmDifference / paymentEur (sum ignored)', async () => {
    const seeded = makeClaim();
    const claimsRepo = makeClaimsRepo([seeded]);
    const carriersRepo = makeCarriersRepo([]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    // The daily-km repo would return 8_000, but the verifier override must win.
    const dailyKm = makeDailyKmRepo(8_000);
    const svc = makeService(
      claimsRepo,
      carriersRepo,
      vehiclesRepo,
      km.svc,
      dailyKm,
    );

    const out = await svc.previewForExisting(
      makeAuth('pracownik'),
      seeded.nrZgl,
      OVERRIDE_DTO,
    );

    // Override mileage 5_000 (NOT the daily-km sum 8_000).
    expect(out.mileage).toBe(5_000);
    // kmDifference = 10_800 - 5_000 = 5_800
    expect(out.kmDifference).toBe(5_800);
    // paymentEur = 5_800 * 0.5 = 2_900.00
    expect(out.paymentEur).toBe(2_900);
    // The board total is read exactly once — for the separate staff-only
    // `boardSumKm` hint — and never feeds `mileage` or the price.
    expect(out.boardSumKm).toBe(8_000);
    expect(dailyKm.sumDroveKm).toHaveBeenCalledTimes(1);
  });

  it('admin supplying mileage → same override contract as pracownik', async () => {
    const seeded = makeClaim();
    const claimsRepo = makeClaimsRepo([seeded]);
    const carriersRepo = makeCarriersRepo([]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    const dailyKm = makeDailyKmRepo(8_000);
    const svc = makeService(
      claimsRepo,
      carriersRepo,
      vehiclesRepo,
      km.svc,
      dailyKm,
    );

    const out = await svc.previewForExisting(
      makeAuth('admin'),
      seeded.nrZgl,
      OVERRIDE_DTO,
    );

    expect(out.mileage).toBe(5_000);
    expect(out.paymentEur).toBe(2_900);
    // Board read once, for `boardSumKm` only (see the pracownik case above).
    expect(out.boardSumKm).toBe(8_000);
    expect(dailyKm.sumDroveKm).toHaveBeenCalledTimes(1);
  });

  it('przewoznik supplying mileage → override IGNORED, the claim\'s own mileage used', async () => {
    // A carrier inspecting a SUBMITTED claim cannot re-price it by sending a
    // different mileage: the figure it declared at submit is what the preview
    // shows. (Changing the number is what a reklamacja is for.)
    const carrier = makeCarrier();
    const seeded = makeClaim({ carrierId: carrier.id });
    const claimsRepo = makeClaimsRepo([seeded]);
    const carriersRepo = makeCarriersRepo([carrier]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    const dailyKm = makeDailyKmRepo(8_000);
    const svc = makeService(
      claimsRepo,
      carriersRepo,
      vehiclesRepo,
      km.svc,
      dailyKm,
    );

    const out = await svc.previewForExisting(
      makeAuth('przewoznik', carrier.userId),
      seeded.nrZgl,
      OVERRIDE_DTO,
    );

    // Override dropped — mileage is the claim's persisted 8_000, NOT 5_000.
    expect(out.mileage).toBe(8_000);
    // kmDifference = 10_800 - 8_000 = 2_800 → paymentEur = 1_400.
    expect(out.kmDifference).toBe(2_800);
    expect(out.paymentEur).toBe(1_400);
    // The daily-km board is the weryfikator's reference, never a claim's
    // mileage source (REWORK 2026-07-30) — it must not be read here.
    expect(dailyKm.sumDroveKm).not.toHaveBeenCalled();
  });
});

describe('ClaimsService.previewForExisting — verifier time override (live-recalc of unsaved edits)', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // Existing-claim preview WITH caller-supplied timeFrom/timeTo. On the VERIFIER
  // path these DRIVE the live km-calc so the ClaimModal's dopłata / HoursReadout
  // reflect a pracownik's UNSAVED «godz. zjazdu/przyjazdu» edit before the PATCH
  // commits. On the carrier path they are ignored (same gate as mileage). Differ
  // from the persisted claim's 08:00/18:00 so we can tell which window won.
  const TIME_DTO: PreviewClaimDto = {
    vehicleId: 'v-1',
    dateStart: '2026-04-01',
    dateEnd: '2026-04-20',
    hoursAdjusted: 0,
    timeFrom: '09:30',
    timeTo: '20:15',
  };

  it('pracownik supplying timeFrom/timeTo → km-calc uses them (unsaved edit live-recalc)', async () => {
    const seeded = makeClaim();
    const km = makeKmCalcService();
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      km.svc,
    );
    await svc.previewForExisting(makeAuth('pracownik'), seeded.nrZgl, TIME_DTO);
    const input = km.calls[0]!.input as { timeFrom: string; timeTo: string };
    expect(input.timeFrom).toBe('09:30');
    expect(input.timeTo).toBe('20:15');
  });

  it('admin OMITTING timeFrom/timeTo → km-calc falls back to the persisted claim times', async () => {
    // makeClaim persists timeFrom '08:00', timeTo '18:00'. PREVIEW_DTO carries no
    // times → the persisted window drives the math.
    const seeded = makeClaim();
    const km = makeKmCalcService();
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      km.svc,
    );
    await svc.previewForExisting(makeAuth('admin'), seeded.nrZgl, PREVIEW_DTO);
    const input = km.calls[0]!.input as { timeFrom: string; timeTo: string };
    expect(input.timeFrom).toBe('08:00');
    expect(input.timeTo).toBe('18:00');
  });

  it('przewoznik supplying timeFrom/timeTo → override IGNORED, persisted claim times used', async () => {
    // The carrier reklamacja-inspection path must NOT override times — same
    // "no carrier override" invariant as mileage.
    const carrier = makeCarrier();
    const seeded = makeClaim({ carrierId: carrier.id });
    const km = makeKmCalcService();
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([carrier]),
      makeVehiclesRepo([]),
      km.svc,
    );
    await svc.previewForExisting(
      makeAuth('przewoznik', carrier.userId),
      seeded.nrZgl,
      TIME_DTO,
    );
    const input = km.calls[0]!.input as { timeFrom: string; timeTo: string };
    expect(input.timeFrom).toBe('08:00');
    expect(input.timeTo).toBe('18:00');
  });
});

describe('ClaimsService.previewKmCalc — carrier path prices the declared facts', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('prices the carrier-declared time window (response + km-calc), not the outing actuals', async () => {
    // REWORK 2026-07-30 — the live preview must show what submit will persist,
    // and submit persists what the carrier typed.
    const carrier = makeCarrier();
    const km = makeKmCalcService();
    const svc = makeService(
      makeClaimsRepo([]),
      makeCarriersRepo([carrier]),
      makeVehiclesRepo([]),
      km.svc,
      makeDailyKmRepo(8_000),
      makeDelegationsRepo(makeDelegationForPreview(true)),
    );
    const dto: PreviewClaimDto = {
      delegationId: 'deleg-1',
      hoursAdjusted: 0,
      dateStart: '2026-04-01',
      dateEnd: '2026-04-20',
      // The outing's actuals say 06:30 / 14:30 — the carrier says otherwise.
      timeFrom: '23:00',
      timeTo: '23:59',
      mileage: 8_000,
    };
    const out = await svc.previewKmCalc(
      makeAuth('przewoznik', carrier.userId),
      dto,
    );
    expect(out.timeFrom).toBe('23:00');
    expect(out.timeTo).toBe('23:59');
    const input = km.calls[0]!.input as { timeFrom: string; timeTo: string };
    expect(input.timeFrom).toBe('23:00');
    expect(input.timeTo).toBe('23:59');
  });

  it('prices the carrier-declared mileage; the daily-km board is not consulted', async () => {
    const carrier = makeCarrier();
    const claimsRepo = makeClaimsRepo([]);
    const carriersRepo = makeCarriersRepo([carrier]);
    const vehiclesRepo = makeVehiclesRepo([]);
    const km = makeKmCalcService();
    // Board says 8_000 — deliberately different from what the carrier declares.
    const dailyKm = makeDailyKmRepo(8_000);
    const delegations = makeDelegationsRepo(makeDelegationForPreview(true));
    const svc = makeService(
      claimsRepo,
      carriersRepo,
      vehiclesRepo,
      km.svc,
      dailyKm,
      delegations,
    );

    const dto: PreviewClaimDto = {
      delegationId: 'deleg-1',
      hoursAdjusted: 0,
      dateStart: '2026-04-01',
      dateEnd: '2026-04-20',
      timeFrom: '06:30',
      timeTo: '14:30',
      mileage: 5_000,
    };

    const out = await svc.previewKmCalc(
      makeAuth('przewoznik', carrier.userId),
      dto,
    );

    // kmDifference = 10_800 - 5_000 = 5_800 → paymentEur = 2_900.
    expect(out.mileage).toBe(5_000);
    expect(out.paymentEur).toBe(2_900);
    // All-active period ⇒ the board is not read at all.
    expect(dailyKm.sumDroveKm).not.toHaveBeenCalled();
    expect(dailyKm.listBoardDays).not.toHaveBeenCalled();
    expect(out.breakdown.mileageSource).toBe('declared');
  });
});

describe('ClaimsService.previewKmCalc — guarantee gate (delegation-derived path)', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // The carrier new-claim preview sends `delegationId` + its own declared facts
  // and hits `_resolveDelegationContext`, where the guarantee gate fires.
  const DELEGATION_PREVIEW_DTO: PreviewClaimDto = {
    delegationId: 'deleg-1',
    hoursAdjusted: 0,
    dateStart: '2026-05-01',
    dateEnd: '2026-05-10',
    timeFrom: '06:30',
    timeTo: '14:30',
    mileage: 8_000,
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

  it('echoes back the priced period + time window and the derived vehicle context', async () => {
    // REWORK 2026-07-30 — the period/time window in the response are now an
    // ECHO of what the carrier sent (so the form can assert it is showing
    // numbers for the values it typed). The vehicle/trailer/driver block is the
    // part that is still genuinely derived from the outing.
    const { svc } = makeGateService(true);
    const out = await svc.previewKmCalc(
      makeAuth('przewoznik', makeCarrier().userId),
      DELEGATION_PREVIEW_DTO,
    );
    expect(out.dateStart).toBe('2026-05-01');
    expect(out.dateEnd).toBe('2026-05-10');
    expect(out.timeFrom).toBe('06:30');
    expect(out.timeTo).toBe('14:30');
    // The read-only vehicle/trailer/driver context is present on this path.
    expect(out.delegationContext?.vehiclePlate).toBe('WX12345');
    // The removed soft-warning field is gone.
    expect(
      (out as { delegationWarning?: unknown }).delegationWarning,
    ).toBeUndefined();
  });
});

// ── Limits freeze (feature «wyłączane limity gwarancji», 2026-09-20) ──

describe('preview — limits snapshot', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const SNAPSHOT_BREAKDOWN = {
    totalDays: 20,
    rawTotalDays: 20,
    kmGuaranteed: 10_800,
    ratePerKmEffective: 0.5,
    breakdown: [
      {
        yearMonth: '2026-04',
        workingDays: 20,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 10_800,
        saturdayDays: [],
        excludedDays: [],
      },
    ],
    firstDay: null,
    lastDay: null,
    daysActive: 20,
    daysTotal: 20,
  };

  it('EXISTING wniosek: the preview prices the snapshot, so it matches what PATCH will persist', async () => {
    const seeded = makeClaim({ breakdown: SNAPSHOT_BREAKDOWN });
    const km = makeKmCalcService();
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      km.svc,
    );

    await svc.previewForExisting(makeAuth('pracownik'), seeded.nrZgl, PREVIEW_DTO);

    const input = km.calls[0]!.input as {
      limitsSnapshot?: Record<string, unknown>;
    };
    expect(input.limitsSnapshot).toEqual({
      '2026-04': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
    });
  });

  it('CARRIER new-claim path: no snapshot exists yet → live limits', async () => {
    const carrier = makeCarrier();
    const km = makeKmCalcService();
    const svc = makeService(
      makeClaimsRepo([]),
      makeCarriersRepo([carrier]),
      makeVehiclesRepo([]),
      km.svc,
      makeDailyKmRepo(8_000),
      makeDelegationsRepo(makeDelegationForPreview(true)),
    );

    await svc.previewKmCalc(makeAuth('przewoznik', carrier.userId), {
      delegationId: 'deleg-1',
      hoursAdjusted: 0,
      dateStart: '2026-04-01',
      dateEnd: '2026-04-20',
      timeFrom: '06:30',
      timeTo: '14:30',
      mileage: 8_000,
    });

    const input = km.calls[0]!.input as {
      limitsSnapshot?: Record<string, unknown>;
    };
    expect(input.limitsSnapshot).toBeUndefined();
  });

  it('legacy wniosek without a breakdown → live limits (no snapshot to apply)', async () => {
    const seeded = makeClaim({ breakdown: null });
    const km = makeKmCalcService();
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      km.svc,
    );

    await svc.previewForExisting(makeAuth('admin'), seeded.nrZgl, PREVIEW_DTO);

    const input = km.calls[0]!.input as {
      limitsSnapshot?: Record<string, unknown>;
    };
    expect(input.limitsSnapshot).toBeUndefined();
  });
});

// ── Mixed period settled on the daily-km board (docs/20 §0⁵) ─────────

describe('preview — mixed period settled on the daily-km board', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // The spec example: 21.08–18.09.2025, August switched off (7 counted days),
  // September on (14 × 540 = 7560 km @ 0.50 €/km).
  const MIXED_RESULT: KmCalcResult = {
    totalDays: 21,
    rawTotalDays: 21,
    kmGuaranteed: 7_560,
    ratePerKmEffective: 0.5,
    breakdown: [
      {
        yearMonth: '2025-08',
        workingDays: 7,
        kmPerDay: 0,
        ratePerKm: 0.5,
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 0,
        saturdayDays: [],
        excludedDays: [],
      },
      {
        yearMonth: '2025-09',
        workingDays: 14,
        kmPerDay: 540,
        ratePerKm: 0.5,
        saturdaysCounted: 0,
        kmPerSaturday: 0,
        kmFromSaturdays: 0,
        kmInMonth: 7_560,
        saturdayDays: [],
        excludedDays: [],
      },
    ],
    firstDay: null,
    lastDay: null,
  };

  const MIXED_DTO: PreviewClaimDto = {
    dateStart: '2025-08-21',
    dateEnd: '2025-09-18',
    hoursAdjusted: 0,
  };

  /** Every September day 01..18 on the board: `totalKm` on the 1st, the rest idle. */
  function septemberBoard(totalKm: number, missing: readonly string[] = []): BoardDay[] {
    const rows: BoardDay[] = [];
    for (let d = 1; d <= 18; d += 1) {
      const date = `2025-09-${d < 10 ? `0${d}` : d}`;
      if (missing.includes(date)) continue;
      rows.push(
        d === 1
          ? { date, state: 'drove', km: totalKm }
          : { date, state: 'idle', km: null },
      );
    }
    return rows;
  }

  function makeMixedKmCalc(): { svc: KmCalcService; calls: { input: unknown }[] } {
    const calls: { input: unknown }[] = [];
    const svc = {
      calc: jest.fn(async (input: unknown) => {
        calls.push({ input });
        return MIXED_RESULT;
      }),
    } as unknown as KmCalcService;
    return { svc, calls };
  }

  it('pracownik: pays on the board (not on the declared mileage) and gets the per-month boardSettlement', async () => {
    const seeded = makeClaim({ mileage: 6_000 });
    const dailyKm = makeDailyKmRepo(0, septemberBoard(2_000));
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      makeMixedKmCalc().svc,
      dailyKm,
    );

    const out = await svc.previewForExisting(
      makeAuth('pracownik'),
      seeded.nrZgl,
      MIXED_DTO,
    );

    // The declared figure is still echoed …
    expect(out.mileage).toBe(6_000);
    // … but the payout follows the board: 7_560 − 2_000 = 5_560 ⇒ 2_780 €.
    expect(out.kmDifference).toBe(5_560);
    expect(out.paymentEur).toBe(2_780);
    expect(out.breakdown.mileageSource).toBe('board');
    expect(out.breakdown.mileageEffective).toBe(2_000);
    expect(out.boardSettlement).toEqual({
      mileageEffective: 2_000,
      kmDifference: 5_560,
      paymentEur: 2_780,
      months: [
        {
          yearMonth: '2025-08',
          mode: 'off',
          km: 0,
          daysFilled: 0,
          daysRequired: 0,
          missingDates: [],
        },
        {
          yearMonth: '2025-09',
          mode: 'active',
          km: 2_000,
          daysFilled: 18,
          daysRequired: 18,
          missingDates: [],
        },
      ],
      missingDates: [],
      complete: true,
    });
    // ONE board read, for the claim's vehicle, over [dateStart, dateEnd + 1d).
    expect(dailyKm.listBoardDays).toHaveBeenCalledTimes(1);
    expect(dailyKm.listBoardDays).toHaveBeenCalledWith(
      'v-1',
      new Date('2025-08-21T00:00:00.000Z'),
      new Date('2025-09-19T00:00:00.000Z'),
    );
  });

  it('pracownik: a day missing in the active month is listed, the preview still prices', async () => {
    const seeded = makeClaim();
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      makeMixedKmCalc().svc,
      makeDailyKmRepo(0, septemberBoard(2_000, ['2025-09-18'])),
    );

    const out = await svc.previewForExisting(
      makeAuth('admin'),
      seeded.nrZgl,
      MIXED_DTO,
    );

    expect(out.boardSettlement?.complete).toBe(false);
    expect(out.boardSettlement?.missingDates).toEqual(['2025-09-18']);
    expect(out.paymentEur).toBe(2_780);
  });

  it('przewoznik (reklamacja inspection): same board-based price, but NO boardSettlement', async () => {
    const carrier = makeCarrier();
    const seeded = makeClaim({ carrierId: carrier.id });
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([carrier]),
      makeVehiclesRepo([]),
      makeMixedKmCalc().svc,
      makeDailyKmRepo(0, septemberBoard(2_000)),
    );

    const out = await svc.previewForExisting(
      makeAuth('przewoznik', carrier.userId),
      seeded.nrZgl,
      MIXED_DTO,
    );

    expect(out.paymentEur).toBe(2_780);
    expect('boardSettlement' in out).toBe(false);
  });

  it('carrier new-claim path: reads the OUTING vehicle\'s board, never returns boardSettlement', async () => {
    const carrier = makeCarrier();
    const dailyKm = makeDailyKmRepo(0, septemberBoard(5_500));
    const svc = makeService(
      makeClaimsRepo([]),
      makeCarriersRepo([carrier]),
      makeVehiclesRepo([]),
      makeMixedKmCalc().svc,
      dailyKm,
      makeDelegationsRepo(makeDelegationForPreview(true)),
    );

    const out = await svc.previewKmCalc(makeAuth('przewoznik', carrier.userId), {
      delegationId: 'deleg-1',
      hoursAdjusted: 0,
      dateStart: '2025-08-21',
      dateEnd: '2025-09-18',
      timeFrom: '06:30',
      timeTo: '14:30',
      mileage: 6_000,
    });

    // 7_560 − 5_500 = 2_060 ⇒ 1_030 €.
    expect(out.paymentEur).toBe(1_030);
    expect(dailyKm.listBoardDays).toHaveBeenCalledWith(
      'v-1',
      new Date('2025-08-21T00:00:00.000Z'),
      new Date('2025-09-19T00:00:00.000Z'),
    );
    expect('boardSettlement' in out).toBe(false);
  });

  it('all-active period: the board is never queried and staff get boardSettlement = null', async () => {
    const seeded = makeClaim();
    const dailyKm = makeDailyKmRepo(8_000);
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      makeKmCalcService().svc,
      dailyKm,
    );

    const out = await svc.previewForExisting(
      makeAuth('pracownik'),
      seeded.nrZgl,
      PREVIEW_DTO,
    );

    expect(out.boardSettlement).toBeNull();
    expect(out.breakdown.mileageSource).toBe('declared');
    expect(dailyKm.listBoardDays).not.toHaveBeenCalled();
  });

  // ── GET /claims/:nrZgl — the live board settlement on the detail view ──

  /** A wniosek STORED as a mixed period, with a 3 h korekta applied. */
  function storedMixedClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
    return makeClaim({
      dateStart: new Date('2025-08-21T00:00:00.000Z'),
      dateEnd: new Date('2025-09-18T00:00:00.000Z'),
      mileage: 6_000,
      hoursAdjustedValue: 3,
      breakdown: {
        totalDays: 21,
        rawTotalDays: 21,
        kmGuaranteed: 7_560,
        ratePerKmEffective: 0.5,
        breakdown: MIXED_RESULT.breakdown,
        firstDay: null,
        lastDay: null,
        daysActive: 14,
        daysTotal: 21,
        mileageEffective: 0,
        mileageSource: 'board',
      },
      ...overrides,
    });
  }

  it('getOne (pracownik): boardSettlement priced from the STORED period, times, korekta and limits snapshot', async () => {
    const seeded = storedMixedClaim();
    const km = makeMixedKmCalc();
    const dailyKm = makeDailyKmRepo(0, septemberBoard(2_000, ['2025-09-18']));
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      km.svc,
      dailyKm,
    );

    const out = await svc.getOne(makeAuth('pracownik'), seeded.nrZgl);

    const input = km.calls[0]!.input as {
      dateStart: string;
      dateEnd: string;
      timeFrom: string;
      timeTo: string;
      hoursAdjusted: number;
      limitsSnapshot?: Record<string, unknown>;
    };
    expect(input).toMatchObject({
      dateStart: '2025-08-21',
      dateEnd: '2025-09-18',
      timeFrom: '08:00',
      timeTo: '18:00',
      hoursAdjusted: 3,
    });
    expect(input.limitsSnapshot).toEqual({
      '2025-08': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
      '2025-09': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
    });
    expect(out.boardSettlement).toMatchObject({
      mileageEffective: 2_000,
      paymentEur: 2_780,
      missingDates: ['2025-09-18'],
      complete: false,
    });
    // The stored row itself is returned untouched — the live block is extra.
    expect(out.paymentEur).toBe(seeded.paymentEur);
  });

  it('getOne (opiekun, even of the carrier): 403 — no claims access, nothing priced', async () => {
    // Decision 2026-10-22 (docs/03-roles.md#opiekun): opiekun sees no wnioski
    // at all, so it must not get the live boardSettlement either. The fixture
    // carrier IS supervised by this opiekun (`opiekunId` = the caller) — the
    // refusal is role-based, not ownership-based.
    const seeded = storedMixedClaim();
    const carriersRepo = makeCarriersRepo([
      makeCarrier({ opiekunId: 'u-opiekun' }),
    ]);
    const km = makeMixedKmCalc();
    const dailyKm = makeDailyKmRepo(0, septemberBoard(2_000));
    const svc = makeService(
      makeClaimsRepo([seeded]),
      carriersRepo,
      makeVehiclesRepo([]),
      km.svc,
      dailyKm,
    );

    await expect(
      svc.getOne(makeAuth('opiekun', 'u-opiekun'), seeded.nrZgl),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(km.calls).toHaveLength(0);
    expect(dailyKm.listBoardDays).not.toHaveBeenCalled();
    expect(carriersRepo.list).not.toHaveBeenCalled();
  });

  it('getOne (przewoznik): boardSettlement is null — no km-calc, no board read', async () => {
    const carrier = makeCarrier();
    const seeded = storedMixedClaim({ carrierId: carrier.id });
    const km = makeMixedKmCalc();
    const dailyKm = makeDailyKmRepo(0, septemberBoard(2_000));
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([carrier]),
      makeVehiclesRepo([]),
      km.svc,
      dailyKm,
    );

    const out = await svc.getOne(makeAuth('przewoznik', carrier.userId), seeded.nrZgl);

    expect(out.boardSettlement).toBeNull();
    expect(km.calls).toHaveLength(0);
    expect(dailyKm.listBoardDays).not.toHaveBeenCalled();
  });

  it('getOne (pracownik) on an all-active wniosek: boardSettlement null, nothing recomputed', async () => {
    const seeded = makeClaim();
    const km = makeKmCalcService();
    const dailyKm = makeDailyKmRepo(0);
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      km.svc,
      dailyKm,
    );

    const out = await svc.getOne(makeAuth('pracownik'), seeded.nrZgl);

    expect(out.boardSettlement).toBeNull();
    expect(km.calls).toHaveLength(0);
    expect(dailyKm.listBoardDays).not.toHaveBeenCalled();
  });
});

// ── boardSumKm — the pracownik «Wg tablicy przebiegów: N km» hint ─────
//
// User-reported bug: the hint showed the carrier's persisted mileage because
// the web read `mileage` from a second preview. `boardSumKm` is the board
// TOTAL over the previewed period, staff-only, independent of `mileage`.

describe('preview — boardSumKm (staff board total over the previewed period)', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  /**
   * Board fake whose `sumDroveKm` really aggregates the rows (drove only,
   * half-open `[from, toExclusive)`), so the window the service asks for is
   * what decides the number.
   */
  function makeSummingBoardRepo(rows: BoardDay[]): {
    repo: VehicleDailyKmRepository;
    sumSpy: jest.Mock;
  } {
    const inWindow = (date: string, from: Date, toExclusive: Date): boolean => {
      const t = new Date(`${date}T00:00:00.000Z`).getTime();
      return t >= from.getTime() && t < toExclusive.getTime();
    };
    const sumSpy = jest.fn(
      async (_vehicleId: string, from: Date, toExclusive: Date) =>
        rows
          .filter((r) => r.state === 'drove' && inWindow(r.date, from, toExclusive))
          .reduce((sum, r) => sum + (r.km ?? 0), 0),
    );
    const listSpy = jest.fn(
      async (_vehicleId: string, from: Date, toExclusive: Date) =>
        rows.filter((r) => inWindow(r.date, from, toExclusive)),
    );
    return {
      repo: {
        sumDroveKm: sumSpy,
        listBoardDays: listSpy,
      } as unknown as VehicleDailyKmRepository,
      sumSpy,
    };
  }

  /**
   * 01..17.04 × 550 = 9350 km (what the carrier declared), 18–19.04 idle,
   * 20.04 = 500 km the weryfikator added AFTER submit, 21.04 outside the period.
   */
  function aprilBoard(): BoardDay[] {
    const rows: BoardDay[] = [];
    for (let d = 1; d <= 17; d += 1) {
      rows.push({ date: `2026-04-${d < 10 ? `0${d}` : d}`, state: 'drove', km: 550 });
    }
    rows.push({ date: '2026-04-18', state: 'idle', km: null });
    rows.push({ date: '2026-04-19', state: 'idle', km: null });
    rows.push({ date: '2026-04-20', state: 'drove', km: 500 });
    rows.push({ date: '2026-04-21', state: 'drove', km: 1_000 });
    return rows;
  }

  const STAFF_DTO: PreviewClaimDto = {
    dateStart: '2026-04-01',
    dateEnd: '2026-04-20',
    mileage: 9_350,
    hoursAdjusted: 0,
  };

  it('pracownik: `mileage` stays the declared 9350, `boardSumKm` is the board 9850 (day added after submit included)', async () => {
    const seeded = makeClaim({ mileage: 9_350 });
    const board = makeSummingBoardRepo(aprilBoard());
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      makeKmCalcService().svc,
      board.repo,
    );

    const out = await svc.previewForExisting(
      makeAuth('pracownik'),
      seeded.nrZgl,
      STAFF_DTO,
    );

    expect(out.mileage).toBe(9_350);
    expect(out.boardSumKm).toBe(9_850);
    // The claim's vehicle over the body's inclusive period.
    expect(board.sumSpy).toHaveBeenCalledWith(
      'v-1',
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-04-21T00:00:00.000Z'),
    );
  });

  it('admin: the BODY\'s (edited) period drives the sum, not the persisted one', async () => {
    const seeded = makeClaim({ mileage: 9_350 });
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      makeKmCalcService().svc,
      makeSummingBoardRepo(aprilBoard()).repo,
    );

    const out = await svc.previewForExisting(makeAuth('admin'), seeded.nrZgl, {
      ...STAFF_DTO,
      dateEnd: '2026-04-19',
    });

    expect(out.boardSumKm).toBe(9_350);
  });

  it('a real board sum of 0 is 0, not null', async () => {
    const seeded = makeClaim();
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      makeKmCalcService().svc,
      makeSummingBoardRepo([{ date: '2026-04-02', state: 'idle', km: null }]).repo,
    );

    const out = await svc.previewForExisting(
      makeAuth('pracownik'),
      seeded.nrZgl,
      STAFF_DTO,
    );

    expect(out.boardSumKm).toBe(0);
  });

  it('przewoznik (reklamacja inspection): no `boardSumKm` key, board total never read', async () => {
    const carrier = makeCarrier();
    const seeded = makeClaim({ carrierId: carrier.id });
    const board = makeSummingBoardRepo(aprilBoard());
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([carrier]),
      makeVehiclesRepo([]),
      makeKmCalcService().svc,
      board.repo,
    );

    const out = await svc.previewForExisting(
      makeAuth('przewoznik', carrier.userId),
      seeded.nrZgl,
      STAFF_DTO,
    );

    expect('boardSumKm' in out).toBe(false);
    expect(board.sumSpy).not.toHaveBeenCalled();
  });

  it('carrier new-claim path (ctx): no `boardSumKm` key', async () => {
    const carrier = makeCarrier();
    const board = makeSummingBoardRepo(aprilBoard());
    const svc = makeService(
      makeClaimsRepo([]),
      makeCarriersRepo([carrier]),
      makeVehiclesRepo([]),
      makeKmCalcService().svc,
      board.repo,
      makeDelegationsRepo(makeDelegationForPreview(true)),
    );

    const out = await svc.previewKmCalc(makeAuth('przewoznik', carrier.userId), {
      delegationId: 'deleg-1',
      hoursAdjusted: 0,
      dateStart: '2026-04-01',
      dateEnd: '2026-04-20',
      timeFrom: '06:30',
      timeTo: '14:30',
      mileage: 9_350,
    });

    expect('boardSumKm' in out).toBe(false);
    expect(board.sumSpy).not.toHaveBeenCalled();
  });

  it('missing period dates ⇒ null (not a fake 0)', async () => {
    const seeded = makeClaim();
    const board = makeSummingBoardRepo(aprilBoard());
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      makeKmCalcService().svc,
      board.repo,
    );

    const noStart = await svc.previewForExisting(makeAuth('pracownik'), seeded.nrZgl, {
      dateEnd: '2026-04-20',
      hoursAdjusted: 0,
    });
    const noDates = await svc.previewForExisting(makeAuth('pracownik'), seeded.nrZgl, {
      hoursAdjusted: 0,
    });

    expect(noStart.boardSumKm).toBeNull();
    expect(noDates.boardSumKm).toBeNull();
    expect(board.sumSpy).not.toHaveBeenCalled();
  });

  it('invalid calendar date ⇒ null', async () => {
    const seeded = makeClaim();
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      makeKmCalcService().svc,
      makeSummingBoardRepo(aprilBoard()).repo,
    );

    const out = await svc.previewForExisting(makeAuth('pracownik'), seeded.nrZgl, {
      ...STAFF_DTO,
      dateStart: '2026-02-30',
    });

    expect(out.boardSumKm).toBeNull();
  });

  it('claim without a vehicle ⇒ null', async () => {
    const seeded = makeClaim({ vehicleId: null, vehicle: null });
    const board = makeSummingBoardRepo(aprilBoard());
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      makeKmCalcService().svc,
      board.repo,
    );

    const out = await svc.previewForExisting(
      makeAuth('pracownik'),
      seeded.nrZgl,
      STAFF_DTO,
    );

    expect(out.boardSumKm).toBeNull();
    expect(board.sumSpy).not.toHaveBeenCalled();
  });

  it('board repository not wired ⇒ null (never the 0 `_resolveMileage` would answer)', async () => {
    const seeded = makeClaim();
    const noop = {} as unknown;
    // No 12th ctor arg — `dailyKm` absent.
    const svc = new ClaimsService(
      makeClaimsRepo([seeded]),
      makeCarriersRepo([]),
      makeVehiclesRepo([]),
      noop as DriversRepository,
      noop as TrailersRepository,
      makeKmCalcService().svc,
      noop as NrZglService,
      makePrismaService(),
      makeAuditWriter(),
    );

    const out = await svc.previewForExisting(
      makeAuth('pracownik'),
      seeded.nrZgl,
      STAFF_DTO,
    );

    expect(out.boardSumKm).toBeNull();
  });
});
