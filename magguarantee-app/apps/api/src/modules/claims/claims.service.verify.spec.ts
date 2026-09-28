// Verification checkpoint («Zapisz weryfikację») — `ClaimsService.verifyClaim`.
//
// The pracownik persists corrections BEFORE any decision; the checkpoint stamps
// `verifiedAt`/`verifiedById` and (when the body carries a math-affecting
// correction) re-runs km-calc. An EMPTY body is
// legal — "confirmed as-is" (stamp only, no recalc). Status is NOT changed
// (verification is a flag, not a status). Repeatable (re-verify overwrites).
//
// Style follows `claims.service.update.spec.ts`: hand-rolled fakes, no
// jest-mock-extended. The service runs inside an ambient `AuditContext` (opened
// by the production `AuditInterceptor` for `@Audit('claim.verify')`); the
// `withAuditContext()` helper simulates that so `setBefore` lands on a store.

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';
import type {
  BoardDay,
  ClaimStatus,
  KmCalcBreakdown,
  KmCalcResult,
  VerifyClaimDto,
} from '@magguarantee/shared';

import {
  AuditContext,
  type AuditContextStore,
} from '../../common/audit/audit-context';
import type { AuditWriter } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarriersRepository } from '../carriers/carriers.repository';
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
  UpdateClaimData,
} from './claims.repository';
import type { NrZglService } from './nr-zgl.service';

// ─── helpers ─────────────────────────────────────────────────

const NOW = new Date('2026-05-15T10:00:00.000Z');

async function withAuditContext<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; store: AuditContextStore }> {
  const store: AuditContextStore = {
    tx: { __sentinel: 'tx' } as unknown as Prisma.TransactionClient,
    actor: { userId: 'u-actor', userRole: 'pracownik' },
    ipAddress: null,
  };
  const result = await AuditContext.run(store, fn);
  return { result, store };
}

function makeAuth(role: AuthUser['role'], sub = 'u-actor'): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
    mustChangePassword: false,
  };
}

function makeBreakdown(): KmCalcBreakdown {
  return {
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
        // Odd-Saturday feature OFF in this fixture (no kmPerSaturday).
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
    // Settlement fields (2026-09-20): every month of this fixture has its
    // guarantee ON, so the active day count equals the total.
    daysActive: 20,
    daysTotal: 20,
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
    breakdown: makeBreakdown(),
    status: 'NA_WERYFIKACJI',
    statusChangedAt: new Date('2026-04-21T08:00:00.000Z'),
    decidedById: null,
    decidedBy: null,
    // Unverified by default — that's the whole point of the checkpoint.
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

interface ClaimsRepoFake {
  repo: ClaimsRepository;
  rows: Map<string, ClaimRow>;
  updateWithinCalls: { id: string; data: UpdateClaimData }[];
}

function makeClaimsRepo(seed: ClaimRow[] = []): ClaimsRepoFake {
  const rows = new Map<string, ClaimRow>();
  for (const r of seed) rows.set(r.nrZgl, r);
  const updateWithinCalls: { id: string; data: UpdateClaimData }[] = [];

  const repo = {
    findByNrZgl: jest.fn(async (nrZgl: string) => rows.get(nrZgl) ?? null),
    updateWithin: jest.fn(
      async (_tx: unknown, id: string, data: UpdateClaimData) => {
        updateWithinCalls.push({ id, data });
        const existing = [...rows.values()].find((r) => r.id === id);
        if (!existing) throw new Error('not found');
        // Merge the patch onto the seeded row so the returned DTO reflects it.
        const next: ClaimRow = {
          ...existing,
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.statusChangedAt !== undefined
            ? { statusChangedAt: data.statusChangedAt }
            : {}),
          ...(data.verifiedAt !== undefined
            ? { verifiedAt: data.verifiedAt }
            : {}),
          ...(data.verifiedById !== undefined
            ? { verifiedById: data.verifiedById }
            : {}),
          ...(data.dateStart !== undefined
            ? { dateStart: data.dateStart }
            : {}),
          ...(data.dateEnd !== undefined ? { dateEnd: data.dateEnd } : {}),
          ...(data.timeFrom !== undefined ? { timeFrom: data.timeFrom } : {}),
          ...(data.timeTo !== undefined ? { timeTo: data.timeTo } : {}),
          ...(data.mileage !== undefined ? { mileage: data.mileage } : {}),
          ...(data.hoursAdjustedValue !== undefined
            ? { hoursAdjustedValue: data.hoursAdjustedValue }
            : {}),
          ...(data.drivenDays !== undefined
            ? { drivenDays: data.drivenDays }
            : {}),
          ...(data.kmPerDay !== undefined ? { kmPerDay: data.kmPerDay } : {}),
          ...(data.kmGuaranteed !== undefined
            ? { kmGuaranteed: data.kmGuaranteed }
            : {}),
          ...(data.kmDifference !== undefined
            ? { kmDifference: data.kmDifference }
            : {}),
          ...(data.paymentEur !== undefined
            ? { paymentEur: data.paymentEur }
            : {}),
          ...(data.ratePerKmEffective !== undefined
            ? { ratePerKmEffective: data.ratePerKmEffective }
            : {}),
          ...(data.breakdown !== undefined
            ? { breakdown: data.breakdown }
            : {}),
          ...(data.periodAdjustedByVerifier !== undefined
            ? { periodAdjustedByVerifier: data.periodAdjustedByVerifier }
            : {}),
          ...(data.autoRecalcState !== undefined
            ? { autoRecalcState: data.autoRecalcState }
            : {}),
          ...(data.maksimGateRequired !== undefined
            ? { maksimGateRequired: data.maksimGateRequired }
            : {}),
          ...(data.maksimGateNotifiedAt !== undefined
            ? { maksimGateNotifiedAt: data.maksimGateNotifiedAt }
            : {}),
          ...(data.maksimGateNotifiedAmount !== undefined
            ? { maksimGateNotifiedAmount: data.maksimGateNotifiedAmount }
            : {}),
          ...(data.maksimGateClearedAt !== undefined
            ? { maksimGateClearedAt: data.maksimGateClearedAt }
            : {}),
          ...(data.maksimGateClearedById !== undefined
            ? { maksimGateClearedById: data.maksimGateClearedById }
            : {}),
        };
        rows.set(next.nrZgl, next);
        return next;
      },
    ),
  } as unknown as ClaimsRepository;

  return { repo, rows, updateWithinCalls };
}

function makeKmCalcService(
  result?: Partial<KmCalcResult>,
): { svc: KmCalcService; calls: { input: unknown }[] } {
  const calls: { input: unknown }[] = [];
  const svc = {
    calc: jest.fn(async (input: unknown): Promise<KmCalcResult> => {
      calls.push({ input });
      return {
        totalDays: 20,
        rawTotalDays: 20,
        kmGuaranteed: 10_800,
        ratePerKmEffective: 0.5,
        breakdown: makeBreakdown().breakdown,
        firstDay: null,
        lastDay: null,
        ...result,
      };
    }),
  } as unknown as KmCalcService;
  return { svc, calls };
}

function makePrismaService(): PrismaService {
  const client = {
    user: { findFirst: jest.fn(async () => null) },
    carrier: { findFirst: jest.fn(async () => null) },
    vehicle: { findFirst: jest.fn(async () => null) },
    delegation: { findFirst: jest.fn(async () => null) },
    vehiclePlannerAssignment: { findMany: jest.fn(async () => []) },
    appConfig: { findMany: jest.fn(async () => []) },
    claim: { update: jest.fn(), findFirst: jest.fn() },
    claimSequence: { upsert: jest.fn() },
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

/** Minimal MailService fake — records enqueue calls for the Maksim email. */
interface MailFake {
  enqueueMaksimConfirmationRequest: jest.Mock;
}

function makeMailFake(): MailFake {
  return {
    enqueueMaksimConfirmationRequest: jest.fn(async () => undefined),
  };
}

/** Minimal ConfigService fake returning APP_URL / MAKSIM_EMAIL defaults. */
function makeConfigFake(): { get: jest.Mock } {
  return {
    get: jest.fn((key: string) => {
      if (key === 'APP_URL') return 'http://localhost:3000';
      if (key === 'MAKSIM_EMAIL') return 'maksim@magtrans.eu';
      return undefined;
    }),
  };
}

function makeService(
  repoFake: ClaimsRepoFake,
  km: KmCalcService,
  prisma: PrismaService,
  mail?: MailFake,
  config?: { get: jest.Mock },
  dailyKm?: VehicleDailyKmRepository,
): { svc: ClaimsService; audit: { log: jest.Mock } } {
  const noop = {} as unknown;
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new ClaimsService(
    repoFake.repo,
    noop as CarriersRepository,
    noop as VehiclesRepository,
    noop as DriversRepository,
    noop as TrailersRepository,
    km,
    noop as NrZglService,
    prisma,
    audit as unknown as AuditWriter,
    mail as unknown as import('../mail/mail.service').MailService,
    config as unknown as import('@nestjs/config').ConfigService<
      import('../../config/env.schema').Env,
      true
    >,
    dailyKm,
  );
  return { svc, audit };
}

/** Daily-km repo fake exposing only the board read a mixed period needs. */
function makeBoardRepo(board: BoardDay[]): {
  repo: VehicleDailyKmRepository;
  boardSpy: jest.Mock;
} {
  const boardSpy = jest.fn(async () => board);
  return {
    repo: { listBoardDays: boardSpy } as unknown as VehicleDailyKmRepository,
    boardSpy,
  };
}

/** Waits a microtask turn so the fire-and-log email `void` promise settles. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// ─── tests ───────────────────────────────────────────────────

describe('ClaimsService.verifyClaim — verification checkpoint', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('1. empty body stamps verifiedAt/ById WITHOUT running km-calc (confirmed as-is, under threshold → status unchanged)', async () => {
    // Under-threshold dopłata (300 < 500 for 20 days) → no auto-transition, so
    // the status genuinely stays NA_WERYFIKACJI.
    const seeded = makeClaim({ paymentEur: 300 });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    const dto: VerifyClaimDto = {};

    const out = await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, dto);

    // km-calc MUST NOT run — no math-affecting correction present.
    expect(km.calls).toHaveLength(0);
    expect(repoFake.updateWithinCalls).toHaveLength(1);
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.verifiedAt).toEqual(NOW);
    expect(patch.verifiedById).toBe('u-actor');
    // No calc columns touched.
    expect(patch.kmGuaranteed).toBeUndefined();
    expect(patch.paymentEur).toBeUndefined();
    // Under threshold → no status transition.
    expect(patch.status).toBeUndefined();
    expect(out.status).toBe('NA_WERYFIKACJI');
    expect(out.verifiedAt).toBe(NOW.toISOString());
    expect(out.verifiedById).toBe('u-actor');
  });

  it('2. corrections trigger recalc + verified stamp', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    // Recalc returns different numbers so we can prove the engine ran.
    const km = makeKmCalcService({
      totalDays: 18,
      rawTotalDays: 18,
      kmGuaranteed: 9_720,
      ratePerKmEffective: 0.5,
    });
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    const dto: VerifyClaimDto = { mileage: 8_500 };

    const out = await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, dto);

    expect(km.calls).toHaveLength(1);
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.mileage).toBe(8_500);
    expect(patch.kmGuaranteed).toBe(9_720);
    // kmDifference = 9_720 - 8_500 = 1_220 → paymentEur = 1_220 * 0.5 = 610.
    expect(patch.kmDifference).toBe(1_220);
    expect(patch.paymentEur).toBe(610);
    expect(patch.verifiedAt).toEqual(NOW);
    expect(patch.verifiedById).toBe('u-actor');
    expect(out.mileage).toBe(8_500);
    expect(out.paymentEur).toBe(610);
  });

  it('2b. date edit sets periodAdjustedByVerifier=true + autoRecalcState=none', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService({ totalDays: 19, rawTotalDays: 19 });
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    const dto: VerifyClaimDto = { dateEnd: '2026-04-19' };

    await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, dto);

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.periodAdjustedByVerifier).toBe(true);
    expect(patch.autoRecalcState).toBe('none');
    // The stamp still lands alongside the corrections.
    expect(patch.verifiedAt).toEqual(NOW);
  });

  it('2b-fixA. date fields EQUAL to the existing claim do NOT latch periodAdjustedByVerifier / autoRecalcState', async () => {
    // The verify form always re-sends the current (prefilled) dates. A value-
    // based guard must NOT treat that as a human edit — otherwise every no-op
    // re-verify would gate out the late-zjechał recalcFromDelegation.
    const seeded = makeClaim({
      dateStart: new Date('2026-04-01T00:00:00.000Z'),
      dateEnd: new Date('2026-04-20T00:00:00.000Z'),
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService({ totalDays: 20, rawTotalDays: 20 });
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    // Same calendar days as the seeded claim (prefilled, unchanged).
    const dto: VerifyClaimDto = {
      dateStart: '2026-04-01',
      dateEnd: '2026-04-20',
    };

    await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, dto);

    const patch = repoFake.updateWithinCalls[0]!.data;
    // No genuine period change → neither the guard flag nor autoRecalcState move.
    expect(patch.periodAdjustedByVerifier).toBeUndefined();
    expect(patch.autoRecalcState).toBeUndefined();
    // The verification stamp still lands (it's an ordinary re-verify).
    expect(patch.verifiedAt).toEqual(NOW);
  });

  it('2b-fixA2. a genuinely different dateStart still latches periodAdjustedByVerifier=true + autoRecalcState=none', async () => {
    const seeded = makeClaim({
      dateStart: new Date('2026-04-01T00:00:00.000Z'),
      dateEnd: new Date('2026-04-20T00:00:00.000Z'),
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService({ totalDays: 19, rawTotalDays: 19 });
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    // dateStart moved by a day; dateEnd re-sent unchanged.
    const dto: VerifyClaimDto = {
      dateStart: '2026-04-02',
      dateEnd: '2026-04-20',
    };

    await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, dto);

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.periodAdjustedByVerifier).toBe(true);
    expect(patch.autoRecalcState).toBe('none');
    expect(patch.dateStart).toEqual(new Date('2026-04-02T00:00:00.000Z'));
  });

  it('2c. hoursAdjusted correction writes ONLY hoursAdjustedValue (origHoursAdjusted untouched)', async () => {
    const seeded = makeClaim({ origHoursAdjusted: 5.5, hoursAdjustedValue: 5.5 });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService({ totalDays: 19 });
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    const dto: VerifyClaimDto = { hoursAdjusted: 8 };

    await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, dto);

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.hoursAdjustedValue).toBe(8);
    // origHoursAdjusted is the immutable carrier snapshot — never written.
    expect(patch.origHoursAdjusted).toBeUndefined();
    // km-calc received the NEW value.
    expect(km.calls).toHaveLength(1);
    expect(
      (km.calls[0]!.input as { hoursAdjusted: number }).hoursAdjusted,
    ).toBe(8);
  });

  it('3. wrong status (ZAAKCEPTOWANO) → 422 + no writes', async () => {
    const seeded = makeClaim({ status: 'ZAAKCEPTOWANO' });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    await expect(
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {}),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(km.calls).toHaveLength(0);
  });

  it('4. claim not found → NotFoundException + no writes', async () => {
    const repoFake = makeClaimsRepo([]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    await expect(
      svc.verifyClaim(makeAuth('pracownik'), 'GWA/999/04/26', {}),
    ).rejects.toThrow(NotFoundException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('5. re-verification overwrites the previous stamp + corrections', async () => {
    // First verify with a correction — stamp lands, mileage corrected.
    const seeded = makeClaim({
      verifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      verifiedById: 'u-first',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService({ kmGuaranteed: 9_720 });
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    const out = await svc.verifyClaim(makeAuth('pracownik', 'u-second'), seeded.nrZgl, {
      mileage: 8_500,
    });

    // The stamp is overwritten with the fresh actor + clock.
    expect(out.verifiedById).toBe('u-second');
    expect(out.verifiedAt).toBe(NOW.toISOString());
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.verifiedById).toBe('u-second');
    expect(patch.verifiedAt).toEqual(NOW);
    expect(patch.mileage).toBe(8_500);
  });

  it('6. audit before snapshot captured in the ambient context (status + verifiedAt)', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    const { result, store } = await withAuditContext(() =>
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {}),
    );

    // The service pushes the pre-mutation snapshot into AuditContext; the
    // production interceptor commits it as `before` alongside the row.
    const before = store.before as {
      status: ClaimStatus;
      verifiedAt: string | null;
    };
    expect(before.status).toBe('NA_WERYFIKACJI');
    expect(before.verifiedAt).toBeNull();
    // The response (which the interceptor uses for `after`) carries the stamp.
    expect(result.verifiedAt).toBe(NOW.toISOString());
  });
});

describe('ClaimsService.verifyClaim — Maksim authorization gate arming', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('7. OVER threshold (empty body) arms the gate + moves status to OCZEKUJE + sends the Maksim email exactly once', async () => {
    // Default claim: paymentEur 1_400, drivenDays 20 → threshold 500. 1400 > 500.
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    const out = await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {});
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.maksimGateRequired).toBe(true);
    expect(patch.maksimGateNotifiedAt).toEqual(NOW);
    // Amount-aware dedup: the first notification stamps the final dopłata.
    expect(patch.maksimGateNotifiedAmount).toBe(1_400);
    // NEW: the over-threshold arm auto-moves the claim into the pending status.
    expect(patch.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(patch.statusChangedAt).toEqual(NOW);
    // decidedById is NOT set — this is verification, not a decision.
    expect(patch.decidedById).toBeUndefined();
    // Email enqueued exactly once with the recipient + core content rows.
    expect(mail.enqueueMaksimConfirmationRequest).toHaveBeenCalledTimes(1);
    const [email, props] =
      mail.enqueueMaksimConfirmationRequest.mock.calls[0]!;
    expect(email).toBe('maksim@magtrans.eu');
    expect(props.nrZgl).toBe(seeded.nrZgl);
    expect(props.doplata).toBe('1400.00');
    expect(props.prog).toBe('500.00');
    // DTO surfaces the gate + new status for the web.
    expect(out.maksimGateRequired).toBe(true);
    expect(out.maksimGateNotifiedAt).toBe(NOW.toISOString());
    expect(out.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
  });

  it('7b. Reply-To = the verifying pracownik, so Maksim\'s answer lands in a read mailbox (not the no-reply group)', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    // The verifier lookup in `_resolveVerifierReplyTo` — active, not deleted.
    (
      prisma.client.user.findFirst as unknown as jest.Mock
    ).mockResolvedValueOnce({ email: 'Anna.Kowalska@magtrans.eu' });
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    await svc.verifyClaim(makeAuth('pracownik', 'u-anna'), seeded.nrZgl, {});
    await flushMicrotasks();

    // Looked up by the just-stamped verifiedById, gated on active/alive.
    expect(prisma.client.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u-anna', active: true, deletedAt: null },
      select: { email: true },
    });
    // Third arg is the Reply-To — lowercased, like every other address we ship.
    const [, , replyTo] = mail.enqueueMaksimConfirmationRequest.mock.calls[0]!;
    expect(replyTo).toBe('anna.kowalska@magtrans.eu');
  });

  it('7c. unresolvable verifier ⇒ NO Reply-To (reply bounces off the no-reply group instead of vanishing)', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    // Default prisma fake resolves the user lookup to null (deactivated /
    // deleted verifier), which must not block the email itself.
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {});
    await flushMicrotasks();

    expect(mail.enqueueMaksimConfirmationRequest).toHaveBeenCalledTimes(1);
    const [, , replyTo] = mail.enqueueMaksimConfirmationRequest.mock.calls[0]!;
    expect(replyTo).toBeNull();
  });

  it('8. re-save when ALREADY notified at the SAME amount does NOT resend (amount-aware dedup)', async () => {
    const seeded = makeClaim({
      verifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      verifiedById: 'u-first',
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      // Last notified at the same amount the empty-body re-save resolves to
      // (default paymentEur 1400) → dedup holds, no re-send.
      maksimGateNotifiedAmount: 1_400,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    // Empty body re-save (confirmed as-is) — still over threshold.
    await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {});
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.maksimGateRequired).toBe(true);
    // notifiedAt / notifiedAmount left untouched (undefined ⇒ column keeps the
    // prior stamp); a prior clearance is likewise preserved.
    expect(patch.maksimGateNotifiedAt).toBeUndefined();
    expect(patch.maksimGateNotifiedAmount).toBeUndefined();
    expect(patch.maksimGateClearedAt).toBeUndefined();
    expect(patch.maksimGateClearedById).toBeUndefined();
    // No second email.
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
  });

  it('9. UNDER threshold clears the whole gate (correction drops below threshold)', async () => {
    // A claim previously armed; a mileage correction drops paymentEur under 500.
    const seeded = makeClaim({
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      maksimGateClearedAt: null,
    });
    const repoFake = makeClaimsRepo([seeded]);
    // Recalc → kmGuaranteed 9_720; mileage 9_600 → kmDiff 120 → paymentEur 60.
    // drivenDays 18 → threshold 500. 60 < 500 → gate clears.
    const km = makeKmCalcService({
      totalDays: 18,
      rawTotalDays: 18,
      kmGuaranteed: 9_720,
      ratePerKmEffective: 0.5,
    });
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    const out = await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {
      mileage: 9_600,
    });
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.maksimGateRequired).toBe(false);
    expect(patch.maksimGateNotifiedAt).toBeNull();
    expect(patch.maksimGateClearedAt).toBeNull();
    expect(patch.maksimGateClearedById).toBeNull();
    // No email for an under-threshold save.
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
    expect(out.maksimGateRequired).toBe(false);
  });

  it('10. re-arm after a recalc reset re-sends (notifiedAt was reset to null)', async () => {
    // Simulate the post-recalc state: gate + verification were reset in lockstep,
    // so notifiedAt is null again. A fresh over-threshold verify must re-send.
    const seeded = makeClaim({
      verifiedAt: null,
      verifiedById: null,
      maksimGateRequired: false,
      maksimGateNotifiedAt: null,
      maksimGateClearedAt: null,
      maksimGateClearedById: null,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {});
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.maksimGateRequired).toBe(true);
    expect(patch.maksimGateNotifiedAt).toEqual(NOW);
    expect(mail.enqueueMaksimConfirmationRequest).toHaveBeenCalledTimes(1);
  });

  it('11. Fix B — over-threshold re-verify with a CHANGED amount re-notifies + nulls a prior clearance', async () => {
    // Previously notified at 1400 and Maksim already confirmed (cleared). A new
    // mileage correction moves the over-threshold amount to 900 (still > 500) →
    // the OLD confirmation is invalidated: re-stamp notifiedAt/Amount, NULL the
    // clearance, and re-send.
    const seeded = makeClaim({
      verifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      verifiedById: 'u-first',
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      maksimGateNotifiedAmount: 1_400,
      maksimGateClearedAt: new Date('2026-05-14T11:00:00.000Z'),
      maksimGateClearedById: 'u-clearer',
    });
    const repoFake = makeClaimsRepo([seeded]);
    // kmGuaranteed 10_800, rate 0.5, mileage 9_000 → kmDiff 1_800 → payment 900.
    // drivenDays 20 → threshold 500. 900 > 500 AND 900 ≠ 1400 → re-notify.
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {
      mileage: 9_000,
    });
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.maksimGateRequired).toBe(true);
    expect(patch.maksimGateNotifiedAt).toEqual(NOW);
    expect(patch.maksimGateNotifiedAmount).toBe(900);
    // A moved amount invalidates the prior clearance — Maksim must re-confirm.
    expect(patch.maksimGateClearedAt).toBeNull();
    expect(patch.maksimGateClearedById).toBeNull();
    // Re-send fires exactly once.
    expect(mail.enqueueMaksimConfirmationRequest).toHaveBeenCalledTimes(1);
  });

  it('12. Fix B — over-threshold re-verify with the SAME amount does NOT re-send (dedup + clearance preserved)', async () => {
    // Previously notified at 900 and cleared. A recalc that lands on the SAME
    // 900 must NOT re-send and must NOT touch notifiedAt / notifiedAmount / the
    // prior clearance (idempotent re-save).
    const seeded = makeClaim({
      verifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      verifiedById: 'u-first',
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      maksimGateNotifiedAmount: 900,
      maksimGateClearedAt: new Date('2026-05-14T11:00:00.000Z'),
      maksimGateClearedById: 'u-clearer',
    });
    const repoFake = makeClaimsRepo([seeded]);
    // Same math as test 11 → payment 900, identical to the last-notified amount.
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {
      mileage: 9_000,
    });
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.maksimGateRequired).toBe(true);
    // Untouched — the amount did not move.
    expect(patch.maksimGateNotifiedAt).toBeUndefined();
    expect(patch.maksimGateNotifiedAmount).toBeUndefined();
    expect(patch.maksimGateClearedAt).toBeUndefined();
    expect(patch.maksimGateClearedById).toBeUndefined();
    // No re-send.
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
  });
});

// ─── in-transit gate (linked outing still `w_trasie`) ────────

describe('ClaimsService.verifyClaim — in-transit gate', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('blocks verifyClaim with 422 CLAIM_DELEGATION_IN_TRANSIT when the linked outing is w_trasie', async () => {
    const seeded = makeClaim({
      delegationId: 'deleg-1',
      delegationStatus: 'w_trasie',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    await expect(
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {}),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    // Assert the machine code (both top-level + extensions) round-trips.
    try {
      await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {});
      throw new Error('expected verifyClaim to throw');
    } catch (err) {
      const body = (err as UnprocessableEntityException).getResponse() as {
        code?: string;
        extensions?: { code?: string };
      };
      expect(body.code).toBe('CLAIM_DELEGATION_IN_TRANSIT');
      expect(body.extensions?.code).toBe('CLAIM_DELEGATION_IN_TRANSIT');
    }

    // Gate fires BEFORE the recalc + persist + Maksim auto-email.
    expect(km.calls).toHaveLength(0);
    expect(repoFake.updateWithinCalls).toHaveLength(0);
    await flushMicrotasks();
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
  });

  it('succeeds when the linked outing is zjechal (returned)', async () => {
    const seeded = makeClaim({
      delegationId: 'deleg-1',
      delegationStatus: 'zjechal',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    const out = await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {});

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    expect(out.verifiedAt).toBe(NOW.toISOString());
    // toDto round-trip: the linked-outing status surfaces on the DTO.
    expect(out.delegationStatus).toBe('zjechal');
  });

  it('succeeds when there is NO linked outing (delegationId null)', async () => {
    const seeded = makeClaim({ delegationId: null, delegationStatus: null });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    const out = await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {});

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    expect(out.verifiedAt).toBe(NOW.toISOString());
    // toDto round-trip: `null` when there is no linked outing.
    expect(out.delegationStatus).toBeNull();
  });
});

// ─── status × role matrix for the checkpoint ─────────────────
//
// docs/03-roles.md: `admin` is the superset of `pracownik`. The checkpoint is
// open to BOTH in `NA_WERYFIKACJI`, and to `admin` ONLY in the pending
// `OCZEKUJE_NA_AUTORYZACJE` window. The split is STATUS-dependent, so it lives
// in the service — `@Roles('admin','pracownik')` on the controller stays the
// coarse gate (docs/15-auth-strategy.md §Roles).

describe('ClaimsService.verifyClaim — status × role matrix', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  /**
   * A claim auto-moved into `OCZEKUJE_NA_AUTORYZACJE` at verification because the
   * dopłata crossed the auth threshold (the gate is armed + Maksim was notified).
   */
  function makePendingClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
    return makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE' as ClaimStatus,
      // It was verified before it left NA_WERYFIKACJI (that edge is gated).
      verifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      verifiedById: 'u-first',
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      maksimGateNotifiedAmount: 1_400,
      ...overrides,
    });
  }

  // ── cell 1/4: pracownik × NA_WERYFIKACJI → allowed (under threshold) ──
  it('13. pracownik × NA_WERYFIKACJI → allowed (under threshold → status unchanged)', async () => {
    // Under-threshold dopłata → no auto-transition, status stays NA_WERYFIKACJI.
    const seeded = makeClaim({ paymentEur: 300 });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    const out = await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {});

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    expect(out.verifiedAt).toBe(NOW.toISOString());
    expect(out.verifiedById).toBe('u-actor');
    // Under threshold → status untouched.
    expect(out.status).toBe('NA_WERYFIKACJI');
    // No Maksim email for an under-threshold verify.
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
  });

  // ── cell 2/4: admin × NA_WERYFIKACJI → allowed (under threshold) ──
  it('14. admin × NA_WERYFIKACJI → allowed (under threshold → status unchanged)', async () => {
    const seeded = makeClaim({ paymentEur: 300 });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    const out = await svc.verifyClaim(
      makeAuth('admin', 'u-admin'),
      seeded.nrZgl,
      {},
    );

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    expect(out.verifiedAt).toBe(NOW.toISOString());
    expect(out.verifiedById).toBe('u-admin');
    expect(out.status).toBe('NA_WERYFIKACJI');
  });

  // ── cell 3/4: admin × OCZEKUJE_NA_AUTORYZACJE → allowed ──
  it('15. admin × OCZEKUJE_NA_AUTORYZACJE → allowed, re-stamps verification, status stays pending (still over threshold)', async () => {
    const seeded = makePendingClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    // mileage 7_000 → kmGuaranteed 10_800 − 7_000 = 3_800 → payment 1_900 > 500.
    const out = await svc.verifyClaim(
      makeAuth('admin', 'u-admin'),
      seeded.nrZgl,
      { mileage: 7_000 },
    );

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.verifiedAt).toEqual(NOW);
    expect(patch.verifiedById).toBe('u-admin');
    expect(patch.mileage).toBe(7_000);
    // The checkpoint NEVER nulls the stamp — it always writes a fresh one.
    expect(patch.verifiedAt).not.toBeNull();
    // Still over threshold in the pending window → status is NOT changed
    // (idempotent), and no decision is recorded.
    expect(out.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(patch.status).toBeUndefined();
    expect(patch.decidedById).toBeUndefined();
  });

  // ── cell 4/4: pracownik × OCZEKUJE_NA_AUTORYZACJE → 422, admin-only ──
  it('16. pracownik × OCZEKUJE_NA_AUTORYZACJE → 422 CLAIM_VERIFY_ADMIN_ONLY + no writes', async () => {
    const seeded = makePendingClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    // Server-side refusal — hiding the button in the UI is not the gate.
    await expect(
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, { mileage: 7_000 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {});
      throw new Error('expected verifyClaim to throw');
    } catch (err) {
      const body = (err as UnprocessableEntityException).getResponse() as {
        code?: string;
        extensions?: { code?: string };
      };
      expect(body.code).toBe('CLAIM_VERIFY_ADMIN_ONLY');
      expect(body.extensions?.code).toBe('CLAIM_VERIFY_ADMIN_ONLY');
    }

    // Refused BEFORE any recalc / persist / email.
    expect(km.calls).toHaveLength(0);
    expect(repoFake.updateWithinCalls).toHaveLength(0);
    await flushMicrotasks();
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
  });

  it('17. the role refusal is DISTINGUISHABLE from the status refusal (different causes)', async () => {
    const decided = makeClaim({ status: 'ZAAKCEPTOWANO' });
    const pending = makePendingClaim({ nrZgl: 'GWA/002/04/26' });
    const repoFake = makeClaimsRepo([decided, pending]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const { svc } = makeService(repoFake, km.svc, prisma);

    const bodyOf = async (nrZgl: string): Promise<unknown> => {
      try {
        await svc.verifyClaim(makeAuth('pracownik'), nrZgl, {});
        throw new Error('expected verifyClaim to throw');
      } catch (err) {
        return (err as UnprocessableEntityException).getResponse();
      }
    };

    // Status refusal — plain message, NO machine code (unchanged shape).
    const statusBody = (await bodyOf(decided.nrZgl)) as {
      message?: string;
      code?: string;
    };
    expect(statusBody.code).toBeUndefined();
    expect(statusBody.message).toContain('Na weryfikacji');

    // Role refusal — carries the distinct code the web keys its copy on.
    const roleBody = (await bodyOf(pending.nrZgl)) as {
      message?: string;
      code?: string;
    };
    expect(roleBody.code).toBe('CLAIM_VERIFY_ADMIN_ONLY');
    expect(roleBody.message).not.toBe(statusBody.message);
  });
});

// ─── Threshold-driven status auto-transition (the ONLY authorization path) ───
//
// There is no manual authorization request. The over-threshold Maksim gate is
// the SOLE authorization mechanism, and it AUTO-MOVES the claim
// between `NA_WERYFIKACJI` and `OCZEKUJE_NA_AUTORYZACJE` at the verification
// checkpoint. `_assertMaksimGateCleared` gates decisions out of BOTH statuses,
// so the gate must be evaluated in BOTH: an admin re-verify in the pending
// window re-notifies on a moved amount, and rolls the status back when a
// correction drops the dopłata under threshold.

describe('ClaimsService.verifyClaim — threshold status auto-transition', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('18. admin re-verify in OCZEKUJE with a CHANGED over-threshold amount re-notifies + nulls clearance, status stays pending', async () => {
    // Pending, previously notified at 1400 and Maksim already confirmed. A new
    // mileage correction moves the over-threshold amount to 900 (still > 500) →
    // re-notify, null the clearance, but the status stays OCZEKUJE (idempotent).
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE' as ClaimStatus,
      verifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      verifiedById: 'u-first',
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      maksimGateNotifiedAmount: 1_400,
      maksimGateClearedAt: new Date('2026-05-14T11:00:00.000Z'),
      maksimGateClearedById: 'u-clearer',
    });
    const repoFake = makeClaimsRepo([seeded]);
    // kmGuaranteed 10_800, rate 0.5, mileage 9_000 → kmDiff 1_800 → payment 900.
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    const out = await svc.verifyClaim(
      makeAuth('admin', 'u-admin'),
      seeded.nrZgl,
      { mileage: 9_000 },
    );
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    // The moved amount re-notifies Maksim and re-stamps the dedup.
    expect(mail.enqueueMaksimConfirmationRequest).toHaveBeenCalledTimes(1);
    expect(patch.maksimGateRequired).toBe(true);
    expect(patch.maksimGateNotifiedAt).toEqual(NOW);
    expect(patch.maksimGateNotifiedAmount).toBe(900);
    // The prior clearance is invalidated — Maksim must re-confirm the new amount.
    expect(patch.maksimGateClearedAt).toBeNull();
    expect(patch.maksimGateClearedById).toBeNull();
    // Still over threshold → status is NOT changed (idempotent re-save).
    expect(patch.status).toBeUndefined();
    expect(out.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(patch.verifiedAt).toEqual(NOW);
  });

  it('19. admin re-verify in OCZEKUJE that drops UNDER threshold rolls status back to NA_WERYFIKACJI + clears the whole gate', async () => {
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE' as ClaimStatus,
      verifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      verifiedById: 'u-first',
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      maksimGateNotifiedAmount: 1_400,
      maksimGateClearedAt: new Date('2026-05-14T11:00:00.000Z'),
      maksimGateClearedById: 'u-clearer',
    });
    const repoFake = makeClaimsRepo([seeded]);
    // Recalc lands the dopłata under the threshold (kmGuaranteed ≈ mileage).
    const km = makeKmCalcService({ kmGuaranteed: 8_100 });
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    const out = await svc.verifyClaim(
      makeAuth('admin', 'u-admin'),
      seeded.nrZgl,
      { mileage: 8_000 },
    );
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    // The math re-ran and the correction is honoured.
    expect(km.calls).toHaveLength(1);
    // Under threshold → the whole gate clears...
    expect(patch.maksimGateRequired).toBe(false);
    expect(patch.maksimGateNotifiedAt).toBeNull();
    expect(patch.maksimGateNotifiedAmount).toBeNull();
    expect(patch.maksimGateClearedAt).toBeNull();
    expect(patch.maksimGateClearedById).toBeNull();
    // ...and the status auto-rolls back to NA_WERYFIKACJI.
    expect(patch.status).toBe('NA_WERYFIKACJI');
    expect(patch.statusChangedAt).toEqual(NOW);
    expect(patch.decidedById).toBeUndefined();
    expect(out.status).toBe('NA_WERYFIKACJI');
    expect(out.maksimGateRequired).toBe(false);
    // No email for an under-threshold save.
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
  });

  it('20. idempotent re-save at the SAME over-threshold amount in OCZEKUJE → no email, no status change, clearance preserved', async () => {
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE' as ClaimStatus,
      verifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      verifiedById: 'u-first',
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      // Empty-body re-save resolves to the default paymentEur 1400 = last notified.
      maksimGateNotifiedAmount: 1_400,
      maksimGateClearedAt: new Date('2026-05-14T11:00:00.000Z'),
      maksimGateClearedById: 'u-clearer',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const prisma = makePrismaService();
    const mail = makeMailFake();
    const { svc } = makeService(repoFake, km.svc, prisma, mail, makeConfigFake());

    const out = await svc.verifyClaim(
      makeAuth('admin', 'u-admin'),
      seeded.nrZgl,
      {},
    );
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    // Amount unchanged → dedup holds, no re-send.
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
    // Gate columns untouched (undefined ⇒ column keeps its prior value)...
    expect(patch.maksimGateNotifiedAt).toBeUndefined();
    expect(patch.maksimGateNotifiedAmount).toBeUndefined();
    expect(patch.maksimGateClearedAt).toBeUndefined();
    expect(patch.maksimGateClearedById).toBeUndefined();
    // ...and the prior clearance survives.
    expect(out.maksimGateClearedAt).toBe(
      new Date('2026-05-14T11:00:00.000Z').toISOString(),
    );
    // Still over threshold in the pending window → status unchanged.
    expect(patch.status).toBeUndefined();
    expect(out.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(patch.verifiedAt).toEqual(NOW);
  });
});

// ── Limits freeze on the verifier recalc (feature «wyłączane limity») ──

describe('ClaimsService.verifyClaim — `_recalcClaim` limits snapshot', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('a verifier correction re-prices with the SUBMITTED limits, not the edited ones', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const { svc } = makeService(repoFake, km.svc, makePrismaService());

    await withAuditContext(() =>
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, { mileage: 7_000 }),
    );

    expect(km.calls).toHaveLength(1);
    const input = km.calls[0]!.input as {
      limitsSnapshot?: Record<string, unknown>;
    };
    // `makeBreakdown()` carries 2026-04 @ 540 km/day, 0.5 EUR/km.
    expect(input.limitsSnapshot).toEqual({
      '2026-04': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
    });
  });

});

// ── Mixed period settled on the daily-km board (docs/20 §0⁵) ─────────

describe('ClaimsService.verifyClaim — mixed period settled on the board', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // The spec example: 21.08–18.09.2025, August switched off (7 counted days),
  // September on (14 × 540 = 7560 km @ 0.50 €/km). drivenDays 21 ⇒ Maksim
  // threshold 500 €.
  const AUGUST_OFF = {
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
  };
  const SEPTEMBER_ON = {
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
  };
  const MIXED_CALC: Partial<KmCalcResult> = {
    totalDays: 21,
    rawTotalDays: 21,
    kmGuaranteed: 7_560,
    ratePerKmEffective: 0.5,
    breakdown: [AUGUST_OFF, SEPTEMBER_ON],
  };

  /** A wniosek last priced as a mixed period (board still empty at submit). */
  function mixedClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
    return makeClaim({
      dateStart: new Date('2025-08-21T00:00:00.000Z'),
      dateEnd: new Date('2025-09-18T00:00:00.000Z'),
      drivenDays: 21,
      mileage: 6_000,
      kmGuaranteed: 7_560,
      kmDifference: 7_560,
      paymentEur: 3_780,
      hoursAdjustedValue: 4,
      breakdown: {
        totalDays: 21,
        rawTotalDays: 21,
        kmGuaranteed: 7_560,
        ratePerKmEffective: 0.5,
        breakdown: [AUGUST_OFF, SEPTEMBER_ON],
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

  /** Every September day 01..18: `km` on the 1st, the rest idle, minus `missing`. */
  function septemberBoard(km: number, missing: readonly string[] = []): BoardDay[] {
    const rows: BoardDay[] = [];
    for (let d = 1; d <= 18; d += 1) {
      const date = `2025-09-${d < 10 ? `0${d}` : d}`;
      if (missing.includes(date)) continue;
      rows.push(
        d === 1 ? { date, state: 'drove', km } : { date, state: 'idle', km: null },
      );
    }
    return rows;
  }

  it('an EMPTY body still re-prices (forced) with the stored inputs, incl. the applied korekta', async () => {
    const seeded = mixedClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService(MIXED_CALC);
    const board = makeBoardRepo(septemberBoard(7_400));
    const { svc } = makeService(
      repoFake,
      km.svc,
      makePrismaService(),
      undefined,
      undefined,
      board.repo,
    );

    await withAuditContext(() =>
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {}),
    );

    expect(km.calls).toHaveLength(1);
    const input = km.calls[0]!.input as {
      dateStart: string;
      dateEnd: string;
      hoursAdjusted: number;
      limitsSnapshot?: Record<string, unknown>;
    };
    expect(input.dateStart).toBe('2025-08-21');
    expect(input.dateEnd).toBe('2025-09-18');
    // NOT the `?? 0` of the correction path — the forced refresh keeps 4 h.
    expect(input.hoursAdjusted).toBe(4);
    expect(input.limitsSnapshot).toEqual({
      '2025-08': { kmPerDay: 0, ratePerKm: 0.5, kmPerSaturday: 0 },
      '2025-09': { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0 },
    });
    expect(board.boardSpy).toHaveBeenCalledWith(
      'v-1',
      new Date('2025-08-21T00:00:00.000Z'),
      new Date('2025-09-19T00:00:00.000Z'),
    );
    const patch = repoFake.updateWithinCalls[0]!.data;
    // 7_560 − 7_400 = 160 ⇒ 80 € (under the 500 € threshold).
    expect(patch.paymentEur).toBe(80);
    expect(patch.breakdown?.mileageSource).toBe('board');
    expect(patch.breakdown?.mileageEffective).toBe(7_400);
    // No correction ⇒ the korekta column itself is not rewritten.
    expect(patch.hoursAdjustedValue).toBeUndefined();
  });

  it('C4: gaps on the board ⇒ numbers + stamp saved, but NO Maksim gate, NO status move, NO email', async () => {
    const seeded = mixedClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailFake();
    const { svc } = makeService(
      repoFake,
      makeKmCalcService(MIXED_CALC).svc,
      makePrismaService(),
      mail,
      makeConfigFake(),
      // 1_000 km on the board, the return day not recorded yet.
      makeBoardRepo(septemberBoard(1_000, ['2025-09-18'])).repo,
    );

    const { result: out } = await withAuditContext(() =>
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {}),
    );
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    // Stamped — `ODRZUCONO` stays reachable.
    expect(patch.verifiedAt).toEqual(NOW);
    expect(patch.verifiedById).toBe('u-actor');
    // The provisional numbers are saved: 7_560 − 1_000 = 6_560 ⇒ 3_280 € …
    expect(patch.paymentEur).toBe(3_280);
    // … which is over the 500 € threshold, yet nothing about the gate moves.
    expect(patch.status).toBeUndefined();
    expect(patch.statusChangedAt).toBeUndefined();
    expect(patch.maksimGateRequired).toBeUndefined();
    expect(patch.maksimGateNotifiedAt).toBeUndefined();
    expect(patch.maksimGateNotifiedAmount).toBeUndefined();
    expect(patch.maksimGateClearedAt).toBeUndefined();
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
    expect(out.status).toBe('NA_WERYFIKACJI');
  });

  it('C4 (admin, OCZEKUJE): gaps ⇒ no roll-back to NA_WERYFIKACJI and the gate stays as it was', async () => {
    const seeded = mixedClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE' as ClaimStatus,
      verifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      maksimGateNotifiedAmount: 3_780,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailFake();
    const { svc } = makeService(
      repoFake,
      makeKmCalcService(MIXED_CALC).svc,
      makePrismaService(),
      mail,
      makeConfigFake(),
      // Under threshold on the board (80 €) — but a day is still missing.
      makeBoardRepo(septemberBoard(7_400, ['2025-09-07'])).repo,
    );

    await withAuditContext(() =>
      svc.verifyClaim(makeAuth('admin', 'u-admin'), seeded.nrZgl, {}),
    );
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.paymentEur).toBe(80);
    expect(patch.status).toBeUndefined();
    expect(patch.maksimGateRequired).toBeUndefined();
    expect(patch.maksimGateNotifiedAmount).toBeUndefined();
    expect(mail.enqueueMaksimConfirmationRequest).not.toHaveBeenCalled();
  });

  it('a complete board runs the normal gate: over threshold ⇒ OCZEKUJE + one Maksim email at the board amount', async () => {
    const seeded = mixedClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailFake();
    const { svc } = makeService(
      repoFake,
      makeKmCalcService(MIXED_CALC).svc,
      makePrismaService(),
      mail,
      makeConfigFake(),
      makeBoardRepo(septemberBoard(2_000)).repo,
    );

    await withAuditContext(() =>
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {}),
    );
    await flushMicrotasks();

    const patch = repoFake.updateWithinCalls[0]!.data;
    // 7_560 − 2_000 = 5_560 ⇒ 2_780 € > 500 €.
    expect(patch.paymentEur).toBe(2_780);
    expect(patch.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(patch.maksimGateRequired).toBe(true);
    expect(patch.maksimGateNotifiedAmount).toBe(2_780);
    expect(mail.enqueueMaksimConfirmationRequest).toHaveBeenCalledTimes(1);
  });

  it('a mileage correction on a mixed period is saved, but the payout follows the board', async () => {
    const seeded = mixedClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const { svc } = makeService(
      repoFake,
      makeKmCalcService(MIXED_CALC).svc,
      makePrismaService(),
      undefined,
      undefined,
      makeBoardRepo(septemberBoard(7_400)).repo,
    );

    await withAuditContext(() =>
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, { mileage: 1 }),
    );

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.mileage).toBe(1);
    expect(patch.breakdown?.mileageEffective).toBe(7_400);
    expect(patch.kmDifference).toBe(160);
    expect(patch.paymentEur).toBe(80);
    // Day counters keep their meaning (August's 7 days are not active).
    expect(patch.breakdown?.daysActive).toBe(14);
    expect(patch.breakdown?.daysTotal).toBe(21);
  });

  it('an all-active wniosek with an empty body still skips km-calc and never reads the board', async () => {
    const seeded = makeClaim({ paymentEur: 300 });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const board = makeBoardRepo([]);
    const { svc } = makeService(
      repoFake,
      km.svc,
      makePrismaService(),
      undefined,
      undefined,
      board.repo,
    );

    await withAuditContext(() =>
      svc.verifyClaim(makeAuth('pracownik'), seeded.nrZgl, {}),
    );

    expect(km.calls).toHaveLength(0);
    expect(board.boardSpy).not.toHaveBeenCalled();
  });
});
