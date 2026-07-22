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
 * Phase 7 §0″ finish — the submit period AND vehicle/trailer/driver/mileage are
 * all DERIVED from the chosen outing. A `zjechal` delegation in the past
 * (`departureAt=2026-05-01`, `actualReturnAt=2026-05-10`) reproduces the legacy
 * `[2026-05-01, 2026-05-10]` period every test relied on. `carrierId`/
 * `vehicleId` match the owned fixtures; the `vehicle`/`trailer`/`driver`
 * relations + driver snapshot back the read-only context the service derives.
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
    // Default: no weryfikator-captured actual departure → `dateStart` falls back
    // to `departureAt` (2026-05-01), preserving the legacy `[2026-05-01,
    // 2026-05-10]` period the submit suite relies on. Tests exercising the
    // `actualDepartureAt` override set it explicitly.
    actualDepartureAt: null,
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
    authorizationRequired: false,
    authorizationDescription: null,
    authorizationToken: null,
    authorizationDecidedAt: null,
    amountRequested: data.amountRequested,
    amountApproved: null,
    margin: null,
    amountMaximum: null,
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
    authScreenshotUrl: null,
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

    const dto: SubmitClaimDto = {
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
    };

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

    const dto: SubmitClaimDto = {
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
    };

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

    const dto: SubmitClaimDto = {
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
    };

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
    // Immutable carrier time-window snapshot — mirrors the same values that
    // go into the working `timeFrom/timeTo` columns at submit.
    expect(repoFake.creates[0]!.data.origTimeFrom).toBe(dto.timeFrom);
    expect(repoFake.creates[0]!.data.origTimeTo).toBe(dto.timeTo);
    expect(repoFake.creates[0]!.data.origTimeFrom).toBe('08:00');
    expect(repoFake.creates[0]!.data.origTimeTo).toBe('18:00');
    // amountRequested is derived from km-calc paymentEur — not from the body.
    // paymentEur = (kmGuaranteed - mileage) * ratePerKmEffective
    //            = (10_800 - 8_000) * 0.5 = 1_400.
    expect(repoFake.creates[0]!.data.amountRequested).toBe(1_400);
    // Immutable submit-time payment snapshot — captured EQUAL to the derived
    // paymentEur so the authorization-email «Korekty weryfikatora» diff and the
    // History tab can compare against the verifier's later applied amount.
    expect(repoFake.creates[0]!.data.origPaymentEur).toBe(1_400);
    expect(repoFake.creates[0]!.data.origPaymentEur).toBe(
      repoFake.creates[0]!.data.paymentEur,
    );
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

    const dto: SubmitClaimDto = {
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
      // The default km-calc mock yields `totalDays: 10` (>= threshold 10),
      // so the tier-1 duration gate passes and the cooldown is the ONLY
      // blocker the submit reaches. Mileage is the daily-km sum (default 8_000).
    };

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

    const dto: SubmitClaimDto = {
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
    };

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
      // The period is derived from the outing: departure 2026-05-22, actual
      // return 2026-05-26 (= today in Warsaw, "tomorrow" in UTC).
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

      const dto: SubmitClaimDto = {
        delegationId: 'deleg-1',
        timeFrom: '08:00',
        timeTo: '18:00',
      };

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

    const dto: SubmitClaimDto = {
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
    };

    const out = await svc.submit(makeAuth('przewoznik'), dto);

    expect(out.nrZgl).toBe('GWA/100/05/26');
    expect(repoFake.creates).toHaveLength(1);
    // The repo was consulted exactly once with the carrier's vehicleId — that
    // single round-trip is what guarantees ODRZUCONO claims never reach the
    // service-level cooldown logic.
    expect(repoFake.findLastCalls).toEqual([{ vehicleId: 'v-1' }]);
  });

  // ── mileage pre-fill from VehicleDailyKm (Phase 7 REWORK #3) ──

  it('7. mileage is ALWAYS Σ VehicleDailyKm.km (state=drove) over the derived [from, to] of the outing vehicle', async () => {
    const repoFake = makeRepo(null);
    const { repo: dailyKm, sumSpy } = makeDailyKmRepo(8_000);
    const svc = makeService(repoFake, undefined, undefined, undefined, dailyKm);

    // Phase 7 §0″ finish — the carrier never sends `mileage`; it is derived
    // from the daily-km sum over the period of the OUTING's vehicle.
    const dto: SubmitClaimDto = {
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
    };

    const out = await svc.submit(makeAuth('przewoznik'), dto);

    expect(out.nrZgl).toBe('GWA/100/05/26');
    expect(repoFake.creates).toHaveLength(1);
    // The persisted mileage equals the daily-km sum, not a body value.
    expect(repoFake.creates[0]!.data.mileage).toBe(8_000);
    expect(repoFake.creates[0]!.data.origMileage).toBe(8_000);
    // The sum query uses [dateStart, dateEnd + 1 day) (inclusive end) for the
    // OUTING's vehicleId (`v-1`), over the derived period [2026-05-01, 2026-05-10].
    expect(sumSpy).toHaveBeenCalledTimes(1);
    const [vehicleId, from, toExclusive] = sumSpy.mock.calls[0]!;
    expect(vehicleId).toBe('v-1');
    expect((from as Date).toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect((toExclusive as Date).toISOString()).toBe('2026-05-11T00:00:00.000Z');
  });

  it('8. a daily-km sum of 0 over the period → 422 (mileage must be > 0)', async () => {
    // There is no carrier override anymore. If the daily-km data sums to 0 the
    // claim is correctly rejected by the tier-1 `mileage > 0` gate.
    const repoFake = makeRepo(null);
    const { repo: dailyKm } = makeDailyKmRepo(0);
    const svc = makeService(repoFake, undefined, undefined, undefined, dailyKm);

    const dto: SubmitClaimDto = {
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
    };

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

    const dto: SubmitClaimDto = {
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
    };

    await svc.submit(makeAuth('przewoznik'), dto);
    expect(repoFake.creates).toHaveLength(1);
    const data = repoFake.creates[0]!.data;
    // vehicleId + plate snapshot derive from the outing's vehicle relation.
    expect(data.vehicleId).toBe('v-1');
    expect(data.vehiclePlateSnapshot).toBe('WX12345');
  });
});

// ─── delegation link + period derivation (Phase 7 REWORK #4) ──

describe('ClaimsService.submit — delegation link', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const dto: SubmitClaimDto = {
    delegationId: 'deleg-1',
    timeFrom: '08:00',
    timeTo: '18:00',
  };

  it('derives the period from the outing (dateStart=departureDay, dateEnd=actualReturnAt) and links delegationId', async () => {
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake);
    await svc.submit(makeAuth('przewoznik'), dto);
    expect(repoFake.creates).toHaveLength(1);
    const data = repoFake.creates[0]!.data;
    // departureAt 2026-05-01T06:30 → date 2026-05-01; actualReturnAt 2026-05-10.
    expect(data.dateStart.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(data.dateEnd.toISOString()).toBe('2026-05-10T00:00:00.000Z');
    expect(data.delegationId).toBe('deleg-1');
  });

  it('derives dateStart from actualDepartureAt when the weryfikator captured one (overrides departureAt)', async () => {
    const repoFake = makeRepo(null);
    // Weryfikator captured a later actual start (2026-05-03) than the reported
    // departure day (2026-05-01) → the guarantee period starts on the actual day.
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
    // dateStart follows actualDepartureAt (2026-05-03), NOT departureAt.
    expect(data.dateStart.toISOString()).toBe('2026-05-03T00:00:00.000Z');
    // dateEnd unaffected (still actualReturnAt 2026-05-10).
    expect(data.dateEnd.toISOString()).toBe('2026-05-10T00:00:00.000Z');
  });

  it('uses plannedReturnAt as dateEnd when the outing is still w_trasie (no actualReturnAt)', async () => {
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
    await svc.submit(makeAuth('przewoznik'), dto);
    // plannedReturnAt 2026-05-09 backs dateEnd when no actual return yet.
    expect(repoFake.creates[0]!.data.dateEnd.toISOString()).toBe(
      '2026-05-09T00:00:00.000Z',
    );
  });

  it('rejects an outing in gotowy (not yet w_trasie/zjechal) — 422, no write', async () => {
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
