// Verification checkpoint («Zapisz weryfikację») — `ClaimsService.verifyClaim`.
//
// The pracownik persists corrections BEFORE any decision; the checkpoint stamps
// `verifiedAt`/`verifiedById` and (when the body carries a math-affecting
// correction) re-runs km-calc + mirrors `amountRequested`. An EMPTY body is
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
        kmInMonth: 10_800,
        excludedDays: [],
      },
    ],
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
    authorizationRequired: false,
    authorizationDescription: null,
    authorizationToken: null,
    authorizationDecidedAt: null,
    amountRequested: 1_400,
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
    origPaymentEur: 1_400,
    origTimeFrom: '08:00',
    origTimeTo: '18:00',
    origHoursAdjusted: 0,
    hoursAdjustedValue: 0,
    authScreenshotUrl: null,
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
          ...(data.amountRequested !== undefined
            ? { amountRequested: data.amountRequested }
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
  );
  return { svc, audit };
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

  it('1. empty body stamps verifiedAt/ById WITHOUT running km-calc (confirmed as-is)', async () => {
    const seeded = makeClaim();
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
    expect(patch.amountRequested).toBeUndefined();
    // Status is a flag, not a transition — unchanged.
    expect(patch.status).toBeUndefined();
    expect(out.status).toBe('NA_WERYFIKACJI');
    expect(out.verifiedAt).toBe(NOW.toISOString());
    expect(out.verifiedById).toBe('u-actor');
  });

  it('2. corrections trigger recalc + amountRequested mirror + verified stamp', async () => {
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
    // amountRequested mirrors the recalculated paymentEur.
    expect(patch.amountRequested).toBe(610);
    expect(patch.verifiedAt).toEqual(NOW);
    expect(patch.verifiedById).toBe('u-actor');
    expect(out.mileage).toBe(8_500);
    expect(out.paymentEur).toBe(610);
    expect(out.amountRequested).toBe(610);
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

  it('7. OVER threshold (empty body) arms the gate + sends the Maksim email exactly once', async () => {
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
    // Email enqueued exactly once with the recipient + core content rows.
    expect(mail.enqueueMaksimConfirmationRequest).toHaveBeenCalledTimes(1);
    const [email, props] =
      mail.enqueueMaksimConfirmationRequest.mock.calls[0]!;
    expect(email).toBe('maksim@magtrans.eu');
    expect(props.nrZgl).toBe(seeded.nrZgl);
    expect(props.doplata).toBe('1400.00');
    expect(props.prog).toBe('500.00');
    // DTO surfaces the gate for the web.
    expect(out.maksimGateRequired).toBe(true);
    expect(out.maksimGateNotifiedAt).toBe(NOW.toISOString());
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
