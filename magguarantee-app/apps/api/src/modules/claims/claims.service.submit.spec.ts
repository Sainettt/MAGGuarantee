// Phase 3.5 — `ClaimsService.submit()` unit tests for the new carrier
// submission gates.
//
// Pins the wiring of three pure `@magguarantee/shared` predicates into the
// service's tier-1 pipeline:
//
//   • `canSubmitByDuration` — hours-only gate: `calc.totalDays` from km-calc
//     must be GREATER THAN OR EQUAL TO the configured threshold (default 10,
//     boundary inclusive — 10.00 passes, 9.99 does not). The earlier OR with
//     calendar-span was dropped because the span branch could never fail
//     independently from the hours branch on realistic data.
//   • `cooldownCheck` — per-vehicle anti-spam window. Replaces the legacy
//     date-range overlap check.
//   • `vehicleCooldownException` — 422 envelope carrying the human Polish
//     message in `violations[0]` plus a machine-readable `nextAllowedAt`
//     ISO timestamp in `extensions`, which the `ProblemDetailsFilter`
//     forwards to the carrier UI.
//
// Style mirrors `claims.service.update.spec.ts` / `claims.service.preview.spec.ts`:
// hand-rolled fakes over `jest.fn`, no jest-mock-extended.

import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  KmCalcResult,
  SubmitClaimDto,
} from '@magguarantee/shared';

import type { AuditWriter } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type {
  DelegationsRepository,
  DelegationRow,
} from '../delegations/delegations.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { KmCalcService } from '../km-calc/km-calc.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TrailersRepository } from '../trailers/trailers.repository';
import type { VehicleDailyKmRepository } from '../vehicles/vehicle-daily-km.repository';
import type { VehiclesRepository } from '../vehicles/vehicles.repository';
import { ClaimsService } from './claims.service';
import type {
  ClaimRow,
  ClaimsRepository,
  CreateClaimData,
} from './claims.repository';
import type { NrZglService } from './nr-zgl.service';

/**
 * REWORK 2026-07-30 — the carrier DECLARES the period, the time window and the
 * mileage again; the outing supplies the vehicle/trailer/driver identity plus
 * two anchors: `departureAt` (floor for the declared `dateStart`) and
 * `actualReturnAt` (the submission-deadline anchor).
 *
 * The fixture keeps `departureAt=2026-05-01T06:30`, `actualReturnAt=2026-05-10`
 * so `submitDto()` can declare the same `[2026-05-01, 2026-05-10]` period every
 * test in this suite already relied on. `carrierId`/`vehicleId` match the owned
 * fixtures; the `vehicle`/`trailer`/`driver` relations + driver snapshot back
 * the read-only context the service still derives.
 */
function makeDelegation(overrides: Partial<DelegationRow> = {}): DelegationRow {
  return {
    id: 'deleg-1',
    vehicleId: 'v-1',
    vehicle: {
      id: 'v-1',
      plateNumber: 'WX12345',
      // Guarantee gate (`_resolveDelegationContext`) accepts only
      // `agreement === true`. Default fixtures are guaranteed so the happy
      // path reaches the normal flow; not-guaranteed cases override this.
      agreement: true,
      // Km-guarantee rates on the delegation vehicle mini. Claims flow does not
      // read them, but the shape is required post-«Stawki» widening.
      rateDe: null,
      rateUe: null,
      rateExport: null,
      rateImport: null,
      plannerId: null,
      dispatchTeamId: null,
      dispatchTeam: null,
      planner: null,
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
    // Default: no weryfikator-captured actual departure → `dateStart` (and the
    // derived `timeFrom`) fall back to `departureAt` (2026-05-01T06:30 → day
    // 2026-05-01, `timeFrom` "06:30"), preserving the legacy `[2026-05-01,
    // 2026-05-10]` period the submit suite relies on. Tests exercising the
    // `actualDepartureAt` override set it explicitly.
    actualDepartureAt: null,
    // Full return datetime — `dateEnd` derives from its DAY (2026-05-10) and the
    // claim's `timeTo` from its wall-clock ("16:45"). The weryfikator now
    // captures the return TIME, not just the day.
    actualReturnAt: new Date('2026-05-10T16:45:00.000Z'),
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
    ...overrides,
  };
}

function makeDelegationsRepo(
  deleg: DelegationRow | null = makeDelegation(),
): DelegationsRepository {
  return {
    findById: jest.fn(async (_id: string) => deleg),
  } as unknown as DelegationsRepository;
}

/**
 * The carrier-declared body (REWORK 2026-07-30). Defaults reproduce the period,
 * the time window and the mileage the suite used to get for free when they were
 * derived from the outing / the daily-km board — so every pre-existing
 * assertion about km-calc inputs and persisted values still holds.
 */
function submitDto(overrides: Partial<SubmitClaimDto> = {}): SubmitClaimDto {
  return {
    delegationId: 'deleg-1',
    dateStart: '2026-05-01',
    dateEnd: '2026-05-10',
    timeFrom: '06:30',
    timeTo: '16:45',
    mileage: 8_000,
    ...overrides,
  };
}

// ─── Fixtures ────────────────────────────────────────────────

/**
 * Fixed clock anchor. Picked so the submit-window guards (`dateEnd <= today`,
 * `daysAfterUnload <= 7`) pass for any period ending on/around 2026-05-14.
 * Cooldown tests express `lastCreatedAt` as offsets from NOW so the boundary
 * arithmetic is obvious in the test body.
 */
const NOW = new Date('2026-05-15T10:00:00.000Z');

function makeAuth(
  role: AuthUser['role'],
  sub = 'u-carrier-1',
): AuthUser {
  return {
    sub,
    login: 'carrier1',
    email: 'carrier@example.com',
    name: 'Carrier One',
    role,
    mustChangePassword: false,
  };
}

function makeClaimRow(data: CreateClaimData): ClaimRow {
  // Round-trip just enough of CreateClaimData into the wider ClaimRow shape
  // so `ClaimsService.toDto(row)` doesn't blow up after a successful submit.
  return {
    id: 'claim-id-1',
    nrZgl: data.nrZgl,
    carrierId: data.carrierId,
    carrier: { id: data.carrierId, login: 'carrier1', name: 'Carrier One' },
    vehicleId: data.vehicleId,
    vehicle: data.vehicleId
      ? { id: data.vehicleId, plateNumber: data.vehiclePlateSnapshot }
      : null,
    vehiclePlateSnapshot: data.vehiclePlateSnapshot,
    dateStart: data.dateStart,
    dateEnd: data.dateEnd,
    timeFrom: data.timeFrom,
    timeTo: data.timeTo,
    drivenDays: data.drivenDays,
    mileage: data.mileage,
    kmPerDay: data.kmPerDay,
    kmGuaranteed: data.kmGuaranteed,
    kmDifference: data.kmDifference,
    paymentEur: data.paymentEur,
    ratePerKmEffective: data.ratePerKmEffective,
    breakdown: data.breakdown,
    status: data.status,
    statusChangedAt: data.statusChangedAt,
    decidedById: null,
    decidedBy: null,
    verifiedAt: null,
    verifiedById: null,
    verifiedBy: null,
    comment: data.comment,
    orderNumber: data.orderNumber,
    orderDate: data.orderDate,
    amountApproved: null,
    reklamacjaSubmitted: false,
    reklamacjaText: null,
    reklamacjaResponse: null,
    reklamacjaAmount: null,
    statusBeforeReklamacja: null,
    origDateStart: data.origDateStart,
    origDateEnd: data.origDateEnd,
    origMileage: data.origMileage,
    origPaymentEur: data.origPaymentEur,
    origTimeFrom: data.origTimeFrom,
    origTimeTo: data.origTimeTo,
    origHoursAdjusted: data.origHoursAdjusted,
    hoursAdjustedValue: data.hoursAdjustedValue,
    maksimGateRequired: false,
    maksimGateNotifiedAt: null,
    maksimGateNotifiedAmount: null,
    maksimGateClearedAt: null,
    maksimGateClearedById: null,
    attachments: [],
    delegationId: 'deleg-1',
    delegationDepartureAt: null,
    delegationActualDepartureAt: null,
    delegationPlannedReturnAt: null,
    delegationActualReturnAt: null,
    delegationStatus: 'zjechal',
    periodAdjustedByVerifier: false,
    autoRecalcState: 'none',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

// ─── Fakes ───────────────────────────────────────────────────

interface RepoFake {
  repo: ClaimsRepository;
  creates: { data: CreateClaimData }[];
  findLastCalls: { vehicleId: string }[];
}

function makeRepo(
  lastClaim: { id: string; nrZgl: string; createdAt: Date } | null,
): RepoFake {
  const creates: { data: CreateClaimData }[] = [];
  const findLastCalls: { vehicleId: string }[] = [];
  const repo = {
    findLastNonRejectedForVehicle: jest.fn(async (vehicleId: string) => {
      findLastCalls.push({ vehicleId });
      return lastClaim;
    }),
    createWithin: jest.fn(
      async (_tx: unknown, data: CreateClaimData): Promise<ClaimRow> => {
        creates.push({ data });
        return makeClaimRow(data);
      },
    ),
  } as unknown as ClaimsRepository;
  return { repo, creates, findLastCalls };
}

function makeCarriersRepo(): CarriersRepository {
  return {
    list: jest.fn(async () => [
      { id: 'c-1', userId: 'u-carrier-1' },
    ]),
  } as unknown as CarriersRepository;
}

function makeVehiclesRepo(): VehiclesRepository {
  return {
    findById: jest.fn(async (id: string) => ({
      id,
      carrierId: 'c-1',
      plateNumber: 'WX12345',
      // Mirror the eager-relation default so the guarantee gate's fallback
      // path also sees a guaranteed vehicle.
      agreement: true,
    })),
  } as unknown as VehiclesRepository;
}

function makeKmCalc(result?: Partial<KmCalcResult>): KmCalcService {
  return {
    // Default produces a non-trivial underrun (10_800 km guaranteed vs 8_000
    // supplied) so the tier-2 `paymentEur === 0` violation doesn't fire and
    // the success-path tests actually reach createWithin().
    calc: jest.fn(async () => ({
      totalDays: 10,
      // Default mirror of totalDays (no `hoursAdjusted` override in the
      // default mock); individual cases can override either independently.
      rawTotalDays: 10,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
      breakdown: [],
      // Boundary-day credited fractions surfaced by the engine — a Mar 9
      // (Mon) → Mar 13 (Fri) style window with a 06:00 start / 12:00 stop.
      firstDay: { date: '2026-03-09', fraction: 0.75 },
      lastDay: { date: '2026-03-13', fraction: 0.5 },
      ...result,
    })),
  } as unknown as KmCalcService;
}

function makeNrZgl(): NrZglService {
  return {
    nextWithin: jest.fn(async () => 'GWA/100/05/26'),
  } as unknown as NrZglService;
}

function makePrismaService(): PrismaService {
  // submit() now opens its OWN `this.prisma.$transaction(async (tx) => …)` for
  // the atomic nrZgl-bump + claim insert (no longer relying on the @Audit
  // interceptor's ambient tx). The test mocks `nrZgl.nextWithin` /
  // `claims.createWithin` on their services directly, so the `tx` handed to the
  // callback just needs to be a truthy sentinel — we pass `client`. We also
  // expose `client` + a `tx` getter for `_collectSubmitRecipients` /
  // `_loadSubmitConfig` reads that go through `this.prisma.tx`.
  const client = {
    appConfig: { findMany: jest.fn(async () => []) },
    user: { findFirst: jest.fn(async () => null) },
    carrier: { findFirst: jest.fn(async () => null) },
    vehicle: { findFirst: jest.fn(async () => null) },
  };
  return {
    client,
    get tx() {
      return client;
    },
    $transaction: <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
      cb(client),
  } as unknown as PrismaService;
}

function makeAuditWriter(): AuditWriter {
  return { log: jest.fn(async () => undefined) } as unknown as AuditWriter;
}

/**
 * Daily-km repo fake. `sumDroveKm` returns the configured prefill value so the
 * `mileage` pre-fill path (Phase 7 REWORK #3) can be exercised. The spy is
 * returned so tests can assert the queried window.
 */
function makeDailyKmRepo(sum: number): {
  repo: VehicleDailyKmRepository;
  sumSpy: jest.Mock;
} {
  const sumSpy = jest.fn(async () => sum);
  return {
    repo: { sumDroveKm: sumSpy } as unknown as VehicleDailyKmRepository,
    sumSpy,
  };
}

function makeService(
  repoFake: RepoFake,
  carriers?: CarriersRepository,
  vehicles?: VehiclesRepository,
  km?: KmCalcService,
  dailyKm?: VehicleDailyKmRepository,
  delegations?: DelegationsRepository,
): ClaimsService {
  return new ClaimsService(
    repoFake.repo,
    carriers ?? makeCarriersRepo(),
    vehicles ?? makeVehiclesRepo(),
    {} as DriversRepository,
    {} as TrailersRepository,
    km ?? makeKmCalc(),
    makeNrZgl(),
    makePrismaService(),
    makeAuditWriter(),
    undefined,
    undefined,
    // Phase 7 §0″ finish — mileage is ALWAYS the daily-km sum (no body
    // override). Default the daily-km repo to a non-zero sum so the success
    // paths clear the `mileage > 0` tier-1 gate; tests needing a specific sum
    // (or 0) pass their own `dailyKm`.
    dailyKm ?? makeDailyKmRepo(8_000).repo,
    // Phase 7 §0″ finish — submit derives the period + vehicle/trailer/driver
    // /mileage from the outing.
    delegations ?? makeDelegationsRepo(),
  );
}

/**
 * Cheap helper: pull the `extensions` bag and `violations` list off the
 * 422 body so tests can assert both without copy-paste casts. Returns null
 * if the exception isn't shaped as expected.
 */
function readViolation(err: unknown): {
  violations: string[];
  extensions?: Record<string, unknown>;
} | null {
  if (!(err instanceof UnprocessableEntityException)) return null;
  const body = err.getResponse() as {
    violations?: unknown;
    extensions?: Record<string, unknown>;
  };
  if (!Array.isArray(body.violations)) return null;
  const violations = body.violations.filter(
    (v): v is string => typeof v === 'string',
  );
  return body.extensions
    ? { violations, extensions: body.extensions }
    : { violations };
}

// ─── Tests ───────────────────────────────────────────────────

describe('ClaimsService.submit — carrier submission gates', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // ── duration gate (canSubmitByDuration) ──────────────────

  it('1. calc.totalDays = 0 → 422 duration_insufficient', async () => {
    // Zero worked days from km-calc → NOT >= 10 → reject.
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake, undefined, undefined, makeKmCalc({ totalDays: 0 }));

    const dto: SubmitClaimDto = submitDto();

    let caught: unknown;
    try {
      await svc.submit(makeAuth('przewoznik'), dto);
    } catch (e) {
      caught = e;
    }
    const v = readViolation(caught);
    expect(v).not.toBeNull();
    expect(v!.violations[0]).toMatch(/co najmniej 10,00 dni/);
    expect(v!.violations[0]).toMatch(/0,00 dni przepracowanych/);
    expect(repoFake.creates).toHaveLength(0);
  });

  it('2. calc.totalDays = 9.99 → 422 duration_insufficient (just below the inclusive boundary)', async () => {
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake, undefined, undefined, makeKmCalc({ totalDays: 9.99 }));

    const dto: SubmitClaimDto = submitDto();

    let caught: unknown;
    try {
      await svc.submit(makeAuth('przewoznik'), dto);
    } catch (e) {
      caught = e;
    }
    const v = readViolation(caught);
    expect(v).not.toBeNull();
    expect(v!.violations[0]).toMatch(/co najmniej 10,00 dni/);
    expect(v!.violations[0]).toMatch(/9,99 dni przepracowanych/);
    expect(repoFake.creates).toHaveLength(0);
  });

  it('3. calc.totalDays = 10.00 → submit succeeds (boundary inclusive)', async () => {
    // 10.00 equals threshold 10 → pass (>= comparison).
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake, undefined, undefined, makeKmCalc({ totalDays: 10 }));

    const dto: SubmitClaimDto = submitDto();

    const out = await svc.submit(makeAuth('przewoznik'), dto);

    expect(out.nrZgl).toBe('GWA/100/05/26');
    // DTO mapper propagates the stored auto-recalc result. A fresh submit
    // (even on a `zjechal` outing) never runs `recalcFromDelegation`, so the
    // column stays at its `none` default.
    expect(out.autoRecalcState).toBe('none');
    expect(repoFake.creates).toHaveLength(1);
    // `hoursAdjusted` is verifier-only — submit always seeds both Decimal
    // columns to 0 regardless of what the carrier could theoretically type.
    expect(repoFake.creates[0]!.data.origHoursAdjusted).toBe(0);
    expect(repoFake.creates[0]!.data.hoursAdjustedValue).toBe(0);
    // Time window is DERIVED from the outing's actual datetimes (the carrier no
    // longer supplies it): `timeFrom` = HH:mm(actualDepartureAt ?? departureAt) =
    // "06:30" (fallback to departureAt 06:30, actualDepartureAt null in the
    // fixture); `timeTo` = HH:mm(actualReturnAt 16:45) = "16:45". The working and
    // the immutable `orig*` columns carry the same derived values.
    expect(repoFake.creates[0]!.data.timeFrom).toBe('06:30');
    expect(repoFake.creates[0]!.data.timeTo).toBe('16:45');
    expect(repoFake.creates[0]!.data.origTimeFrom).toBe('06:30');
    expect(repoFake.creates[0]!.data.origTimeTo).toBe('16:45');
    // The requested amount is derived from km-calc — not from the body.
    // paymentEur = (kmGuaranteed - mileage) * ratePerKmEffective
    //            = (10_800 - 8_000) * 0.5 = 1_400.
    expect(repoFake.creates[0]!.data.paymentEur).toBe(1_400);
    // Immutable submit-time payment snapshot — captured EQUAL to the derived
    // paymentEur so the authorization-email «Korekty weryfikatora» diff and the
    // History tab can compare against the verifier's later applied amount.
    expect(repoFake.creates[0]!.data.origPaymentEur).toBe(1_400);
    expect(repoFake.creates[0]!.data.origPaymentEur).toBe(
      repoFake.creates[0]!.data.paymentEur,
    );
    // The engine's boundary-day credited fractions are threaded onto the
    // persisted `Claim.breakdown` JSONB so the web "Miesiąc" block can render
    // "ile z pierwszego / ostatniego dnia zaliczono" from the stored claim.
    expect(repoFake.creates[0]!.data.breakdown.firstDay).toEqual({
      date: '2026-03-09',
      fraction: 0.75,
    });
    expect(repoFake.creates[0]!.data.breakdown.lastDay).toEqual({
      date: '2026-03-13',
      fraction: 0.5,
    });
  });

  // ── cooldown gate (cooldownCheck) ────────────────────────

  it('4. lastClaim 100h ago → 422 vehicle_cooldown carrying nextAllowedAt in extensions', async () => {
    // 100h < 144h (6 days) → the carrier must wait another ~44h. The Polish
    // message identifies the boundary date; the structured `extensions`
    // bag carries the same instant as ISO so the UI can compute a countdown.
    const lastCreatedAt = new Date(NOW.getTime() - 100 * 60 * 60 * 1000);
    const expectedNextAt = new Date(
      lastCreatedAt.getTime() + 6 * 24 * 60 * 60 * 1000,
    );
    const repoFake = makeRepo({
      id: 'prev-claim',
      nrZgl: 'GWA/099/05/26',
      createdAt: lastCreatedAt,
    });
    const svc = makeService(repoFake);

    // The default km-calc mock yields `totalDays: 10` (>= threshold 10), so the
    // tier-1 duration gate passes and the cooldown is the ONLY blocker the
    // submit reaches.
    const dto: SubmitClaimDto = submitDto();

    let caught: unknown;
    try {
      await svc.submit(makeAuth('przewoznik'), dto);
    } catch (e) {
      caught = e;
    }
    const v = readViolation(caught);
    expect(v).not.toBeNull();
    expect(v!.violations).toHaveLength(1);
    expect(v!.violations[0]).toMatch(/Nastepny wniosek na ten pojazd/);
    expect(v!.extensions).toBeDefined();
    expect(v!.extensions!.nextAllowedAt).toBe(expectedNextAt.toISOString());
    // No row written; the cooldown was the only blocker the submit got to.
    expect(repoFake.creates).toHaveLength(0);
    expect(repoFake.findLastCalls).toEqual([{ vehicleId: 'v-1' }]);
  });

  it('5. lastClaim 144h ago (exact boundary) → submit succeeds (inclusive boundary)', async () => {
    // The shared `cooldownCheck` uses `elapsedMs >= requiredMs` — equality
    // is allowed. Locks in the boundary policy: at exactly 144h since the
    // previous claim, the next one is admissible.
    const lastCreatedAt = new Date(NOW.getTime() - 144 * 60 * 60 * 1000);
    const repoFake = makeRepo({
      id: 'prev-claim',
      nrZgl: 'GWA/099/05/26',
      createdAt: lastCreatedAt,
    });
    const svc = makeService(repoFake);

    const dto: SubmitClaimDto = submitDto();

    const out = await svc.submit(makeAuth('przewoznik'), dto);

    expect(out.nrZgl).toBe('GWA/100/05/26');
    expect(repoFake.creates).toHaveLength(1);
    expect(repoFake.findLastCalls).toEqual([{ vehicleId: 'v-1' }]);
  });

  it('7. treats dateEnd = today-in-Warsaw as not-in-future even at UTC-vs-Warsaw day boundary', async () => {
    // Regression: the previous `startOfTodayUtc()` produced "today" in UTC,
    // so a Polish carrier submitting at 00:30 Europe/Warsaw (= 22:30 UTC the
    // previous day) saw `today = yesterday-in-Warsaw` and got a false
    // "Data rozładunku w przyszłości" tier-1 violation for `dateEnd = today
    // in Warsaw`. `startOfTodayBusinessTz()` anchors "today" to the Warsaw
    // calendar, so the comparison now works as the carrier expects.
    //
    // Scenario: now = 2026-05-26T00:30:00+02:00 (Warsaw) = 2026-05-25T22:30:00Z.
    // dateEnd = '2026-05-26' (today in Warsaw) must NOT trip the future-date
    // gate. We use a short period (5 days) and override km-calc with
    // totalDays = 10 so the duration gate also passes — leaving only the
    // future-date check as the candidate failure point.
    const lateNightWarsaw = new Date('2026-05-25T22:30:00.000Z');
    jest.setSystemTime(lateNightWarsaw);

    try {
      const repoFake = makeRepo(null);
      // The outing only sets the anchors now: declared departure 2026-05-22
      // (floor) and actual return 2026-05-26 (deadline anchor).
      const delegations = makeDelegationsRepo(
        makeDelegation({
          departureAt: new Date('2026-05-22T06:30:00.000Z'),
          actualReturnAt: new Date('2026-05-26T00:00:00.000Z'),
          plannedReturnAt: new Date('2026-05-26T00:00:00.000Z'),
        }),
      );
      const svc = makeService(
        repoFake,
        undefined,
        undefined,
        makeKmCalc({ totalDays: 10 }),
        undefined,
        delegations,
      );

      // The carrier declares the boundary date itself — that is the value the
      // future-date gate must evaluate against Warsaw-today.
      const dto: SubmitClaimDto = submitDto({
        dateStart: '2026-05-22',
        dateEnd: '2026-05-26',
      });

      const out = await svc.submit(makeAuth('przewoznik'), dto);

      expect(out.nrZgl).toBe('GWA/100/05/26');
      expect(repoFake.creates).toHaveLength(1);
    } finally {
      // Restore the suite's anchor so subsequent tests aren't affected.
      jest.setSystemTime(NOW);
    }
  });

  it('6. lastClaim status=ODRZUCONO (repo skips it → null) → submit succeeds, cooldown bypassed', async () => {
    // The repository's `findLastNonRejectedForVehicle` excludes ODRZUCONO
    // rows by construction (`status: { not: ODRZUCONO }`). The service
    // therefore sees `null` and the cooldown check trivially passes — even
    // if the rejected claim was created seconds ago. Critical UX: a carrier
    // whose wniosek was rejected can resubmit immediately.
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);

    const dto: SubmitClaimDto = submitDto();

    const out = await svc.submit(makeAuth('przewoznik'), dto);

    expect(out.nrZgl).toBe('GWA/100/05/26');
    expect(repoFake.creates).toHaveLength(1);
    // The repo was consulted exactly once with the carrier's vehicleId — that
    // single round-trip is what guarantees ODRZUCONO claims never reach the
    // service-level cooldown logic.
    expect(repoFake.findLastCalls).toEqual([{ vehicleId: 'v-1' }]);
  });

  // ── carrier-declared mileage (REWORK 2026-07-30) ──────────

  it('7. mileage is the CARRIER-DECLARED value; the daily-km board is not consulted', async () => {
    const repoFake = makeRepo(null);
    // Board sum deliberately DIFFERENT from the declared mileage: the two come
    // from different external systems and never agree — that divergence is the
    // whole reason the carrier declares its own number now.
    const { repo: dailyKm, sumSpy } = makeDailyKmRepo(6_123);
    const svc = makeService(repoFake, undefined, undefined, undefined, dailyKm);

    const dto: SubmitClaimDto = submitDto({ mileage: 8_000 });

    const out = await svc.submit(makeAuth('przewoznik'), dto);

    expect(out.nrZgl).toBe('GWA/100/05/26');
    expect(repoFake.creates).toHaveLength(1);
    // Persisted verbatim, both in the working column and the carrier snapshot.
    expect(repoFake.creates[0]!.data.mileage).toBe(8_000);
    expect(repoFake.creates[0]!.data.origMileage).toBe(8_000);
    // The board is the weryfikator's reference for `pracownik`, NOT an input to
    // submit — submit must not even read it.
    expect(sumSpy).not.toHaveBeenCalled();
  });

  it('8. a declared mileage of 0 → 422 (mileage must be > 0)', async () => {
    // The one sanity rule left on the carrier's number (plus the km/day cap in
    // tier 2). Everything else is the `pracownik` verification step's job.
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);

    const dto: SubmitClaimDto = submitDto({ mileage: 0 });

    let caught: unknown;
    try {
      await svc.submit(makeAuth('przewoznik'), dto);
    } catch (e) {
      caught = e;
    }
    const v = readViolation(caught);
    expect(v).not.toBeNull();
    expect(v!.violations.some((m) => /Przebieg musi być większy od zera/.test(m))).toBe(
      true,
    );
    expect(repoFake.creates).toHaveLength(0);
  });

  it('9. vehicle/trailer/driver + plate snapshot are taken from the outing, not the body', async () => {
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);

    const dto: SubmitClaimDto = submitDto();

    await svc.submit(makeAuth('przewoznik'), dto);
    expect(repoFake.creates).toHaveLength(1);
    const data = repoFake.creates[0]!.data;
    // vehicleId + plate snapshot derive from the outing's vehicle relation.
    expect(data.vehicleId).toBe('v-1');
    expect(data.vehiclePlateSnapshot).toBe('WX12345');
  });
});

// ─── delegation link + carrier-declared facts (REWORK 2026-07-30) ──

describe('ClaimsService.submit — delegation link', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const dto: SubmitClaimDto = submitDto();

  it('persists the CARRIER-DECLARED period verbatim and links delegationId', async () => {
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);
    await svc.submit(makeAuth('przewoznik'), dto);
    expect(repoFake.creates).toHaveLength(1);
    const data = repoFake.creates[0]!.data;
    expect(data.dateStart.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(data.dateEnd.toISOString()).toBe('2026-05-10T00:00:00.000Z');
    expect(data.delegationId).toBe('deleg-1');
  });

  it('ignores the weryfikator actual departure — the declared dateStart wins', async () => {
    const repoFake = makeRepo(null);
    // Weryfikator recorded a later actual start (2026-05-03) than the carrier
    // declares (2026-05-01). The two systems disagree by design; the claim
    // records the CARRIER's figure and `pracownik` reconciles them later.
    const delegations = makeDelegationsRepo(
      makeDelegation({
        actualDepartureAt: new Date('2026-05-03T00:00:00.000Z'),
      }),
    );
    const svc = makeService(
      repoFake,
      undefined,
      undefined,
      undefined,
      undefined,
      delegations,
    );
    await svc.submit(makeAuth('przewoznik'), dto);
    const data = repoFake.creates[0]!.data;
    expect(data.dateStart.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(data.dateEnd.toISOString()).toBe('2026-05-10T00:00:00.000Z');
  });

  it('persists the carrier-declared time window into both the working and the snapshot columns', async () => {
    const repoFake = makeRepo(null);
    // The outing's actual datetimes say something else entirely — irrelevant.
    const delegations = makeDelegationsRepo(
      makeDelegation({
        actualDepartureAt: new Date('2026-05-01T07:15:00.000Z'),
        actualReturnAt: new Date('2026-05-10T19:40:00.000Z'),
      }),
    );
    const svc = makeService(
      repoFake,
      undefined,
      undefined,
      undefined,
      undefined,
      delegations,
    );
    await svc.submit(
      makeAuth('przewoznik'),
      submitDto({ timeFrom: '05:00', timeTo: '21:30' }),
    );
    const data = repoFake.creates[0]!.data;
    expect(data.timeFrom).toBe('05:00');
    expect(data.timeTo).toBe('21:30');
    // The immutable snapshot is what makes the ClaimModal's «deklaracja vs
    // weryfikacja» pair meaningful — it must capture the SAME declared values.
    expect(data.origTimeFrom).toBe('05:00');
    expect(data.origTimeTo).toBe('21:30');
  });

  // ── departure floor (REWORK 2026-07-30) ──────────────────

  it('rejects a dateStart EARLIER than the declared departure — 422 CLAIM_DATE_BEFORE_DEPARTURE', async () => {
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);

    // Outing declares departureAt 2026-05-01; the carrier claims it loaded on
    // 2026-04-30 — impossible, nobody leaves before they said they would.
    let caught: unknown;
    try {
      await svc.submit(
        makeAuth('przewoznik'),
        submitDto({ dateStart: '2026-04-30' }),
      );
    } catch (e) {
      caught = e;
    }
    const v = readViolation(caught);
    expect(v).not.toBeNull();
    expect(v!.extensions?.code).toBe('CLAIM_DATE_BEFORE_DEPARTURE');
    // The floor is echoed so the form can pin the date input's `min`.
    expect(v!.extensions?.minDateStart).toBe('2026-05-01');
    expect(repoFake.creates).toHaveLength(0);
  });

  it('accepts a dateStart LATER than the declared departure (delays are legitimate)', async () => {
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);

    await svc.submit(
      makeAuth('przewoznik'),
      submitDto({ dateStart: '2026-05-04' }),
    );
    expect(repoFake.creates).toHaveLength(1);
    expect(repoFake.creates[0]!.data.dateStart.toISOString()).toBe(
      '2026-05-04T00:00:00.000Z',
    );
  });

  it('accepts a dateStart EQUAL to the declared departure day (boundary inclusive)', async () => {
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);

    await svc.submit(
      makeAuth('przewoznik'),
      submitDto({ dateStart: '2026-05-01' }),
    );
    expect(repoFake.creates).toHaveLength(1);
  });

  // ── deadline anchor (REWORK 2026-07-30) ──────────────────

  it('measures the submission deadline from actualReturnAt, NOT from the declared dateEnd', async () => {
    // The regression this pins: with the deadline anchored on the carrier-typed
    // `dateEnd`, anyone past the window would simply type a fresher unloading
    // date and walk through. The truck actually returned 2026-04-20 — 25 days
    // before NOW (2026-05-15), far past the 7-day window — while the carrier
    // declares a comfortable 2026-05-10. It must still be rejected.
    const repoFake = makeRepo(null);
    const delegations = makeDelegationsRepo(
      makeDelegation({
        departureAt: new Date('2026-04-10T06:30:00.000Z'),
        actualReturnAt: new Date('2026-04-20T16:45:00.000Z'),
      }),
    );
    const svc = makeService(
      repoFake,
      undefined,
      undefined,
      undefined,
      undefined,
      delegations,
    );

    let caught: unknown;
    try {
      await svc.submit(
        makeAuth('przewoznik'),
        submitDto({ dateStart: '2026-04-10', dateEnd: '2026-05-10' }),
      );
    } catch (e) {
      caught = e;
    }
    const v = readViolation(caught);
    expect(v).not.toBeNull();
    expect(
      v!.violations.some((m) => /Termin na złożenie wniosku minął/.test(m)),
    ).toBe(true);
    expect(repoFake.creates).toHaveLength(0);
  });

  it('accepts a declared dateEnd LATER than the actual return (customer decision: not blocked)', async () => {
    // A truck can come back days after the weryfikator's recorded return, and
    // the carrier may legitimately claim through that date. No gate here — the
    // `pracownik` verification step owns this judgement.
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);

    await svc.submit(
      makeAuth('przewoznik'),
      submitDto({ dateEnd: '2026-05-14' }),
    );
    expect(repoFake.creates).toHaveLength(1);
    expect(repoFake.creates[0]!.data.dateEnd.toISOString()).toBe(
      '2026-05-14T00:00:00.000Z',
    );
  });

  it('rejects an outing still w_trasie (only a zjechal outing may back a wniosek) — 422, no write', async () => {
    // A wniosek can only be filed for a RETURNED outing — its period, times, and
    // mileage are only final once the weryfikator captured the actual
    // departure/return datetimes. A `w_trasie` outing is now a hard 422.
    const repoFake = makeRepo(null);
    const delegations = makeDelegationsRepo(
      makeDelegation({ status: 'w_trasie', actualReturnAt: null }),
    );
    const svc = makeService(
      repoFake,
      undefined,
      undefined,
      undefined,
      undefined,
      delegations,
    );
    await expect(svc.submit(makeAuth('przewoznik'), dto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repoFake.creates).toHaveLength(0);
  });

  it('rejects an outing in gotowy (not yet zjechal) — 422, no write', async () => {
    const repoFake = makeRepo(null);
    const delegations = makeDelegationsRepo(makeDelegation({ status: 'gotowy' }));
    const svc = makeService(
      repoFake,
      undefined,
      undefined,
      undefined,
      undefined,
      delegations,
    );
    await expect(svc.submit(makeAuth('przewoznik'), dto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repoFake.creates).toHaveLength(0);
  });

  it("rejects an outing belonging to another carrier — 422", async () => {
    const repoFake = makeRepo(null);
    const delegations = makeDelegationsRepo(
      makeDelegation({ carrierId: 'someone-else' }),
    );
    const svc = makeService(
      repoFake,
      undefined,
      undefined,
      undefined,
      undefined,
      delegations,
    );
    await expect(svc.submit(makeAuth('przewoznik'), dto)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(repoFake.creates).toHaveLength(0);
  });

  it('rejects when the outing already has a claim (claimId set) — 409', async () => {
    const repoFake = makeRepo(null);
    const delegations = makeDelegationsRepo(
      makeDelegation({ claimId: 'existing-claim' }),
    );
    const svc = makeService(
      repoFake,
      undefined,
      undefined,
      undefined,
      undefined,
      delegations,
    );
    await expect(svc.submit(makeAuth('przewoznik'), dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repoFake.creates).toHaveLength(0);
  });

  it('maps a P2002 on delegationId from createWithin to a 409', async () => {
    const repoFake = makeRepo(null);
    // Force the insert to throw a unique-violation on the delegation FK.
    (repoFake.repo.createWithin as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('unique'), {
        code: 'P2002',
        meta: { target: ['delegationId'] },
      }),
    );
    const svc = makeService(repoFake);
    await expect(svc.submit(makeAuth('przewoznik'), dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // ── guarantee gate (Vehicle.agreement, _resolveDelegationContext seam) ──

  // Reads the single-code 422 envelope (NOT the `violations[]` shape) thrown by
  // the guarantee gate; returns the stable code or null if not shaped as such.
  function readExtensionsCode(err: unknown): string | null {
    if (!(err instanceof UnprocessableEntityException)) return null;
    const body = err.getResponse() as {
      extensions?: { code?: unknown };
    };
    return typeof body.extensions?.code === 'string'
      ? body.extensions.code
      : null;
  }

  it('rejects when the outing vehicle has agreement=false — 422 VEHICLE_NOT_GUARANTEED, no write', async () => {
    const repoFake = makeRepo(null);
    const delegations = makeDelegationsRepo(
      makeDelegation({
        vehicle: {
          id: 'v-1',
          plateNumber: 'WX12345',
          agreement: false,
          rateDe: null,
          rateUe: null,
          rateExport: null,
          rateImport: null,
          plannerId: null,
          dispatchTeamId: null,
          dispatchTeam: null,
          planner: null,
        },
      }),
    );
    const svc = makeService(
      repoFake,
      undefined,
      undefined,
      undefined,
      undefined,
      delegations,
    );
    let caught: unknown;
    try {
      await svc.submit(makeAuth('przewoznik'), dto);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect(readExtensionsCode(caught)).toBe('VEHICLE_NOT_GUARANTEED');
    // No claim persisted — the gate fires before km-calc / createWithin.
    expect(repoFake.creates).toHaveLength(0);
  });

  it('rejects when the outing vehicle has agreement=null (null treated as not guaranteed) — 422 VEHICLE_NOT_GUARANTEED', async () => {
    const repoFake = makeRepo(null);
    const delegations = makeDelegationsRepo(
      makeDelegation({
        vehicle: {
          id: 'v-1',
          plateNumber: 'WX12345',
          agreement: null,
          rateDe: null,
          rateUe: null,
          rateExport: null,
          rateImport: null,
          plannerId: null,
          dispatchTeamId: null,
          dispatchTeam: null,
          planner: null,
        },
      }),
    );
    const svc = makeService(
      repoFake,
      undefined,
      undefined,
      undefined,
      undefined,
      delegations,
    );
    let caught: unknown;
    try {
      await svc.submit(makeAuth('przewoznik'), dto);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect(readExtensionsCode(caught)).toBe('VEHICLE_NOT_GUARANTEED');
    expect(repoFake.creates).toHaveLength(0);
  });

  it('passes the guarantee gate when the outing vehicle has agreement=true (reaches the normal happy path)', async () => {
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);
    await svc.submit(makeAuth('przewoznik'), dto);
    // The default fixture is guaranteed (agreement=true) — the claim persists.
    expect(repoFake.creates).toHaveLength(1);
  });
});
