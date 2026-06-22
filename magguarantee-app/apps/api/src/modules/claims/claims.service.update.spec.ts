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
  ClaimStatus,
  KmCalcBreakdown,
  KmCalcResult,
  UpdateClaimDto,
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
    // Numeric Decimal(5,2) columns post-migration. The fixture defaults to
    // 0/0 (both equal at submit) — individual tests override either field
    // to assert the new submit/PATCH semantics.
    origHoursAdjusted: 0,
    hoursAdjustedValue: 0,
    authScreenshotUrl: null,
    attachments: [],
    delegationId: null,
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
          ...(data.comment !== undefined ? { comment: data.comment } : {}),
          ...(data.orderNumber !== undefined
            ? { orderNumber: data.orderNumber }
            : {}),
          ...(data.orderDate !== undefined ? { orderDate: data.orderDate } : {}),
          ...(data.amountApproved !== undefined
            ? { amountApproved: data.amountApproved }
            : {}),
          ...(data.amountMaximum !== undefined
            ? { amountMaximum: data.amountMaximum }
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
          ...(data.margin !== undefined ? { margin: data.margin } : {}),
          ...(data.authorizationRequired !== undefined
            ? { authorizationRequired: data.authorizationRequired }
            : {}),
          ...(data.authorizationDescription !== undefined
            ? { authorizationDescription: data.authorizationDescription }
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

function makeService(
  repoFake: ClaimsRepoFake,
  km: KmCalcService,
  audit: AuditWriter,
  prisma: PrismaService,
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
    expect(out.comment).toBe('Brak podstaw — niepoprawne dane.');
    // KmCalcService MUST NOT have been touched — no correction fields.
    expect(km.calls).toHaveLength(0);

    // kmGuaranteed / paymentEur stayed at seeded values.
    const updated = repoFake.rows.get(seeded.nrZgl)!;
    expect(updated.kmGuaranteed).toBe(seeded.kmGuaranteed);
    expect(updated.paymentEur).toBe(seeded.paymentEur);
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

  it('6. NA_WERYFIKACJI → OCZEKUJE_NA_AUTORYZACJE persists margin + authorizationDescription', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const km = makeKmCalcService();
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'OCZEKUJE_NA_AUTORYZACJE',
      margin: -300,
      authorizationDescription: 'Strata 300 EUR — wymaga zgody Maksima.',
    };

    await svc.update(makeAuth('admin'), seeded.nrZgl, dto);

    const updated = repoFake.rows.get(seeded.nrZgl)!;
    expect(updated.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(updated.authorizationRequired).toBe(true);
    expect(updated.authorizationDescription).toBe(
      'Strata 300 EUR — wymaga zgody Maksima.',
    );
    expect(updated.margin).toBe(-300);
  });

  it('7. REKLAMACJA → ZAAKCEPTOWANO via REKLAMACJA_ZAAKCEPTOWANO translates synthetic literal', async () => {
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
      comment: 'Akceptacja reklamacji — kwota 450 EUR.',
      reklamacjaAmount: 450,
    };

    await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    const updated = repoFake.rows.get(seeded.nrZgl)!;
    // DB enum stays clean — synthetic literal collapses to ZAAKCEPTOWANO.
    expect(updated.status).toBe('ZAAKCEPTOWANO');
    expect(updated.reklamacjaResponse).toBe(
      'Akceptacja reklamacji — kwota 450 EUR.',
    );
    expect(updated.reklamacjaAmount).toBe(450);
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

  it('13c. REKLAMACJA_ZAAKCEPTOWANO when recalc shows kmDifference <= 0 → 422', async () => {
    const seeded = makeClaim({
      status: 'REKLAMACJA',
      statusBeforeReklamacja: 'ODRZUCONO',
      reklamacjaSubmitted: true,
      reklamacjaAmount: 500,
    });
    const repoFake = makeClaimsRepo([seeded]);
    // Recalc shows the guarantee was met (kmGuaranteed == mileage ⇒ 0).
    const km = makeKmCalcService({
      totalDays: 20,
      rawTotalDays: 20,
      kmGuaranteed: 8_000,
      ratePerKmEffective: 0.5,
    });
    const audit = makeAuditWriter();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, km.svc, audit.writer, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
      comment: 'Akceptacja reklamacji.',
      reklamacjaAmount: 450,
      mileage: 8_000, // equals guarantee → kmDifference = 0
    };

    await expect(
      svc.update(makeAuth('pracownik'), seeded.nrZgl, dto),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(repoFake.rows.get(seeded.nrZgl)!.status).toBe('REKLAMACJA');
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
            amountRequested: data.amountRequested,
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
        status: 'zjechal',
        departureAt: new Date('2026-05-01T06:30:00.000Z'),
        plannedReturnAt: new Date('2026-05-12T00:00:00.000Z'),
        actualReturnAt: new Date('2026-05-13T00:00:00.000Z'),
        claimId: null,
      })),
    } as unknown as import('../delegations/delegations.repository').DelegationsRepository;

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
      undefined,
      delegationsRepo,
    );

    // The fixed clock (NOW = 2026-05-15) puts the claim period safely in the
    // past — well within the 7-day "max days after unloading" window from
    // 2026-05-14, so the date-range gates pass.
    // NB: `amountRequested` / `hoursAdjusted` are NOT carrier-submit fields
    // anymore — `amountRequested` is derived server-side from km-calc
    // paymentEur, `hoursAdjusted` is verifier-only (PATCH path).
    const out = await svc.submit(makeAuth('przewoznik', 'u-carrier-1'), {
      vehicleId: 'v-1',
      delegationId: 'deleg-1',
      timeFrom: '08:00',
      timeTo: '18:00',
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

    function makeRepo(seed: ClaimRow): ClaimsRepository {
      return {
        findByNrZgl: jest.fn(async (nrZgl: string) =>
          nrZgl === seed.nrZgl ? seed : null,
        ),
        update: jest.fn(
          async (
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
    const claimA = makeClaim({
      status: 'ZAAKCEPTOWANO',
      statusChangedAt: NOW, // 0h passed, well inside the 48h window
      reklamacjaSubmitted: false,
      paymentEur: 1_400,
      amountRequested: 1_500,
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
      status: 'ZAAKCEPTOWANO',
      statusChangedAt: NOW,
      reklamacjaSubmitted: false,
      paymentEur: 1_400,
      amountRequested: 1_500,
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
