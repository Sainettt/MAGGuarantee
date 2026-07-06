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

function makeService(
  repoFake: ClaimsRepoFake,
  km: KmCalcService,
  prisma: PrismaService,
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
  );
  return { svc, audit };
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
