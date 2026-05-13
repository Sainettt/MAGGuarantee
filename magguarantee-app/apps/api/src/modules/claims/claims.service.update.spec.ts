// Phase 4 — Sub-slice 4.1 — `ClaimsService.update()` unit tests.
//
// Covers the 5-helper pipeline (`_validateClaimUpdate`, `_recalcClaim`,
// `_persistClaimUpdate` via repo, `_handleReklamacjaTransition`,
// `_applyDecisionEmails`) plus the in-`$transaction` `AuditWriter.log` call.
//
// Style follows `carriers.service.spec.ts`: hand-rolled fakes over `jest.fn`,
// no jest-mock-extended dependency. The PrismaService is faked at the
// `$transaction` + `client.appConfig.findMany` + `client.user.findFirst` +
// `client.carrier.findFirst` + `client.vehicle.findFirst` surface — the
// surfaces this service code-path actually touches.

import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  ClaimStatus,
  KmCalcBreakdown,
  KmCalcResult,
  UpdateClaimDto,
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
  UpdateClaimData,
} from './claims.repository';
import type { NrZglService } from './nr-zgl.service';

// ─── fixtures ────────────────────────────────────────────────

const NOW = new Date('2026-05-15T10:00:00.000Z');

function makeAuth(role: AuthUser['role'], sub = 'u-actor'): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
  };
}

function makeBreakdown(): KmCalcBreakdown {
  return {
    totalDays: 20,
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
    hoursAdjusted: false,
    statusBeforeReklamacja: null,
    origDateStart: new Date('2026-04-01T00:00:00.000Z'),
    origDateEnd: new Date('2026-04-20T00:00:00.000Z'),
    origMileage: 8_000,
    authScreenshotUrl: null,
    attachments: [],
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
          ...(data.hoursAdjusted !== undefined
            ? { hoursAdjusted: data.hoursAdjusted }
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
  // $transaction wraps the callback with a sentinel `tx` object so we can
  // verify the audit log received the same handle.
  const tx = Symbol('tx');
  const client = {
    user: { findFirst: jest.fn(async () => null) },
    carrier: { findFirst: jest.fn(async () => null) },
    vehicle: { findFirst: jest.fn(async () => null) },
    appConfig: { findMany: jest.fn(async () => []) },
  };
  return {
    client,
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) =>
      fn(tx),
    ),
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

    const out = await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    expect(out.status).toBe('ZAAKCEPTOWANO');
    expect(out.orderNumber).toBe('ZL-12345');
    expect(out.orderDate).toBe('2026-04-30');
    expect(out.amountApproved).toBe(1_400);
    expect(repoFake.updateWithinCalls).toHaveLength(1);
    expect(repoFake.updateWithinCalls[0]!.data.decidedById).toBe('u-actor');

    // Audit row written in the same transaction handle.
    expect(audit.logs).toHaveLength(1);
    expect(audit.logs[0]!.action).toBe('updateClaim');
    expect(audit.logs[0]!.targetKey).toBe(seeded.nrZgl);
    expect(audit.logs[0]!.tx).toBeDefined();
    // before snapshot reflects the pre-update status, after — the new one.
    const before = audit.logs[0]!.before as { status: ClaimStatus };
    const after = audit.logs[0]!.after as { status: ClaimStatus };
    expect(before.status).toBe('NA_WERYFIKACJI');
    expect(after.status).toBe('ZAAKCEPTOWANO');
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
});
