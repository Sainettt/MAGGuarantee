// Phase 4 — Sub-slice 4.1 — `ClaimsService.update()` unit tests.
//
// Covers the 5-helper pipeline (`_validateClaimUpdate`, `_recalcClaim`,
// `_persistClaimUpdate` via repo, `_handleReklamacjaTransition`,
// `_applyDecisionEmails`) plus the audit `before` snapshot the service
// stashes into `AuditContext` for the interceptor to commit alongside the
// mutation.
//
// Style follows `carriers.service.spec.ts`: hand-rolled fakes over `jest.fn`,
// no jest-mock-extended dependency.
//
// Pre-Phase-4.4 update: the service no longer opens its own
// `prisma.$transaction(...)` and no longer calls `auditWriter.log()` itself
// — both are now the `AuditInterceptor`'s job. Each test wraps the
// `svc.update(...)` call in `AuditContext.run(...)` to simulate the
// interceptor's transactional envelope; the test then asserts on the
// captured `before` snapshot via the run-store reference.

import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';
import type {
  BoardDay,
  ClaimStatus,
  KmCalcBreakdown,
  KmCalcResult,
  UpdateClaimDto,
} from '@magguarantee/shared';

import {
  AuditContext,
  type AuditContextStore,
} from '../../common/audit/audit-context';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import type { AuditWriter } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { KmCalcService } from '../km-calc/km-calc.service';
import type { MailService } from '../mail/mail.service';
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
import { makeAuthUser } from '../../common/testing/make-auth-user';

/**
 * Open an `AuditContext` around a service call so the service's
 * `AuditContext.setBefore(...)` lands on a captured store. Returns the call
 * result alongside the store so assertions can read the captured `before`.
 *
 * Mirrors what the production `AuditInterceptor` does for `@Audit()`-tagged
 * routes (opens a `prisma.$transaction` and wraps the handler in a context).
 * Here the tx is a sentinel because the spec doesn't exercise the writer
 * — only the service's interaction with the ambient store.
 */
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

// ─── fixtures ────────────────────────────────────────────────

const NOW = new Date('2026-05-15T10:00:00.000Z');

function makeAuth(role: AuthUser['role'], sub = 'u-actor'): AuthUser {
  return makeAuthUser(role, {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    mustChangePassword: false,
  });
}

function makeBreakdown(): KmCalcBreakdown {
  return {
    totalDays: 20,
    // No `hoursAdjusted` correction in the default fixture, so the raw
    // (pre-adjustment) total mirrors `totalDays`. Tests that exercise the
    // `<HoursReadout>` divergence override either field explicitly.
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
    // NA_WERYFIKACJI fixtures now carry a verification stamp so the decision
    // gate (`_assertVerifiedIfNaWeryfikacji`) passes by default; the dedicated
    // gate tests override `verifiedAt: null` to assert the 422.
    verifiedAt: new Date('2026-04-21T09:00:00.000Z'),
    verifiedById: 'u-verifier',
    verifiedBy: { id: 'u-verifier', login: 'ver', name: 'Verifier' },
    comment: null,
    decisionComment: null,
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
    // Numeric Decimal(5,2) columns post-migration. The fixture defaults to
    // 0/0 (both equal at submit) — individual tests override either field
    // to assert the new submit/PATCH semantics.
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

// ─── repo / service fakes ────────────────────────────────────

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
        // Translate the patch onto the seeded row so the next read sees it.
        const next: ClaimRow = {
          ...existing,
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.statusChangedAt !== undefined
            ? { statusChangedAt: data.statusChangedAt }
            : {}),
          ...(data.decidedById !== undefined
            ? { decidedById: data.decidedById }
            : {}),
          ...(data.verifiedAt !== undefined
            ? { verifiedAt: data.verifiedAt }
            : {}),
          ...(data.verifiedById !== undefined
            ? { verifiedById: data.verifiedById }
            : {}),
          ...(data.comment !== undefined ? { comment: data.comment } : {}),
          ...(data.decisionComment !== undefined
            ? { decisionComment: data.decisionComment }
            : {}),
          ...(data.orderNumber !== undefined
            ? { orderNumber: data.orderNumber }
            : {}),
          ...(data.orderDate !== undefined ? { orderDate: data.orderDate } : {}),
          ...(data.amountApproved !== undefined
            ? { amountApproved: data.amountApproved }
            : {}),
          ...(data.kmGuaranteed !== undefined
            ? { kmGuaranteed: data.kmGuaranteed }
            : {}),
          ...(data.kmDifference !== undefined
            ? { kmDifference: data.kmDifference }
            : {}),
          ...(data.paymentEur !== undefined
            ? { paymentEur: data.paymentEur }
            : {}),
          ...(data.drivenDays !== undefined
            ? { drivenDays: data.drivenDays }
            : {}),
          ...(data.kmPerDay !== undefined ? { kmPerDay: data.kmPerDay } : {}),
          ...(data.ratePerKmEffective !== undefined
            ? { ratePerKmEffective: data.ratePerKmEffective }
            : {}),
          ...(data.mileage !== undefined ? { mileage: data.mileage } : {}),
          ...(data.dateStart !== undefined
            ? { dateStart: data.dateStart }
            : {}),
          ...(data.dateEnd !== undefined ? { dateEnd: data.dateEnd } : {}),
          ...(data.timeFrom !== undefined ? { timeFrom: data.timeFrom } : {}),
          ...(data.timeTo !== undefined ? { timeTo: data.timeTo } : {}),
          ...(data.breakdown !== undefined
            ? { breakdown: data.breakdown }
            : {}),
          ...(data.reklamacjaResponse !== undefined
            ? { reklamacjaResponse: data.reklamacjaResponse }
            : {}),
          ...(data.reklamacjaAmount !== undefined
            ? { reklamacjaAmount: data.reklamacjaAmount }
            : {}),
          ...(data.reklamacjaSubmitted !== undefined
            ? { reklamacjaSubmitted: data.reklamacjaSubmitted }
            : {}),
          ...(data.reklamacjaText !== undefined
            ? { reklamacjaText: data.reklamacjaText }
            : {}),
          ...(data.reklamacjaSubmittedAt !== undefined
            ? { reklamacjaSubmittedAt: data.reklamacjaSubmittedAt }
            : {}),
          // Reklamacja decision columns (REWORK 2026-07-31) — the outcome and its
          // audit stamps, mirrored so the DTO assertions see them.
          ...(data.reklamacjaResolution !== undefined
            ? { reklamacjaResolution: data.reklamacjaResolution }
            : {}),
          ...(data.reklamacjaOrderNumber !== undefined
            ? { reklamacjaOrderNumber: data.reklamacjaOrderNumber }
            : {}),
          ...(data.reklamacjaDecidedAt !== undefined
            ? { reklamacjaDecidedAt: data.reklamacjaDecidedAt }
            : {}),
          ...(data.reklamacjaDecidedById !== undefined
            ? { reklamacjaDecidedById: data.reklamacjaDecidedById }
            : {}),
          ...(data.statusBeforeReklamacja !== undefined
            ? { statusBeforeReklamacja: data.statusBeforeReklamacja }
            : {}),
          ...(data.origDateStart !== undefined
            ? { origDateStart: data.origDateStart }
            : {}),
          ...(data.origDateEnd !== undefined
            ? { origDateEnd: data.origDateEnd }
            : {}),
          ...(data.origMileage !== undefined
            ? { origMileage: data.origMileage }
            : {}),
          ...(data.origHoursAdjusted !== undefined
            ? { origHoursAdjusted: data.origHoursAdjusted }
            : {}),
          ...(data.hoursAdjustedValue !== undefined
            ? { hoursAdjustedValue: data.hoursAdjustedValue }
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
        // Default raw equals adjusted total; per-test overrides pass either
        // field via `result` to exercise the divergence path.
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

function makeAuditWriter(): {
  writer: AuditWriter;
  logs: { action: string; targetKey?: string; before: unknown; after: unknown; tx: unknown }[];
} {
  const logs: {
    action: string;
    targetKey?: string;
    before: unknown;
    after: unknown;
    tx: unknown;
  }[] = [];
  const writer = {
    log: jest.fn(async (entry: Parameters<AuditWriter['log']>[0]) => {
      logs.push({
        action: entry.action,
        targetKey: entry.targetKey,
        before: entry.before,
        after: entry.after,
        tx: entry.tx,
      });
    }),
  } as unknown as AuditWriter;
  return { writer, logs };
}

function makePrismaService(): PrismaService {
  // Pre-Phase-4.4: the service uses `prisma.tx` exclusively. We expose both
  // `client` (for non-tx paths like `_collectSubmitRecipients`) and a `tx`
  // getter that returns the same mock surface. The transaction wrapper
  // moved to the interceptor — the test's `withAuditContext()` helper opens
  // an ambient context so the service sees a "tx" handle when it asks.
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
    // Test getter — the service treats `this.prisma.tx` as a Prisma delegate;
    // the mock client above is structurally close enough for the surfaces
    // exercised in the update() pipeline.
    get tx() {
      return client;
    },
    // submit() opens its own `prisma.$transaction(...)` — pass the mock client
    // straight through to the callback.
    $transaction: <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
      cb(client),
  } as unknown as PrismaService;
}

/**
 * Prisma fake whose carrier lookup actually resolves an address, so the
 * fire-and-forget notification path (`_collectClaimRecipients` →
 * `_resolveCarrierDisplayName`) has something to send to. The single
 * `carrier.findFirst` mock answers BOTH call sites (one selects `user.email`, the
 * other `user.login`/`name`), which is why the fixture carries all three.
 */
function makeNotifyingPrismaService(): PrismaService {
  const client = {
    user: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    carrier: {
      findFirst: jest.fn(async () => ({
        user: {
          email: 'carrier@example.com',
          login: 'pwz1',
          name: 'Pwz One',
        },
        opiekun: null,
      })),
    },
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

/** MailService spy exposing just the enqueue methods the decision paths use. */
function makeMailServiceSpy(): {
  service: MailService;
  reklamacjaDecision: jest.Mock;
  carrierDecision: jest.Mock;
  internalDecision: jest.Mock;
} {
  const reklamacjaDecision = jest.fn(async () => undefined);
  const carrierDecision = jest.fn(async () => undefined);
  const internalDecision = jest.fn(async () => undefined);
  const service = {
    enqueueReklamacjaCarrierDecision: reklamacjaDecision,
    enqueueCarrierDecision: carrierDecision,
    enqueueInternalDecision: internalDecision,
  } as unknown as MailService;
  return { service, reklamacjaDecision, carrierDecision, internalDecision };
}

/** Let the post-commit fire-and-forget email continuation run to completion. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    await Promise.resolve();
  }
}

function makeServiceWithMail(
  repoFake: ClaimsRepoFake,
  km: KmCalcService,
  audit: AuditWriter,
  prisma: PrismaService,
  mail: MailService,
): ClaimsService {
  const noop = {} as unknown;
  const config = {
    // Key-aware: only APP_URL resolves. `GMAIL_FROM` must stay undefined or the
    // generic path would gain a phantom internal recipient.
    get: jest.fn((key: string) =>
      key === 'APP_URL' ? 'http://localhost:3000' : undefined,
    ),
  } as unknown as ConfigService<Env, true>;
  return new ClaimsService(
    repoFake.repo,
    noop as CarriersRepository,
    noop as VehiclesRepository,
    noop as DriversRepository,
    noop as TrailersRepository,
    km,
    noop as NrZglService,
    prisma,
    audit,
    mail,
    config,
  );
}

function makeService(
  repoFake: ClaimsRepoFake,
  km: KmCalcService,
  audit: AuditWriter,
  prisma: PrismaService,
  dailyKm?: VehicleDailyKmRepository,
): ClaimsService {
  // The four ownership repos and NrZglService are not exercised in this
  // verifier-side path. Bare `{}` casts are fine because the methods we hit
  // are all confined to the update() pipeline.
  const noop = {} as unknown;
  return new ClaimsService(
    repoFake.repo,
    noop as CarriersRepository,
    noop as VehiclesRepository,
    noop as DriversRepository,
    noop as TrailersRepository,
    km,
    noop as NrZglService,
    prisma,
    audit,
    undefined,
    undefined,
    dailyKm,
  );
}

// ─── tests ───────────────────────────────────────────────────

describe('ClaimsService.update — Phase 4 sub-slice 4.1', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('1. NA_WERYFIKACJI → ZAAKCEPTOWANO with orderNumber/orderDate/amountApproved persists + audits', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-12345',
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    };

    const { result: out, store } = await withAuditContext(() =>
      svc.update(makeAuth('pracownik'), seeded.nrZgl, dto),
    );

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(out.orderNumber).toBe('ZL-12345');
    expect(out.orderDate).toBe('2026-04-30');
    expect(out.amountApproved).toBe(1_400);
    expect(repoFake.updateWithinCalls).toHaveLength(1);
    expect(repoFake.updateWithinCalls[0]!.data.decidedById).toBe('u-actor');

    // Audit row is now written by the interceptor (not the service). The
    // service's contribution is the `before` snapshot pushed into the
    // ambient AuditContext — the interceptor picks it up on commit. Asserting
    // on the captured store value here gives us the same coverage of the
    // service's audit responsibility.
    const before = store.before as { status: ClaimStatus };
    expect(before.status).toBe('NA_WERYFIKACJI');
    // No direct `AuditWriter.log()` call from the service anymore.
    expect(audit.logs).toHaveLength(0);
  });

  it('2. NA_WERYFIKACJI → ZAAKCEPTOWANO WITHOUT orderNumber throws 400 + no writes', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const badDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: '', // empty — service-level guard must reject
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    } as unknown as UpdateClaimDto;

    await expect(
      svc.update(makeAuth('pracownik'), seeded.nrZgl, badDto),
    ).rejects.toThrow(BadRequestException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(audit.logs).toHaveLength(0);
  });

  it('3. illegal transition (ZAAKCEPTOWANO → NA_WERYFIKACJI) throws 422 + no writes', async () => {
    const seeded = makeClaim({ status: 'ZAAKCEPTOWANO' });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    // Forge a payload that targets NA_WERYFIKACJI — not in the discriminated
    // union, but we bypass Zod here to exercise the service guard.
    const illegalDto = {
      targetStatus: 'NA_WERYFIKACJI',
    } as unknown as UpdateClaimDto;

    await expect(
      svc.update(makeAuth('pracownik'), seeded.nrZgl, illegalDto),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(audit.logs).toHaveLength(0);
  });

  it('4. ODRZUCONO transition with comment-only DOES NOT call km-calc (pure decision)', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ODRZUCONO',
      comment: 'Brak podstaw — niepoprawne dane.',
    };

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    expect(out.status).toBe('ODRZUCONO');
    // UWAGI #4 — the reason is the verifier's `decisionComment`; the
    // carrier's `comment` (null in this fixture) is not written.
    expect(out.decisionComment).toBe('Brak podstaw — niepoprawne dane.');
    expect(out.comment).toBeNull();
    expect(repoFake.updateWithinCalls[0]!.data).not.toHaveProperty('comment');
    // KmCalcService MUST NOT have been touched — no correction fields.
    expect(km.calls).toHaveLength(0);

    // kmGuaranteed / paymentEur stayed at seeded values.
    const updated = repoFake.rows.get(seeded.nrZgl)!;
    expect(updated.kmGuaranteed).toBe(seeded.kmGuaranteed);
    expect(updated.paymentEur).toBe(seeded.paymentEur);
    // No recalc ⇒ no km-calc column is written at all (the whole block is gated
    // on `if (recalc)`); the seeded values survive untouched.
    expect(repoFake.updateWithinCalls[0]!.data.paymentEur).toBeUndefined();
    expect(repoFake.updateWithinCalls[0]!.data.kmGuaranteed).toBeUndefined();
  });

  it('5. ZAAKCEPTOWANO with corrected mileage triggers km-calc recalc', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    // Recalc returns different numbers — proving the engine was actually
    // invoked and its output propagated.
    const km = makeKmCalcService({
      totalDays: 18,
      rawTotalDays: 18,
      kmGuaranteed: 9_720,
      ratePerKmEffective: 0.5,
    });
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-99',
      orderDate: '2026-04-30',
      amountApproved: 1_000,
      mileage: 8_500, // verifier corrected the mileage downward
    };

    await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    expect(km.calls).toHaveLength(1);
    const updated = repoFake.rows.get(seeded.nrZgl)!;
    expect(updated.kmGuaranteed).toBe(9_720);
    // kmDifference = 9_720 - 8_500 = 1_220 → paymentEur = 1_220 * 0.5 = 610
    expect(updated.paymentEur).toBe(610);
    expect(updated.mileage).toBe(8_500);
    // INVARIANT: whenever the math re-runs, the recalculated `paymentEur` is
    // persisted, so a stale amount never leaks into the kwota-Maksima email or
    // the reklamacja amount cap. (Before 2026-07-26 this also had to be mirrored
    // into a second `amountRequested` column; that column is gone.)
    expect(repoFake.updateWithinCalls[0]!.data.paymentEur).toBe(610);
  });

  it('5b. correcting dateStart/dateEnd sets periodAdjustedByVerifier=true (auto-recalc boundary)', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService({ totalDays: 19, rawTotalDays: 19 });
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-77',
      orderDate: '2026-04-30',
      amountApproved: 1_000,
      dateEnd: '2026-04-19', // verifier shortened the period by a day
    };

    await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    expect(
      repoFake.updateWithinCalls[0]!.data.periodAdjustedByVerifier,
    ).toBe(true);
    // Manual period edit also RESETS the stored auto-recalc result to `none`
    // (the «wymaga uwagi» badge goes dark — attention handled by the human).
    expect(repoFake.updateWithinCalls[0]!.data.autoRecalcState).toBe('none');
  });

  it('5c. a decision WITHOUT touching dates leaves periodAdjustedByVerifier + autoRecalcState unset', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ODRZUCONO',
      comment: 'Brak podstaw.',
    };

    await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    // Not written → the column keeps its current value (the auto-recalc still
    // applies if the outing later transitions).
    expect(
      repoFake.updateWithinCalls[0]!.data.periodAdjustedByVerifier,
    ).toBeUndefined();
    // No period edit ⇒ the stored auto-recalc result is NOT reset.
    expect(
      repoFake.updateWithinCalls[0]!.data.autoRecalcState,
    ).toBeUndefined();
  });

  it('7. REKLAMACJA_ZAAKCEPTOWANO returns the status to statusBeforeReklamacja and records UZNANA', async () => {
    const seeded = makeClaim({
      status: 'REKLAMACJA',
      statusBeforeReklamacja: 'ODRZUCONO',
      reklamacjaSubmitted: true,
      reklamacjaText: 'Proszę o ponowną weryfikację — błędne dane.',
      reklamacjaAmount: 500,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
      reklamacjaOrderNumber: 'ZL-REK-77',
      comment: 'Uznanie reklamacji.',
    };

    await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    const updated = repoFake.rows.get(seeded.nrZgl)!;
    // Variant A — the wniosek verdict is untouched: the status goes BACK.
    expect(updated.status).toBe('ODRZUCONO');
    // The outcome lives ONLY here (never inferred from `status`).
    expect(updated.reklamacjaResolution).toBe('UZNANA');
    expect(updated.reklamacjaOrderNumber).toBe('ZL-REK-77');
    expect(updated.reklamacjaResponse).toBe('Uznanie reklamacji.');
    // The paid amount is the carrier's own frozen kwota — staff send none.
    expect(updated.reklamacjaAmount).toBe(500);
    // Orig snapshot left as-is (historical record per docs/01-overview.md).
    expect(updated.statusBeforeReklamacja).toBe('ODRZUCONO');
  });

  it('8. claim not found → NotFoundException + no writes, no audit', async () => {
    const repoFake = makeClaimsRepo([]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    await expect(
      svc.update(makeAuth('pracownik'), 'GWA/999/04/26', {
        targetStatus: 'ODRZUCONO',
        comment: 'whatever',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(audit.logs).toHaveLength(0);
  });

  // ── verification gate (CLAIM_NOT_VERIFIED) ────────────────
  //
  // A decision FROM `NA_WERYFIKACJI` is blocked until the pracownik saved the
  // verification checkpoint (`verifiedAt` stamped). Transitions FROM
  // `OCZEKUJE_NA_AUTORYZACJE` and `REKLAMACJA` are NOT gated (already verified).

  it('G1. unverified NA_WERYFIKACJI → ZAAKCEPTOWANO throws 422 CLAIM_NOT_VERIFIED + no writes', async () => {
    const seeded = makeClaim({ verifiedAt: null, verifiedById: null });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-1',
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    };

    let caught: unknown;
    try {
      await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    // The stable machine code travels in the 422 body.
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
    };
    expect(body.code).toBe('CLAIM_NOT_VERIFIED');
    // Gate fires before persistence — claim stays put.
    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(km.calls).toHaveLength(0);
  });

  it('G2. unverified NA_WERYFIKACJI → ODRZUCONO is ALSO gated (any decision blocked)', async () => {
    const seeded = makeClaim({ verifiedAt: null, verifiedById: null });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    await expect(
      svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'ODRZUCONO',
        comment: 'Brak podstaw.',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('G3. verified NA_WERYFIKACJI → ZAAKCEPTOWANO passes the gate', async () => {
    // Default fixture is now verified — the decision should go through.
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-1',
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    });

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('G4. OCZEKUJE_NA_AUTORYZACJE → ZAAKCEPTOWANO is NOT verification-gated even without verifiedAt', async () => {
    // A claim pending authorization was already verified before leaving
    // NA_WERYFIKACJI; the CLAIM_NOT_VERIFIED gate only applies to
    // NA_WERYFIKACJI. Seed with no stamp to prove the status short-circuit (not
    // the stamp) drives the pass. maksimGateRequired stays false (default), so
    // the Maksim gate does not fire either.
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      verifiedAt: null,
      verifiedById: null,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-1',
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    });

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('G5. a reklamacja resolution is NOT verification-gated (and returns the status)', async () => {
    const seeded = makeClaim({
      status: 'REKLAMACJA',
      statusBeforeReklamacja: 'ODRZUCONO',
      reklamacjaSubmitted: true,
      reklamacjaAmount: 500,
      verifiedAt: null,
      verifiedById: null,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
      reklamacjaOrderNumber: 'ZL-REK-1',
      comment: 'Uznanie reklamacji.',
    });

    // Variant A — the status goes BACK to statusBeforeReklamacja; the outcome
    // lives in `reklamacjaResolution`.
    expect(out.status).toBe('ODRZUCONO');
    expect(out.reklamacjaResolution).toBe('UZNANA');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  // ── Maksim authorization gate (CLAIM_AUTHORIZATION_REQUIRED) ───
  //
  // A decision on an over-threshold VERIFIED claim (now sitting in
  // `OCZEKUJE_NA_AUTORYZACJE`, auto-moved there at verification) is HARD-blocked
  // until the confirmation screenshot cleared the gate. Stricter than
  // CLAIM_NOT_VERIFIED. Blocks BOTH accept and reject. Gated on the decision edge
  // out of either verification-window status; REKLAMACJA paths are NOT gated.

  it('M1. OCZEKUJE_NA_AUTORYZACJE → ZAAKCEPTOWANO with armed+uncleared gate throws 422 CLAIM_AUTHORIZATION_REQUIRED + no writes', async () => {
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      maksimGateRequired: true,
      maksimGateClearedAt: null,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    let caught: unknown;
    try {
      await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'ZAAKCEPTOWANO',
        orderNumber: 'ZL-1',
        orderDate: '2026-04-30',
        amountApproved: 1_400,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
      extensions?: { code?: string };
    };
    expect(body.code).toBe('CLAIM_AUTHORIZATION_REQUIRED');
    // The machine code is ALSO carried under `extensions` so the global
    // ProblemDetailsFilter lifts it into the RFC-7807 body — this is the exact
    // JSON path the web reads (`body.extensions.code`).
    expect(body.extensions?.code).toBe('CLAIM_AUTHORIZATION_REQUIRED');
    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(km.calls).toHaveLength(0);
  });

  it('M2. armed+uncleared gate ALSO blocks ODRZUCONO (both decisions blocked)', async () => {
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      maksimGateRequired: true,
      maksimGateClearedAt: null,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    let caught: unknown;
    try {
      await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'ODRZUCONO',
        comment: 'Odmowa.',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
      extensions?: { code?: string };
    };
    expect(body.code).toBe('CLAIM_AUTHORIZATION_REQUIRED');
    expect(body.extensions?.code).toBe('CLAIM_AUTHORIZATION_REQUIRED');
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('M3. armed gate that has been CLEARED passes the decision (out of OCZEKUJE)', async () => {
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      maksimGateRequired: true,
      maksimGateClearedAt: new Date('2026-04-21T10:00:00.000Z'),
      maksimGateClearedById: 'u-maksim-clearer',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-1',
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    });

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('M4. gate NOT required (below threshold) passes without a clearance', async () => {
    // maksimGateRequired=false is the default fixture — the decision goes through.
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-1',
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    });

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  // ── hours-adjusted Decimal split (orig vs value) ──────────
  //
  // Locks in the post-migration storage shape for the carrier hours-
  // adjustment value: `origHoursAdjusted` is the immutable carrier snapshot
  // (set-once at submit), `hoursAdjustedValue` is the verifier-mutable
  // applied value that drives km-calc. See
  // packages/database/prisma/migrations/20260514120000_claim_hours_adjusted_numeric.

  it('9. PATCH with hoursAdjusted mutates ONLY hoursAdjustedValue (origHoursAdjusted preserved)', async () => {
    // Starting state: carrier originally submitted 5.5h; nothing has changed
    // since so both columns sit at 5.5.
    const seeded = makeClaim({
      origHoursAdjusted: 5.5,
      hoursAdjustedValue: 5.5,
    });
    const repoFake = makeClaimsRepo([seeded]);
    // Recalc to confirm km-calc receives the NEW value (8) and not the snapshot.
    const km = makeKmCalcService({
      totalDays: 19,
      kmGuaranteed: 10_260,
      ratePerKmEffective: 0.5,
    });
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-42',
      orderDate: '2026-04-30',
      amountApproved: 1_100,
      hoursAdjusted: 8,
    };

    const { store } = await withAuditContext(() =>
      svc.update(makeAuth('pracownik'), seeded.nrZgl, dto),
    );

    // Persisted patch carries the new applied value and leaves the snapshot
    // untouched (no `origHoursAdjusted` key in the update payload at all).
    expect(repoFake.updateWithinCalls).toHaveLength(1);
    const persisted = repoFake.updateWithinCalls[0]!.data;
    expect(persisted.hoursAdjustedValue).toBe(8);
    expect(persisted.origHoursAdjusted).toBeUndefined();

    // Translated row reflects the split: snapshot pinned at 5.5, applied at 8.
    const updated = repoFake.rows.get(seeded.nrZgl)!;
    expect(updated.origHoursAdjusted).toBe(5.5);
    expect(updated.hoursAdjustedValue).toBe(8);

    // km-calc was invoked with the corrected hoursAdjusted (8), not the snapshot.
    expect(km.calls).toHaveLength(1);
    expect(
      (km.calls[0]!.input as { hoursAdjusted: number }).hoursAdjusted,
    ).toBe(8);

    // Audit `before` — pushed into the ambient AuditContext by the service.
    // The interceptor writes both `before` (from context) and `after` (from
    // response body) on commit, so the History tab still reads
    // "Carrier: 5.5 → Currently: 5.5 → Now: 8". The `after` half is now the
    // controller's response — verified via the repo's translated row above.
    const before = store.before as {
      origHoursAdjusted: number | null;
      hoursAdjustedValue: number | null;
    };
    expect(before.origHoursAdjusted).toBe(5.5);
    expect(before.hoursAdjustedValue).toBe(5.5);
    // Service no longer calls AuditWriter.log() directly.
    expect(audit.logs).toHaveLength(0);
  });

  // ── Fix 3: authoritative accept-guard (no under-run ⇒ no payout) ─────
  //
  // A claim may only be moved into an ACCEPTED state when the (re)calculated
  // km-difference shows an under-run (kmGuaranteed - mileage > 0). This is the
  // server-side mirror of the carrier-UI accept-gate; a forged/stale PATCH must
  // not be able to flip a "guarantee met/exceeded" claim into a paid state.
  // Rejection paths are never gated by this rule.

  it('13a. ZAAKCEPTOWANO when recalc shows kmDifference <= 0 → 422 + no writes', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    // Verifier corrects mileage UPWARD so the carrier "drove the guarantee":
    // recalc kmGuaranteed = 10_800, mileage = 11_000 ⇒ kmDifference = -200.
    const km = makeKmCalcService({
      totalDays: 20,
      rawTotalDays: 20,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
    });
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-7',
      orderDate: '2026-04-30',
      amountApproved: 0,
      mileage: 11_000, // exceeds the guarantee → no under-run
    };

    await expect(
      svc.update(makeAuth('pracownik'), seeded.nrZgl, dto),
    ).rejects.toThrow(UnprocessableEntityException);

    // Guard fires BEFORE any persistence — claim stays at NA_WERYFIKACJI.
    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(audit.logs).toHaveLength(0);
    expect(repoFake.rows.get(seeded.nrZgl)!.status).toBe('NA_WERYFIKACJI');
  });

  it('13b. ZAAKCEPTOWANO with no math edits but persisted kmDifference <= 0 → 422', async () => {
    // No correction fields ⇒ recalc skipped; the guard must fall back to the
    // persisted row value. Seed a claim whose stored kmDifference is 0.
    const seeded = makeClaim({ kmDifference: 0, paymentEur: 0 });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-8',
      orderDate: '2026-04-30',
      amountApproved: 0,
    };

    await expect(
      svc.update(makeAuth('pracownik'), seeded.nrZgl, dto),
    ).rejects.toThrow(UnprocessableEntityException);

    // km-calc must NOT have run (pure decision PATCH).
    expect(km.calls).toHaveLength(0);
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('13c. REKLAMACJA_ZAAKCEPTOWANO is EXEMPT from the compensation-due guard (kmDifference <= 0 still passes)', async () => {
    // docs/14 §6.5.15 D — an uznana reklamacja pays the carrier's FIXED
    // `reklamacjaAmount` (capped at submit), which is independent of the
    // km-calc. A wniosek rejected precisely because the calc showed no under-run
    // is exactly the case where a reklamacja is legitimate, so gating it would
    // make the outcome unreachable.
    const seeded = makeClaim({
      status: 'REKLAMACJA',
      statusBeforeReklamacja: 'ODRZUCONO',
      reklamacjaSubmitted: true,
      reklamacjaAmount: 500,
      // Guarantee was met → no compensation due by the calc.
      kmDifference: 0,
      paymentEur: 0,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
      reklamacjaOrderNumber: 'ZL-REK-13c',
    });

    expect(out.reklamacjaResolution).toBe('UZNANA');
    expect(out.status).toBe('ODRZUCONO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
    // Amounts are FROZEN on a reklamacja branch — km-calc must not have run.
    expect(km.calls).toHaveLength(0);
  });

  it('13d. ZAAKCEPTOWANO when recalc shows kmDifference > 0 → ok (compensation due)', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    // Default km-calc: kmGuaranteed = 10_800; mileage corrected to 9_000 ⇒
    // kmDifference = 1_800 > 0 → under-run → accept allowed.
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-9',
      orderDate: '2026-04-30',
      amountApproved: 900,
      mileage: 9_000,
    };

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
    // kmDifference = 10_800 - 9_000 = 1_800; paymentEur = 1_800 * 0.5 = 900.
    expect(out.kmDifference).toBe(1_800);
    expect(out.paymentEur).toBe(900);
  });

  it('13e. ODRZUCONO is NOT gated even when kmDifference <= 0 (rejection always allowed)', async () => {
    // Carrier drove the guarantee (kmDifference = 0) — rejecting is fine.
    const seeded = makeClaim({ kmDifference: 0, paymentEur: 0 });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ODRZUCONO',
      comment: 'Brak niedopałania — gwarancja wyjeżdżona.',
    };

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    expect(out.status).toBe('ODRZUCONO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('10. PATCH WITHOUT hoursAdjusted leaves BOTH columns untouched', async () => {
    // Pure decision PATCH (ZAAKCEPTOWANO with order info only). Neither
    // column should appear in the update payload — orig stays orig, applied
    // stays applied.
    const seeded = makeClaim({
      origHoursAdjusted: 5.5,
      hoursAdjustedValue: 5.5,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-99',
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    };

    await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    const persisted = repoFake.updateWithinCalls[0]!.data;
    expect(persisted.hoursAdjustedValue).toBeUndefined();
    expect(persisted.origHoursAdjusted).toBeUndefined();

    // km-calc must NOT have been touched — no math-affecting correction.
    expect(km.calls).toHaveLength(0);

    const updated = repoFake.rows.get(seeded.nrZgl)!;
    expect(updated.origHoursAdjusted).toBe(5.5);
    expect(updated.hoursAdjustedValue).toBe(5.5);
  });

  // ── in-transit gate (CLAIM_DELEGATION_IN_TRANSIT) ─────────
  //
  // A decision (accept / reject) is HARD-blocked while the LINKED outing is
  // still `w_trasie` — the period/mileage isn't final until `zjechal`. This is
  // the OUTERMOST gate: on a still-driving + unverified claim it fires BEFORE
  // CLAIM_NOT_VERIFIED. A `zjechal` outing (or a claim with no `delegationId`)
  // passes through. Blocks BOTH accept and reject.

  it('T1. ZAAKCEPTOWANO on a claim whose linked outing is w_trasie throws 422 CLAIM_DELEGATION_IN_TRANSIT + no writes', async () => {
    const seeded = makeClaim({
      delegationId: 'deleg-1',
      delegationStatus: 'w_trasie',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    let caught: unknown;
    try {
      await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'ZAAKCEPTOWANO',
        orderNumber: 'ZL-1',
        orderDate: '2026-04-30',
        amountApproved: 1_400,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
      extensions?: { code?: string };
    };
    expect(body.code).toBe('CLAIM_DELEGATION_IN_TRANSIT');
    expect(body.extensions?.code).toBe('CLAIM_DELEGATION_IN_TRANSIT');
    // Gate fires before persistence and before km-calc.
    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(km.calls).toHaveLength(0);
  });

  it('T2. ODRZUCONO on a claim whose linked outing is w_trasie is ALSO gated', async () => {
    const seeded = makeClaim({
      delegationId: 'deleg-1',
      delegationStatus: 'w_trasie',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    let caught: unknown;
    try {
      await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'ODRZUCONO',
        comment: 'Odmowa.',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
    };
    expect(body.code).toBe('CLAIM_DELEGATION_IN_TRANSIT');
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('T3. ordering — a w_trasie + UNVERIFIED claim reports IN_TRANSIT, not NOT_VERIFIED (in-transit gate is outermost)', async () => {
    const seeded = makeClaim({
      delegationId: 'deleg-1',
      delegationStatus: 'w_trasie',
      verifiedAt: null,
      verifiedById: null,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    let caught: unknown;
    try {
      await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'ZAAKCEPTOWANO',
        orderNumber: 'ZL-1',
        orderDate: '2026-04-30',
        amountApproved: 1_400,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
    };
    // In-transit gate wins the race — the in-transit code, NOT CLAIM_NOT_VERIFIED.
    expect(body.code).toBe('CLAIM_DELEGATION_IN_TRANSIT');
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('T4. ZAAKCEPTOWANO passes when the linked outing has returned (zjechal)', async () => {
    const seeded = makeClaim({
      delegationId: 'deleg-1',
      delegationStatus: 'zjechal',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-1',
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    });

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('T5. ODRZUCONO passes when the linked outing has returned (zjechal)', async () => {
    const seeded = makeClaim({
      delegationId: 'deleg-1',
      delegationStatus: 'zjechal',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'ODRZUCONO',
      comment: 'Odmowa po zjeździe.',
    });

    expect(out.status).toBe('ODRZUCONO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  // ── reklamacja resolutions (REWORK 2026-07-31, variant A) ──
  //
  // Pins the four load-bearing decisions of the rework:
  //  (a) a `REKLAMACJA_*` target is refused unless a reklamacja is PENDING
  //      (`status === 'REKLAMACJA'`) — otherwise the synthetic accept would slip
  //      through the legal `NA_WERYFIKACJI → ZAAKCEPTOWANO` edge as a fresh
  //      accept, while skipping every decision gate;
  //  (b) BOTH outcomes return `status` to `statusBeforeReklamacja` — the outcome
  //      lives ONLY in `reklamacjaResolution`;
  //  (c) the wniosek's own decision + payout columns are NEVER touched (this is
  //      also what keeps DB CHECK `claim_accepted_payment_complete` satisfied on
  //      the `ODRZUCONO → REKLAMACJA → uznana` path);
  //  (d) `statusChangedAt === reklamacjaDecidedAt` to the instant — the weekly
  //      report relies on that equality to exclude rollbacks from "freshly
  //      decided".

  function seedPendingReklamacja(
    statusBefore: ClaimStatus,
    overrides: Partial<ClaimRow> = {},
  ): ClaimRow {
    return makeClaim({
      status: 'REKLAMACJA',
      statusBeforeReklamacja: statusBefore,
      reklamacjaSubmitted: true,
      reklamacjaText: 'Za mało wypłacono.',
      reklamacjaAmount: 250,
      reklamacjaSubmittedAt: new Date('2026-05-14T08:00:00.000Z'),
      // A previously ACCEPTED wniosek carries its payout; a rejected one does not.
      ...(statusBefore === 'ZAAKCEPTOWANO'
        ? {
            amountApproved: 1_150,
            orderNumber: 'ZL-ORIG',
            orderDate: new Date('2026-04-30T00:00:00.000Z'),
            decidedById: 'u-original-decider',
          }
        : { decidedById: 'u-original-decider' }),
      ...overrides,
    });
  }

  it('R1. REKLAMACJA_ZAAKCEPTOWANO on a NA_WERYFIKACJI claim → 422 REKLAMACJA_NOT_PENDING + no writes', async () => {
    const seeded = makeClaim(); // NA_WERYFIKACJI, no reklamacja
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    let caught: unknown;
    try {
      await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
        reklamacjaOrderNumber: 'ZL-REK-1',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
      extensions?: { code?: string };
    };
    expect(body.code).toBe('REKLAMACJA_NOT_PENDING');
    expect(body.extensions?.code).toBe('REKLAMACJA_NOT_PENDING');
    // Would otherwise have been a legal NA_WERYFIKACJI → ZAAKCEPTOWANO edge.
    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(repoFake.rows.get(seeded.nrZgl)!.status).toBe('NA_WERYFIKACJI');
  });

  it('R2. REKLAMACJA_ODRZUCONO on a decided claim → 422 REKLAMACJA_NOT_PENDING', async () => {
    const seeded = makeClaim({ status: 'ZAAKCEPTOWANO', amountApproved: 1_400 });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    await expect(
      svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'REKLAMACJA_ODRZUCONO',
        comment: 'Nie uznajemy.',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('R3. uznana from statusBefore=ZAAKCEPTOWANO — status returns, wniosek payout untouched', async () => {
    const seeded = seedPendingReklamacja('ZAAKCEPTOWANO');
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const { store } = await withAuditContext(() =>
      svc.update(makeAuth('pracownik', 'u-rek-decider'), seeded.nrZgl, {
        targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
        reklamacjaOrderNumber: 'ZL-REK-3',
        comment: 'Uznajemy różnicę.',
      }),
    );

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.status).toBe('ZAAKCEPTOWANO');
    expect(patch.reklamacjaResolution).toBe('UZNANA');
    expect(patch.reklamacjaOrderNumber).toBe('ZL-REK-3');
    expect(patch.reklamacjaResponse).toBe('Uznajemy różnicę.');
    expect(patch.reklamacjaDecidedById).toBe('u-rek-decider');
    // (c) the wniosek's own decision + payout are NOT in the patch at all.
    expect(patch.decidedById).toBeUndefined();
    expect(patch.amountApproved).toBeUndefined();
    expect(patch.orderNumber).toBeUndefined();
    expect(patch.orderDate).toBeUndefined();
    expect(patch.paymentEur).toBeUndefined();
    expect(patch.reklamacjaAmount).toBeUndefined();
    // (d) both stamps are the SAME instant.
    expect(patch.reklamacjaDecidedAt).toBeInstanceOf(Date);
    expect((patch.reklamacjaDecidedAt as Date).getTime()).toBe(
      (patch.statusChangedAt as Date).getTime(),
    );
    // No recalc on a reklamacja branch.
    expect(km.calls).toHaveLength(0);
    // The audit `before` snapshot carries the whole reklamacja block.
    const before = store.before as Record<string, unknown>;
    expect(before.reklamacjaResolution).toBeNull();
    expect(before.reklamacjaAmount).toBe(250);
    expect(before.statusBeforeReklamacja).toBe('ZAAKCEPTOWANO');
    // Row state after: the original decider survives.
    const updated = repoFake.rows.get(seeded.nrZgl)!;
    expect(updated.decidedById).toBe('u-original-decider');
    expect(updated.amountApproved).toBe(1_150);
    expect(updated.orderNumber).toBe('ZL-ORIG');
  });

  it('R4. uznana from statusBefore=ODRZUCONO — status returns to ODRZUCONO (outcome only in resolution)', async () => {
    const seeded = seedPendingReklamacja('ODRZUCONO');
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
      reklamacjaOrderNumber: 'ZL-REK-4',
    });

    // The wniosek stays REJECTED — only the reklamacja is paid, under its own
    // nr zlecenia. This is the path that used to violate DB CHECK
    // `claim_accepted_payment_complete` (ZAAKCEPTOWANO without a payout).
    expect(out.status).toBe('ODRZUCONO');
    expect(out.reklamacjaResolution).toBe('UZNANA');
    expect(out.amountApproved).toBeNull();
    expect(out.orderNumber).toBeNull();
    // Optional comment omitted ⇒ `reklamacjaResponse` not written.
    expect(
      repoFake.updateWithinCalls[0]!.data.reklamacjaResponse,
    ).toBeUndefined();
  });

  it('R5. odrzucona — resolution + reason persisted, status returns', async () => {
    const seeded = seedPendingReklamacja('ZAAKCEPTOWANO');
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(
      makeAuth('pracownik', 'u-rek-decider'),
      seeded.nrZgl,
      {
        targetStatus: 'REKLAMACJA_ODRZUCONO',
        comment: 'Kwota wypłacona zgodna z umową.',
      },
    );

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(out.reklamacjaResolution).toBe('ODRZUCONA');
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.reklamacjaResponse).toBe('Kwota wypłacona zgodna z umową.');
    expect(patch.reklamacjaOrderNumber).toBeUndefined();
    expect(patch.reklamacjaDecidedById).toBe('u-rek-decider');
    expect((patch.reklamacjaDecidedAt as Date).getTime()).toBe(
      (patch.statusChangedAt as Date).getTime(),
    );
    expect(patch.decidedById).toBeUndefined();
    expect(km.calls).toHaveLength(0);
  });

  it('R6. defensive fallback — statusBeforeReklamacja NULL infers from amountApproved', async () => {
    // Hand-patched / pre-rework row: no snapshot, but a payout exists ⇒ the
    // wniosek had been accepted.
    const seeded = seedPendingReklamacja('ZAAKCEPTOWANO', {
      statusBeforeReklamacja: null,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const accepted = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
      reklamacjaOrderNumber: 'ZL-REK-6',
    });
    expect(accepted.status).toBe('ZAAKCEPTOWANO');

    // No payout ⇒ the wniosek had been rejected.
    const seededNoPayout = seedPendingReklamacja('ODRZUCONO', {
      nrZgl: 'GWA/002/04/26',
      id: 'claim-id-2',
      statusBeforeReklamacja: null,
      amountApproved: null,
    });
    const repoFake2 = makeClaimsRepo([seededNoPayout]);
    const svc2 = makeService(
      repoFake2,
      makeKmCalcService().svc,
      makeAuditWriter().writer,
      makePrismaService(),
    );
    const rejected = await svc2.update(
      makeAuth('pracownik'),
      seededNoPayout.nrZgl,
      { targetStatus: 'REKLAMACJA_ODRZUCONO', comment: 'Bez podstaw.' },
    );
    expect(rejected.status).toBe('ODRZUCONO');
    expect(rejected.reklamacjaResolution).toBe('ODRZUCONA');
  });

  it('R7. a reklamacja decision sends the reklamacja mail, NOT the generic decision mails', async () => {
    const seeded = seedPendingReklamacja('ODRZUCONO');
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const mail = makeMailServiceSpy();
    const svc = makeServiceWithMail(
      repoFake,
      km.svc,
      audit.writer,
      // Needs a carrier address for the outgoing reklamacja mail.
      makeNotifyingPrismaService(),
      mail.service,
    );

    await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
      reklamacjaOrderNumber: 'ZL-REK-7',
    });
    // The notification is a fire-and-forget continuation — let it settle.
    await flushMicrotasks();

    expect(mail.reklamacjaDecision).toHaveBeenCalledTimes(1);
    const [to, props] = mail.reklamacjaDecision.mock.calls[0] as [
      string,
      { resolution: string; orderNumber?: string; kwota: string },
    ];
    expect(to).toBe('carrier@example.com');
    expect(props.resolution).toBe('UZNANA');
    expect(props.orderNumber).toBe('ZL-REK-7');
    expect(props.kwota).toBe('250.00');
    // The generic wniosek-decision mails would re-announce the ORIGINAL verdict.
    expect(mail.carrierDecision).not.toHaveBeenCalled();
    expect(mail.internalDecision).not.toHaveBeenCalled();
  });

  it('T6. no linked outing (delegationId null) → decision passes (gate no-op)', async () => {
    // Default fixture already has delegationId null; assert the gate is inert.
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-1',
      orderDate: '2026-04-30',
      amountApproved: 1_400,
    });

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });
});

// ─── submit + reklamacja semantics (decimal split) ───────────
//
// The submit pipeline writes BOTH columns equal at create time, and
// `submitReklamacja` re-snapshots the orig fields with a `?? current`
// fallback for parity with the other `orig*` fields. These tests pin
// that behaviour so a future refactor of either pipeline doesn't
// silently break the History tab.

describe('ClaimsService — hours-adjusted Decimal split (submit + reklamacja)', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('11. submit writes origHoursAdjusted === hoursAdjustedValue === 0 (verifier-only field, never accepted from carrier)', async () => {
    // Drive submit() through the full pipeline so we can assert what
    // `claims.createWithin` received. We fake every collaborator with the
    // minimum surface this code path touches.

    interface CreateCall {
      data: import('./claims.repository').CreateClaimData;
    }
    const creates: CreateCall[] = [];
    const repo = {
      findLastNonRejectedForVehicle: jest.fn(async () => null),
      createWithin: jest.fn(
        async (
          _tx: unknown,
          data: import('./claims.repository').CreateClaimData,
        ): Promise<ClaimRow> => {
          creates.push({ data });
          // Round-trip the CreateClaimData into a ClaimRow so the caller's
          // post-create `.toDto(row)` doesn't blow up. Only the fields the
          // submit pipeline reads back are populated.
          return makeClaim({
            nrZgl: data.nrZgl,
            carrierId: data.carrierId,
            vehicleId: data.vehicleId,
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
            comment: data.comment,
            orderNumber: data.orderNumber,
            orderDate: data.orderDate,
            origHoursAdjusted: data.origHoursAdjusted,
            hoursAdjustedValue: data.hoursAdjustedValue,
            origDateStart: data.origDateStart,
            origDateEnd: data.origDateEnd,
            origMileage: data.origMileage,
          });
        },
      ),
    } as unknown as ClaimsRepository;

    const carriersRepo = {
      list: jest.fn(async () => [
        {
          id: 'c-1',
          userId: 'u-carrier-1',
        },
      ]),
    } as unknown as CarriersRepository;
    const vehiclesRepo = {
      findById: jest.fn(async () => ({
        id: 'v-1',
        carrierId: 'c-1',
        plateNumber: 'WX12345',
        // Guarantee gate fallback — the vehicle must be under porozumienie for
        // the submit to clear `_resolveDelegationContext`.
        agreement: true,
      })),
    } as unknown as VehiclesRepository;
    const driversRepo = {} as DriversRepository;
    const trailersRepo = {} as TrailersRepository;
    const km = {
      calc: jest.fn(async () => ({
        totalDays: 20,
        rawTotalDays: 20,
        kmGuaranteed: 10_800,
        ratePerKmEffective: 0.5,
        breakdown: [],
        firstDay: null,
        lastDay: null,
      })),
    } as unknown as KmCalcService;
    const nrZgl = {
      nextWithin: jest.fn(async () => 'GWA/100/04/26'),
    } as unknown as NrZglService;
    const prismaClient = {
      appConfig: { findMany: jest.fn(async () => []) },
      user: { findFirst: jest.fn(async () => null) },
      carrier: { findFirst: jest.fn(async () => null) },
      vehicle: { findFirst: jest.fn(async () => null) },
      delegation: { findFirst: jest.fn(async () => null) },
      vehiclePlannerAssignment: { findMany: jest.fn(async () => []) },
    };
    const prisma = {
      client: prismaClient,
      get tx() {
        return prismaClient;
      },
      $transaction: <T>(cb: (tx: unknown) => Promise<T>): Promise<T> =>
        cb(prismaClient),
    } as unknown as PrismaService;
    const audit = {
      log: jest.fn(async () => undefined),
    } as unknown as AuditWriter;
    // Phase 7 REWORK (2026-06-20 #4) — submit derives the period from the chosen
    // outing. A past `zjechal` delegation reproduces the [2026-05-01,2026-05-13]
    // period this test relied on.
    const delegationsRepo = {
      findById: jest.fn(async () => ({
        id: 'deleg-1',
        carrierId: 'c-1',
        vehicleId: 'v-1',
        // Phase 7 §0″ finish — the plate snapshot derives from the outing's
        // vehicle relation (falling back to the vehicles repo when absent).
        vehicle: {
          id: 'v-1',
          plateNumber: 'WX12345',
          // Guarantee gate — eager relation carries `agreement`; `true` so the
          // submit clears `_resolveDelegationContext`.
          agreement: true,
          plannerId: null,
          dispatchTeamId: null,
          dispatchTeam: null,
          planner: null,
        },
        trailerId: 'trl-1',
        trailer: { id: 'trl-1', plateNumber: 'TR9999' },
        driverId: 'drv-1',
        driver: { id: 'drv-1', firstName: 'Jan', lastName: 'Kowalski' },
        driverNameSnapshot: 'Jan Kowalski',
        driverPhoneSnapshot: '+48000000000',
        status: 'zjechal',
        departureAt: new Date('2026-05-01T06:30:00.000Z'),
        plannedReturnAt: new Date('2026-05-12T00:00:00.000Z'),
        actualReturnAt: new Date('2026-05-13T00:00:00.000Z'),
        claimId: null,
      })),
    } as unknown as import('../delegations/delegations.repository').DelegationsRepository;
    // Phase 7 §0″ finish — mileage is ALWAYS the daily-km sum (no body
    // override). Inject a repo returning a non-zero sum so the submit clears
    // the tier-1 `mileage > 0` gate.
    const dailyKmRepo = {
      sumDroveKm: jest.fn(async () => 8_000),
    } as unknown as import('../vehicles/vehicle-daily-km.repository').VehicleDailyKmRepository;

    const svc = new ClaimsService(
      repo,
      carriersRepo,
      vehiclesRepo,
      driversRepo,
      trailersRepo,
      km,
      nrZgl,
      prisma,
      audit,
      undefined,
      undefined,
      dailyKmRepo,
      delegationsRepo,
    );

    // The fixed clock (NOW = 2026-05-15) puts the claim period safely in the
    // past — well within the 7-day "max days after unloading" window from
    // 2026-05-14, so the date-range gates pass.
    // NB: the requested amount / `hoursAdjusted` are NOT carrier-submit fields
    // anymore — the amount is derived server-side from km-calc
    // paymentEur, `hoursAdjusted` is verifier-only (PATCH path).
    const out = await svc.submit(makeAuth('przewoznik', 'u-carrier-1'), {
      delegationId: 'deleg-1',
      dateStart: '2026-05-01',
      dateEnd: '2026-05-10',
      timeFrom: '06:30',
      timeTo: '16:45',
      mileage: 8_000,
    });

    expect(creates).toHaveLength(1);
    // Both Decimal(5,2) columns seeded to 0 at submit — carrier cannot send
    // `hoursAdjusted`. Only the verifier PATCH mutates `hoursAdjustedValue`.
    expect(creates[0]!.data.origHoursAdjusted).toBe(0);
    expect(creates[0]!.data.hoursAdjustedValue).toBe(0);
    // DTO surfaces both as numbers (Decimal → number coercion done by repo).
    expect(out.origHoursAdjusted).toBe(0);
    expect(out.hoursAdjustedValue).toBe(0);
  });

  it('12. submitReklamacja re-snapshots origHoursAdjusted with `?? current` fallback', async () => {
    // Parity with the other `orig*` fields. Two sub-scenarios:
    //
    //  (a) Claim already has `origHoursAdjusted` from the original submit
    //      — `??` short-circuits, snapshot preserved.
    //  (b) Claim somehow has NULL `origHoursAdjusted` (pre-migration row,
    //      data fix-up, etc.) — fallback to current `hoursAdjustedValue`.

    interface UpdateCall {
      id: string;
      data: import('./claims.repository').UpdateClaimData;
    }
    const updates: UpdateCall[] = [];

    // REWORK 2026-07-31 — `submitReklamacja` now persists through
    // `updateWithin(prisma.tx, …)` so the row write joins the ambient
    // `@Audit('submitReklamacja')` transaction (it used to use the root client,
    // which left the audit row and the mutation able to diverge).
    function makeRepo(seed: ClaimRow): ClaimsRepository {
      return {
        findByNrZgl: jest.fn(async (nrZgl: string) =>
          nrZgl === seed.nrZgl ? seed : null,
        ),
        updateWithin: jest.fn(
          async (
            _tx: unknown,
            id: string,
            data: import('./claims.repository').UpdateClaimData,
          ): Promise<ClaimRow> => {
            updates.push({ id, data });
            return { ...seed, ...data } as ClaimRow;
          },
        ),
      } as unknown as ClaimsRepository;
    }
    const carriersRepo = {
      list: jest.fn(async () => [
        { id: 'c-1', userId: 'u-carrier-1' },
      ]),
    } as unknown as CarriersRepository;
    const driversRepo = {} as DriversRepository;
    const trailersRepo = {} as TrailersRepository;
    const vehiclesRepo = {} as VehiclesRepository;
    const km = {} as KmCalcService;
    const nrZgl = {} as NrZglService;
    const prismaReklamacjaClient = {
      appConfig: { findMany: jest.fn(async () => []) },
      user: { findFirst: jest.fn(async () => null) },
      carrier: { findFirst: jest.fn(async () => null) },
      vehicle: { findFirst: jest.fn(async () => null) },
      delegation: { findFirst: jest.fn(async () => null) },
      vehiclePlannerAssignment: { findMany: jest.fn(async () => []) },
    };
    const prisma = {
      client: prismaReklamacjaClient,
      get tx() {
        return prismaReklamacjaClient;
      },
    } as unknown as PrismaService;
    const audit = {
      log: jest.fn(async () => undefined),
    } as unknown as AuditWriter;

    // ── (a) snapshot already present — `??` short-circuits.
    // ODRZUCONO, not ZAAKCEPTOWANO: the amount cap is
    // `origPaymentEur − paid`, with `paid = amountApproved` only when accepted.
    // A rejected wniosek paid nothing, so the cap is the full 1_400 and the
    // 50 EUR below clears it for reasons this test does not care about. (The cap
    // matrix itself lives in `claims.service.reklamacja.spec.ts`.)
    const claimA = makeClaim({
      status: 'ODRZUCONO',
      statusChangedAt: NOW, // 0h passed, well inside the 48h window
      reklamacjaSubmitted: false,
      paymentEur: 1_400,
      origHoursAdjusted: 5.5, // carrier's immutable snapshot
      hoursAdjustedValue: 8, // verifier later corrected to 8
    });
    updates.length = 0;
    const svcA = new ClaimsService(
      makeRepo(claimA),
      carriersRepo,
      vehiclesRepo,
      driversRepo,
      trailersRepo,
      km,
      nrZgl,
      prisma,
      audit,
    );
    await svcA.submitReklamacja(
      makeAuth('przewoznik', 'u-carrier-1'),
      claimA.nrZgl,
      { tresc: 'Proszę o ponowne sprawdzenie.', kwotaReklamacji: 50 },
    );
    expect(updates).toHaveLength(1);
    // Snapshot pinned at original carrier value, NOT overwritten by 8.
    expect(updates[0]!.data.origHoursAdjusted).toBe(5.5);

    // ── (b) snapshot missing — fall through to `hoursAdjustedValue`.
    const claimB = makeClaim({
      status: 'ODRZUCONO', // same cap reasoning as claimA above
      statusChangedAt: NOW,
      reklamacjaSubmitted: false,
      paymentEur: 1_400,
      origHoursAdjusted: null, // legacy / fix-up state
      hoursAdjustedValue: 3,
    });
    updates.length = 0;
    const svcB = new ClaimsService(
      makeRepo(claimB),
      carriersRepo,
      vehiclesRepo,
      driversRepo,
      trailersRepo,
      km,
      nrZgl,
      prisma,
      audit,
    );
    await svcB.submitReklamacja(
      makeAuth('przewoznik', 'u-carrier-1'),
      claimB.nrZgl,
      { tresc: 'Drugi wniosek.', kwotaReklamacji: 50 },
    );
    expect(updates).toHaveLength(1);
    // No prior snapshot → fall back to the current applied value (3).
    expect(updates[0]!.data.origHoursAdjusted).toBe(3);
  });
});

// ── ACCEPT of a mixed period — board gates (docs/20 §0⁵) ─────────────
//
// A period with a switched-off month is paid on the weryfikator's daily-km
// board AS IT STANDS AT THE DECISION. The accept therefore always re-prices
// (forced recalc) and is refused while a counted day is missing
// (CLAIM_BOARD_INCOMPLETE) or the live amount is not the one the verification
// saved and — over threshold — Maksim cleared (CLAIM_BOARD_CHANGED). Rejection
// and reklamacja paths are never gated.

describe('ClaimsService.update — accept of a mixed period (board gates)', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // 21.08–18.09.2025: August off (7 days), September 14 × 540 = 7560 km.
  // drivenDays 21 ⇒ Maksim threshold 500 €.
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

  /** Verified mixed-period wniosek whose saved dopłata is `paymentEur`. */
  function mixedClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
    return makeClaim({
      dateStart: new Date('2025-08-21T00:00:00.000Z'),
      dateEnd: new Date('2025-09-18T00:00:00.000Z'),
      drivenDays: 21,
      mileage: 6_000,
      kmGuaranteed: 7_560,
      kmDifference: 5_560,
      paymentEur: 2_780,
      hoursAdjustedValue: 2,
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
        mileageEffective: 2_000,
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

  function accept(amountApproved = 2_780): UpdateClaimDto {
    return {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-1',
      orderDate: '2025-09-30',
      amountApproved,
    };
  }
  const ACCEPT = accept();

  async function catchUpdate(
    svc: ClaimsService,
    nrZgl: string,
    dto: UpdateClaimDto,
  ): Promise<unknown> {
    try {
      await withAuditContext(() => svc.update(makeAuth('pracownik'), nrZgl, dto));
    } catch (e) {
      return e;
    }
    return undefined;
  }

  it('B1. gaps in an active month ⇒ 422 CLAIM_BOARD_INCOMPLETE with the dates, no writes', async () => {
    const seeded = mixedClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const svc = makeService(
      repoFake,
      makeKmCalcService(MIXED_CALC).svc,
      makeAuditWriter().writer,
      makePrismaService(),
      makeBoardRepo(septemberBoard(2_000, ['2025-09-07', '2025-09-18'])).repo,
    );

    const caught = await catchUpdate(svc, seeded.nrZgl, ACCEPT);

    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
      message?: string;
      extensions?: { code?: string; missingDates?: string[] };
    };
    expect(body.code).toBe('CLAIM_BOARD_INCOMPLETE');
    expect(body.extensions).toEqual({
      code: 'CLAIM_BOARD_INCOMPLETE',
      missingDates: ['2025-09-07', '2025-09-18'],
    });
    expect(body.message).toBe(
      'Nie można zaakceptować wniosku — brak przebiegu na tablicy km za 2 dni ' +
        'w miesiącach z gwarancją: 07.09.2025, 18.09.2025. ' +
        'Poczekaj, aż weryfikator uzupełni dane.',
    );
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('B1b. a single missing day reads «1 dzień»', async () => {
    const seeded = mixedClaim();
    const svc = makeService(
      makeClaimsRepo([seeded]),
      makeKmCalcService(MIXED_CALC).svc,
      makeAuditWriter().writer,
      makePrismaService(),
      makeBoardRepo(septemberBoard(2_000, ['2025-09-18'])).repo,
    );

    const caught = await catchUpdate(svc, seeded.nrZgl, ACCEPT);

    const body = (caught as UnprocessableEntityException).getResponse() as {
      message?: string;
    };
    expect(body.message).toContain('za 1 dzień w miesiącach z gwarancją: 18.09.2025.');
  });

  it('B2. ODRZUCONO with gaps is NOT gated (and does not even re-price)', async () => {
    const seeded = mixedClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService(MIXED_CALC);
    const board = makeBoardRepo(septemberBoard(2_000, ['2025-09-18']));
    const svc = makeService(
      repoFake,
      km.svc,
      makeAuditWriter().writer,
      makePrismaService(),
      board.repo,
    );

    await withAuditContext(() =>
      svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'ODRZUCONO',
        comment: 'Brak podstaw.',
      }),
    );

    expect(repoFake.updateWithinCalls[0]!.data.status).toBe('ODRZUCONO');
    expect(km.calls).toHaveLength(0);
    expect(board.boardSpy).not.toHaveBeenCalled();
  });

  it('B3. the board moved since verification (live 1_030 € ≠ saved 2_780 €) ⇒ 422 CLAIM_BOARD_CHANGED', async () => {
    const seeded = mixedClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const svc = makeService(
      repoFake,
      makeKmCalcService(MIXED_CALC).svc,
      makeAuditWriter().writer,
      makePrismaService(),
      makeBoardRepo(septemberBoard(5_500)).repo,
    );

    const caught = await catchUpdate(svc, seeded.nrZgl, ACCEPT);

    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
      message?: string;
      extensions?: { code?: string };
    };
    expect(body.code).toBe('CLAIM_BOARD_CHANGED');
    expect(body.extensions?.code).toBe('CLAIM_BOARD_CHANGED');
    expect(body.message).toBe(
      'Kwota dopłaty różni się od zapisanej przy weryfikacji — zmieniła się ' +
        'tablica km albo dane wniosku. Zapisz weryfikację ponownie, a następnie ' +
        'podejmij decyzję.',
    );
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('B4. same amount but over threshold with the gate never armed (verified with gaps) ⇒ 422 CLAIM_BOARD_CHANGED', async () => {
    const seeded = mixedClaim({ maksimGateRequired: false });
    const repoFake = makeClaimsRepo([seeded]);
    const svc = makeService(
      repoFake,
      makeKmCalcService(MIXED_CALC).svc,
      makeAuditWriter().writer,
      makePrismaService(),
      makeBoardRepo(septemberBoard(2_000)).repo,
    );

    const caught = await catchUpdate(svc, seeded.nrZgl, ACCEPT);

    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
    };
    expect(body.code).toBe('CLAIM_BOARD_CHANGED');
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('B5. complete board, unchanged amount, gate cleared at that amount ⇒ accepted on the live board', async () => {
    const seeded = mixedClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE' as ClaimStatus,
      maksimGateRequired: true,
      maksimGateNotifiedAt: new Date('2026-05-14T10:00:00.000Z'),
      maksimGateNotifiedAmount: 2_780,
      maksimGateClearedAt: new Date('2026-05-14T12:00:00.000Z'),
      maksimGateClearedById: 'u-clearer',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService(MIXED_CALC);
    const board = makeBoardRepo(septemberBoard(2_000));
    const svc = makeService(
      repoFake,
      km.svc,
      makeAuditWriter().writer,
      makePrismaService(),
      board.repo,
    );

    await withAuditContext(() =>
      svc.update(makeAuth('pracownik'), seeded.nrZgl, ACCEPT),
    );

    // Forced re-pricing with the stored inputs (applied korekta included).
    expect(km.calls).toHaveLength(1);
    expect((km.calls[0]!.input as { hoursAdjusted: number }).hoursAdjusted).toBe(2);
    expect(board.boardSpy).toHaveBeenCalledWith(
      'v-1',
      new Date('2025-08-21T00:00:00.000Z'),
      new Date('2025-09-19T00:00:00.000Z'),
    );
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.status).toBe('ZAAKCEPTOWANO');
    expect(patch.paymentEur).toBe(2_780);
    expect(patch.breakdown?.mileageSource).toBe('board');
    expect(patch.breakdown?.mileageEffective).toBe(2_000);
  });

  it('B6. under threshold, complete, unchanged ⇒ accepted without any Maksim gate', async () => {
    const seeded = mixedClaim({ paymentEur: 80, kmDifference: 160 });
    const repoFake = makeClaimsRepo([seeded]);
    const svc = makeService(
      repoFake,
      makeKmCalcService(MIXED_CALC).svc,
      makeAuditWriter().writer,
      makePrismaService(),
      makeBoardRepo(septemberBoard(7_400)).repo,
    );

    await withAuditContext(() =>
      svc.update(makeAuth('pracownik'), seeded.nrZgl, accept(80)),
    );

    expect(repoFake.updateWithinCalls[0]!.data.status).toBe('ZAAKCEPTOWANO');
  });

  it('B7. a reklamacja decision on a mixed period is never gated, never re-priced', async () => {
    const seeded = mixedClaim({
      status: 'REKLAMACJA' as ClaimStatus,
      statusBeforeReklamacja: 'ZAAKCEPTOWANO',
      reklamacjaSubmitted: true,
      reklamacjaAmount: 100,
      amountApproved: 2_780,
      orderNumber: 'ZL-ORIG',
      orderDate: new Date('2025-09-30T00:00:00.000Z'),
    });
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService(MIXED_CALC);
    const board = makeBoardRepo(septemberBoard(2_000, ['2025-09-18']));
    const svc = makeService(
      repoFake,
      km.svc,
      makeAuditWriter().writer,
      makePrismaService(),
      board.repo,
    );

    await withAuditContext(() =>
      svc.update(makeAuth('pracownik'), seeded.nrZgl, {
        targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
        reklamacjaOrderNumber: 'ZL-REK-1',
      }),
    );

    expect(repoFake.updateWithinCalls[0]!.data.reklamacjaResolution).toBe('UZNANA');
    expect(km.calls).toHaveLength(0);
    expect(board.boardSpy).not.toHaveBeenCalled();
  });

  it('B8. an all-active accept keeps the old flow: no forced re-pricing, no board read', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const board = makeBoardRepo([]);
    const svc = makeService(
      repoFake,
      km.svc,
      makeAuditWriter().writer,
      makePrismaService(),
      board.repo,
    );

    await withAuditContext(() =>
      svc.update(makeAuth('pracownik'), seeded.nrZgl, accept(1_400)),
    );

    expect(km.calls).toHaveLength(0);
    expect(board.boardSpy).not.toHaveBeenCalled();
    expect(repoFake.updateWithinCalls[0]!.data.status).toBe('ZAAKCEPTOWANO');
  });
});

// ─── UWAGI #4 + #2 (2026-10-22) ──────────────────────────────
//
// #4 — the verifier's decision text lands in `decisionComment`. `comment` is the
// carrier's submit note: no staff PATCH writes it, and the decision mails never
// pass it off as MAGTRANS's text (the internal mail shows it as its own block).
// #2 — the internal decision mail deeplinks `/employee/claims?nrZgl=…`, the only
// employee claim page (`/employee/claims/{nrZgl}` does not exist).

describe('ClaimsService.update — decision text vs carrier note (UWAGI #4) + deeplink (UWAGI #2)', () => {
  const CARRIER_NOTE = 'Kierowca czekał 3 dni na załadunek.';
  const REASON = 'Brak podstaw do dopłaty.';
  const ENCODED_NR = 'GWA%2F001%2F04%2F26';

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  /** Notifying prisma whose staff (admin + pracownik) query yields one pracownik. */
  function makePrismaWithStaff(): PrismaService {
    const prisma = makeNotifyingPrismaService();
    (prisma.client.user.findMany as unknown as jest.Mock).mockImplementation(
      async (args: { where?: { role?: unknown } }) =>
        args.where?.role ? [{ email: 'pracownik@magtrans.eu' }] : [],
    );
    return prisma;
  }

  /** The decision mail is a fire-and-forget continuation with several awaits. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 200; i += 1) await Promise.resolve();
  }

  async function decide(
    dto: UpdateClaimDto,
    seed: Partial<ClaimRow> = {},
  ): Promise<{
    out: Awaited<ReturnType<ClaimsService['update']>>;
    patch: UpdateClaimData;
    mail: ReturnType<typeof makeMailServiceSpy>;
  }> {
    const seeded = makeClaim({ comment: CARRIER_NOTE, ...seed });
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailServiceSpy();
    const svc = makeServiceWithMail(
      repoFake,
      makeKmCalcService().svc,
      makeAuditWriter().writer,
      makePrismaWithStaff(),
      mail.service,
    );
    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);
    await settle();
    return { out, patch: repoFake.updateWithinCalls[0]!.data, mail };
  }

  const ACCEPT_BASE = {
    targetStatus: 'ZAAKCEPTOWANO',
    orderNumber: 'ZL-1',
    orderDate: '2026-04-30',
    amountApproved: 1_400,
  } as const;

  /** `[to, props]` of the first call of a mail spy. */
  function firstCall(spy: jest.Mock): [string, Record<string, unknown>] {
    return spy.mock.calls[0] as unknown as [string, Record<string, unknown>];
  }

  it('D1. ODRZUCONO writes the reason to decisionComment and leaves the carrier comment untouched', async () => {
    const { out, patch } = await decide({ targetStatus: 'ODRZUCONO', comment: REASON });

    expect(patch.decisionComment).toBe(REASON);
    expect(patch).not.toHaveProperty('comment');
    expect(out.decisionComment).toBe(REASON);
    expect(out.comment).toBe(CARRIER_NOTE);
  });

  it('D2. ZAAKCEPTOWANO with a comment writes decisionComment and leaves the carrier comment untouched', async () => {
    const { out, patch } = await decide({
      ...ACCEPT_BASE,
      comment: 'Dopłata zgodna z umową.',
    });

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(patch.decisionComment).toBe('Dopłata zgodna z umową.');
    expect(patch).not.toHaveProperty('comment');
    expect(out.decisionComment).toBe('Dopłata zgodna z umową.');
    expect(out.comment).toBe(CARRIER_NOTE);
  });

  it('D3. ZAAKCEPTOWANO without a comment writes neither column', async () => {
    const { out, patch } = await decide({ ...ACCEPT_BASE });

    expect(patch).not.toHaveProperty('decisionComment');
    expect(patch).not.toHaveProperty('comment');
    expect(out.decisionComment).toBeNull();
    expect(out.comment).toBe(CARRIER_NOTE);
  });

  it('D4. a reklamacja decision writes reklamacjaResponse only (neither comment nor decisionComment)', async () => {
    const { out, patch } = await decide(
      { targetStatus: 'REKLAMACJA_ODRZUCONO', comment: 'Bez podstaw.' },
      {
        status: 'REKLAMACJA',
        statusBeforeReklamacja: 'ODRZUCONO',
        decisionComment: 'Pierwotny powód odrzucenia.',
        decidedById: 'u-original-decider',
        reklamacjaSubmitted: true,
        reklamacjaText: 'Za mało wypłacono.',
        reklamacjaAmount: 250,
        reklamacjaSubmittedAt: new Date('2026-05-14T08:00:00.000Z'),
      },
    );

    expect(patch.reklamacjaResponse).toBe('Bez podstaw.');
    expect(patch).not.toHaveProperty('comment');
    expect(patch).not.toHaveProperty('decisionComment');
    // The wniosek's own decision text survives the reklamacja decision.
    expect(out.decisionComment).toBe('Pierwotny powód odrzucenia.');
    expect(out.comment).toBe(CARRIER_NOTE);
  });

  it('D5. the carrier decision mail carries decisionComment and NOT the carrier note', async () => {
    const { mail } = await decide({ targetStatus: 'ODRZUCONO', comment: REASON });

    expect(mail.carrierDecision).toHaveBeenCalledTimes(1);
    const [to, props] = firstCall(mail.carrierDecision);
    expect(to).toBe('carrier@example.com');
    expect(props.decisionLabel).toBe('ODRZUCONO');
    expect(props.decisionComment).toBe(REASON);
    expect(props).not.toHaveProperty('comment');
    expect(props).not.toHaveProperty('carrierComment');
    expect(JSON.stringify(props)).not.toContain(CARRIER_NOTE);
    // The carrier link is untouched: the carrier detail page exists.
    expect(props.deeplink).toBe(`http://localhost:3000/carrier/claims/${ENCODED_NR}`);
  });

  it('D6. ZAAKCEPTOWANO without a comment: the carrier mail does NOT fall back to the carrier note', async () => {
    const { mail } = await decide({ ...ACCEPT_BASE });

    expect(mail.carrierDecision).toHaveBeenCalledTimes(1);
    const [, props] = firstCall(mail.carrierDecision);
    expect(props.decisionComment).toBeUndefined();
    expect(JSON.stringify(props)).not.toContain(CARRIER_NOTE);
  });

  it('D7. the internal decision mail carries both texts, each in its own prop', async () => {
    const { mail } = await decide({ targetStatus: 'ODRZUCONO', comment: REASON });

    expect(mail.internalDecision).toHaveBeenCalledTimes(1);
    const [to, props] = firstCall(mail.internalDecision);
    expect(to).toBe('pracownik@magtrans.eu');
    expect(props.decisionComment).toBe(REASON);
    expect(props.carrierComment).toBe(CARRIER_NOTE);
    expect(props).not.toHaveProperty('comment');
  });

  it('D8. no carrier note: the internal mail gets no carrierComment', async () => {
    const { mail } = await decide(
      { targetStatus: 'ODRZUCONO', comment: REASON },
      { comment: null },
    );

    const [, props] = firstCall(mail.internalDecision);
    expect(props.decisionComment).toBe(REASON);
    expect(props.carrierComment).toBeUndefined();
  });

  it('D9. the internal decision deeplink is /employee/claims?nrZgl=<encoded> (UWAGI #2)', async () => {
    const { mail } = await decide({ ...ACCEPT_BASE });

    const [, props] = firstCall(mail.internalDecision);
    expect(props.deeplink).toBe(
      `http://localhost:3000/employee/claims?nrZgl=${ENCODED_NR}`,
    );
    expect(props.deeplink).not.toContain('/employee/claims/');
  });
});
