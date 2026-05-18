// Phase 3.5 — `ClaimsService.submit()` unit tests for the new carrier
// submission gates.
//
// Pins the wiring of three pure `@magguarantee/shared` predicates into the
// service's tier-1 pipeline:
//
//   • `canSubmitByDuration` — hours-only gate: `roundDays(hoursAdjusted)`
//     must be STRICTLY greater than the configured threshold (default 9).
//     The earlier OR with calendar-span was dropped because the span branch
//     could never fail independently from the hours branch on realistic data.
//   • `cooldownCheck` — per-vehicle anti-spam window. Replaces the legacy
//     date-range overlap check.
//   • `vehicleCooldownException` — 422 envelope carrying the human Polish
//     message in `violations[0]` plus a machine-readable `nextAllowedAt`
//     ISO timestamp in `extensions`, which the `ProblemDetailsFilter`
//     forwards to the carrier UI.
//
// Style mirrors `claims.service.update.spec.ts` / `claims.service.preview.spec.ts`:
// hand-rolled fakes over `jest.fn`, no jest-mock-extended.

import { UnprocessableEntityException } from '@nestjs/common';

import type {
  KmCalcResult,
  SubmitClaimDto,
} from '@magguarantee/shared';

import type { AuditWriter } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { KmCalcService } from '../km-calc/km-calc.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TrailersRepository } from '../trailers/trailers.repository';
import type { VehiclesRepository } from '../vehicles/vehicles.repository';
import { ClaimsService } from './claims.service';
import type {
  ClaimRow,
  ClaimsRepository,
  CreateClaimData,
} from './claims.repository';
import type { NrZglService } from './nr-zgl.service';

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
    origHoursAdjusted: data.origHoursAdjusted,
    hoursAdjustedValue: data.hoursAdjustedValue,
    authScreenshotUrl: null,
    attachments: [],
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
  return {
    client: {
      appConfig: { findMany: jest.fn(async () => []) },
      user: { findFirst: jest.fn(async () => null) },
      carrier: { findFirst: jest.fn(async () => null) },
      vehicle: { findFirst: jest.fn(async () => null) },
    },
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) =>
      fn({}),
    ),
  } as unknown as PrismaService;
}

function makeAuditWriter(): AuditWriter {
  return { log: jest.fn(async () => undefined) } as unknown as AuditWriter;
}

function makeService(
  repoFake: RepoFake,
  carriers?: CarriersRepository,
  vehicles?: VehiclesRepository,
  km?: KmCalcService,
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
    // Zero worked days from km-calc → NOT > 9 → reject.
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake, undefined, undefined, makeKmCalc({ totalDays: 0 }));

    const dto: SubmitClaimDto = {
      vehicleId: 'v-1',
      dateStart: '2026-05-01',
      dateEnd: '2026-05-10',
      timeFrom: '08:00',
      timeTo: '18:00',
      mileage: 8_000,
      amountRequested: 1_500,
      hoursAdjusted: 0,
    };

    let caught: unknown;
    try {
      await svc.submit(makeAuth('przewoznik'), dto);
    } catch (e) {
      caught = e;
    }
    const v = readViolation(caught);
    expect(v).not.toBeNull();
    expect(v!.violations[0]).toMatch(/powyzej 9,00 dni/);
    expect(v!.violations[0]).toMatch(/0,00 dni przepracowanych/);
    expect(repoFake.creates).toHaveLength(0);
  });

  it('2. calc.totalDays = 9.00 → 422 duration_insufficient (NOT strictly > 9)', async () => {
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake, undefined, undefined, makeKmCalc({ totalDays: 9 }));

    const dto: SubmitClaimDto = {
      vehicleId: 'v-1',
      dateStart: '2026-05-01',
      dateEnd: '2026-05-10',
      timeFrom: '08:00',
      timeTo: '18:00',
      mileage: 8_000,
      amountRequested: 1_500,
      hoursAdjusted: 0,
    };

    let caught: unknown;
    try {
      await svc.submit(makeAuth('przewoznik'), dto);
    } catch (e) {
      caught = e;
    }
    const v = readViolation(caught);
    expect(v).not.toBeNull();
    expect(v!.violations[0]).toMatch(/powyzej 9,00 dni/);
    expect(v!.violations[0]).toMatch(/9,00 dni przepracowanych/);
    expect(repoFake.creates).toHaveLength(0);
  });

  it('3. calc.totalDays = 9.01 → submit succeeds', async () => {
    // 9.01 is STRICTLY GREATER than threshold 9 → pass.
    const repoFake = makeRepo(null);
    const svc = makeService(repoFake, undefined, undefined, makeKmCalc({ totalDays: 9.01 }));

    const dto: SubmitClaimDto = {
      vehicleId: 'v-1',
      dateStart: '2026-05-01',
      dateEnd: '2026-05-10',
      timeFrom: '08:00',
      timeTo: '18:00',
      mileage: 8_000,
      amountRequested: 1_500,
      hoursAdjusted: 5.5,
    };

    const out = await svc.submit(makeAuth('przewoznik'), dto);

    expect(out.nrZgl).toBe('GWA/100/05/26');
    expect(repoFake.creates).toHaveLength(1);
    // The carrier's `hoursAdjusted` is the km-calc input ("Korekta godzin"),
    // not the gate's signal — both Decimal columns persist its raw value.
    expect(repoFake.creates[0]!.data.origHoursAdjusted).toBe(5.5);
    expect(repoFake.creates[0]!.data.hoursAdjustedValue).toBe(5.5);
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
      vehicleId: 'v-1',
      dateStart: '2026-05-01',
      dateEnd: '2026-05-10',
      timeFrom: '08:00',
      timeTo: '18:00',
      mileage: 8_000,
      amountRequested: 1_500,
      // Enough hours to pass the tier-1 duration gate so the cooldown is the
      // ONLY blocker the submit reaches.
      hoursAdjusted: 240,
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
      vehicleId: 'v-1',
      dateStart: '2026-05-01',
      dateEnd: '2026-05-10',
      timeFrom: '08:00',
      timeTo: '18:00',
      mileage: 8_000,
      amountRequested: 1_500,
      hoursAdjusted: 240,
    };

    const out = await svc.submit(makeAuth('przewoznik'), dto);

    expect(out.nrZgl).toBe('GWA/100/05/26');
    expect(repoFake.creates).toHaveLength(1);
    expect(repoFake.findLastCalls).toEqual([{ vehicleId: 'v-1' }]);
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
      vehicleId: 'v-1',
      dateStart: '2026-05-01',
      dateEnd: '2026-05-10',
      timeFrom: '08:00',
      timeTo: '18:00',
      mileage: 8_000,
      amountRequested: 1_500,
      hoursAdjusted: 240,
    };

    const out = await svc.submit(makeAuth('przewoznik'), dto);

    expect(out.nrZgl).toBe('GWA/100/05/26');
    expect(repoFake.creates).toHaveLength(1);
    // The repo was consulted exactly once with the carrier's vehicleId — that
    // single round-trip is what guarantees ODRZUCONO claims never reach the
    // service-level cooldown logic.
    expect(repoFake.findLastCalls).toEqual([{ vehicleId: 'v-1' }]);
  });
});
