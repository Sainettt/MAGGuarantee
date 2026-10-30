// REWORK 2026-07-31 — `ClaimsService.submitReklamacja()` unit tests.
//
// What this suite pins:
//
//  • the CEILING matrix — `maxAmount = (origPaymentEur ?? paymentEur) −
//    (accepted ? amountApproved : 0)`, enforced STRICTLY at cent precision (the
//    legacy `+1 €` tolerance is gone). The formula itself lives in
//    `@magguarantee/shared` (`domain/reklamacja-rules.ts`) and is unit-tested
//    there; here we prove the SERVICE wires it and maps each verdict to the
//    documented HTTP error;
//  • the machine codes on the 409 / 422 envelopes (`extensions.code` is the only
//    field the RFC-7807 filter forwards, so the web keys on it);
//  • ATOMIC persistence — `updateWithin` on the AMBIENT `@Audit` transaction plus
//    an `AuditContext.setBefore(...)` snapshot (the pre-rework code wrote through
//    the root client, so the mutation and the audit row could diverge);
//  • both submit emails (staff heads-up + carrier receipt) are enqueued.
//
// Style mirrors `claims.service.update.spec.ts`: hand-rolled fakes over
// `jest.fn`, no jest-mock-extended, no live DB.

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Prisma } from '@magguarantee/database';
import type { KmCalcBreakdown, SubmitReklamacjaDto } from '@magguarantee/shared';

import {
  AuditContext,
  type AuditContextStore,
} from '../../common/audit/audit-context';
import type { Env } from '../../config/env.schema';
import type { AuditWriter } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { KmCalcService } from '../km-calc/km-calc.service';
import type { MailService } from '../mail/mail.service';
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
import { makeAuthUser } from '../../common/testing/make-auth-user';

/** Fixed clock. Every window case expresses `statusChangedAt` relative to it. */
const NOW = new Date('2026-07-22T10:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function makeAuth(
  role: AuthUser['role'] = 'przewoznik',
  sub = 'u-carrier-1',
): AuthUser {
  return makeAuthUser(role, {
    sub,
    login: 'carrier1',
    email: 'carrier@example.com',
    name: 'Carrier One',
    mustChangePassword: false,
  });
}

function makeBreakdown(): KmCalcBreakdown {
  return {
    totalDays: 20,
    rawTotalDays: 20,
    kmGuaranteed: 10_800,
    ratePerKmEffective: 0.5,
    breakdown: [],
    firstDay: null,
    lastDay: null,
    // Settlement fields (2026-09-20): every week of this fixture has its
    // guarantee ON, so the active day count equals the total.
    daysActive: 20,
    daysTotal: 20,
  };
}

/**
 * A DECIDED claim owned by carrier `c-1`, decided 1 h ago (well inside the 48 h
 * window) and never disputed. Cases override `status` / the money columns /
 * `statusChangedAt` only.
 */
function makeClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: 'claim-id-1',
    nrZgl: 'GWA/001/07/26',
    carrierId: 'c-1',
    carrier: { id: 'c-1', login: 'carrier1', name: 'Carrier One' },
    vehicleId: 'v-1',
    vehicle: { id: 'v-1', plateNumber: 'WX12345' },
    vehiclePlateSnapshot: 'WX12345',
    dateStart: new Date('2026-06-01T00:00:00.000Z'),
    dateEnd: new Date('2026-06-20T00:00:00.000Z'),
    timeFrom: '08:00',
    timeTo: '18:00',
    drivenDays: 20,
    mileage: 8_000,
    kmPerDay: 400,
    kmGuaranteed: 10_800,
    kmDifference: 2_800,
    paymentEur: 200,
    ratePerKmEffective: 0.5,
    breakdown: makeBreakdown(),
    status: 'ODRZUCONO',
    statusChangedAt: new Date(NOW.getTime() - HOUR),
    decidedById: 'u-decider',
    decidedBy: null,
    verifiedAt: new Date('2026-06-21T09:00:00.000Z'),
    verifiedById: 'u-verifier',
    verifiedBy: null,
    comment: null,
    decisionComment: null,
    orderNumber: null,
    orderDate: null,
    amountApproved: null,
    reklamacjaSubmitted: false,
    reklamacjaText: null,
    reklamacjaResponse: null,
    reklamacjaAmount: null,
    reklamacjaResolution: null,
    reklamacjaOrderNumber: null,
    reklamacjaSubmittedAt: null,
    reklamacjaDecidedAt: null,
    reklamacjaDecidedById: null,
    statusBeforeReklamacja: null,
    origDateStart: new Date('2026-06-01T00:00:00.000Z'),
    origDateEnd: new Date('2026-06-20T00:00:00.000Z'),
    origMileage: 8_000,
    // The originally-requested dopłata — the ceiling's left operand.
    origPaymentEur: 200,
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
    createdAt: new Date('2026-06-21T08:00:00.000Z'),
    updatedAt: new Date('2026-06-21T08:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

/** An ACCEPTED claim: requested `orig`, paid `approved`. */
function makeAcceptedClaim(orig: number, approved: number): ClaimRow {
  return makeClaim({
    status: 'ZAAKCEPTOWANO',
    origPaymentEur: orig,
    paymentEur: orig,
    amountApproved: approved,
    orderNumber: 'ZL-ORIG',
    orderDate: new Date('2026-06-25T00:00:00.000Z'),
  });
}

interface RepoFake {
  repo: ClaimsRepository;
  updateWithinCalls: { tx: unknown; id: string; data: UpdateClaimData }[];
  rootUpdateCalls: number;
}

function makeRepo(seed: ClaimRow): RepoFake {
  const updateWithinCalls: { tx: unknown; id: string; data: UpdateClaimData }[] =
    [];
  const fake: RepoFake = {
    updateWithinCalls,
    rootUpdateCalls: 0,
    repo: {} as ClaimsRepository,
  };
  fake.repo = {
    findByNrZgl: jest.fn(async (nrZgl: string) =>
      nrZgl === seed.nrZgl ? seed : null,
    ),
    updateWithin: jest.fn(
      async (
        tx: unknown,
        id: string,
        data: UpdateClaimData,
      ): Promise<ClaimRow> => {
        updateWithinCalls.push({ tx, id, data });
        return { ...seed, ...data } as ClaimRow;
      },
    ),
    // Guard: the root-client write path must NOT be used anymore (it would
    // escape the ambient audit transaction).
    update: jest.fn(async (): Promise<ClaimRow> => {
      fake.rootUpdateCalls += 1;
      return seed;
    }),
  } as unknown as ClaimsRepository;
  return fake;
}

function makeCarriersRepo(): CarriersRepository {
  return {
    list: jest.fn(async () => [{ id: 'c-1', userId: 'u-carrier-1' }]),
  } as unknown as CarriersRepository;
}

/** Prisma fake serving the post-commit recipient lookups. */
function makePrismaService(): { prisma: PrismaService; client: unknown } {
  const client = {
    user: {
      findMany: jest.fn(async () => [
        { email: 'admin@magtrans.eu' },
        { email: 'pracownik@magtrans.eu' },
      ]),
      findFirst: jest.fn(async () => null),
    },
    carrier: {
      findFirst: jest.fn(async () => ({
        user: {
          email: 'carrier@example.com',
          login: 'carrier1',
          name: 'Carrier One',
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
  const prisma = {
    client,
    get tx() {
      return (
        (AuditContext.current()?.tx as unknown as typeof client | undefined) ??
        client
      );
    },
    $transaction: <T>(cb: (tx: unknown) => Promise<T>): Promise<T> => cb(client),
  } as unknown as PrismaService;
  return { prisma, client };
}

function makeMailSpy(): {
  service: MailService;
  internalSubmitted: jest.Mock;
  carrierSubmitted: jest.Mock;
} {
  const internalSubmitted = jest.fn(async () => undefined);
  const carrierSubmitted = jest.fn(async () => undefined);
  return {
    service: {
      enqueueReklamacjaInternalSubmitted: internalSubmitted,
      enqueueReklamacjaCarrierSubmitted: carrierSubmitted,
    } as unknown as MailService,
    internalSubmitted,
    carrierSubmitted,
  };
}

function makeConfig(): ConfigService<Env, true> {
  return {
    get: jest.fn((key: string) =>
      key === 'APP_URL' ? 'http://localhost:3000/' : undefined,
    ),
  } as unknown as ConfigService<Env, true>;
}

function makeService(
  repoFake: RepoFake,
  prisma: PrismaService,
  mail?: MailService,
): ClaimsService {
  const noop = {} as unknown;
  return new ClaimsService(
    repoFake.repo,
    makeCarriersRepo(),
    noop as VehiclesRepository,
    noop as DriversRepository,
    noop as TrailersRepository,
    noop as KmCalcService,
    noop as NrZglService,
    prisma,
    { log: jest.fn(async () => undefined) } as unknown as AuditWriter,
    mail,
    mail ? makeConfig() : undefined,
  );
}

/**
 * Runs the call inside an ambient `AuditContext` (what the `AuditInterceptor`
 * does for `@Audit('submitReklamacja')`), so the service's `setBefore(...)` lands
 * on a captured store and `prisma.tx` yields the transaction sentinel.
 */
async function withAuditContext<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; store: AuditContextStore }> {
  const store: AuditContextStore = {
    tx: { __sentinel: 'tx' } as unknown as Prisma.TransactionClient,
    actor: { userId: 'u-carrier-1', userRole: 'przewoznik' },
    ipAddress: null,
  };
  const result = await AuditContext.run(store, fn);
  return { result, store };
}

/** Let the fire-and-forget email continuation settle. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await Promise.resolve();
}

function dto(overrides: Partial<SubmitReklamacjaDto> = {}): SubmitReklamacjaDto {
  return {
    tresc: 'Wypłacona kwota jest niższa od wnioskowanej.',
    kwotaReklamacji: 50,
    ...overrides,
  };
}

/** Reads the machine code out of an HttpException body (both slots). */
function codesOf(err: unknown): { code?: string; extCode?: string } {
  const body = (
    err as { getResponse(): { code?: string; extensions?: { code?: string } } }
  ).getResponse();
  return { code: body.code, extCode: body.extensions?.code };
}

describe('ClaimsService.submitReklamacja — REWORK 2026-07-31', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  // ── ownership / existence ─────────────────────────────────

  it('404 when the wniosek does not exist', async () => {
    const repoFake = makeRepo(makeClaim());
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await expect(
      svc.submitReklamacja(makeAuth(), 'GWA/999/07/26', dto()),
    ).rejects.toThrow(NotFoundException);
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('403 when the wniosek belongs to another carrier', async () => {
    const seeded = makeClaim({ carrierId: 'c-OTHER' });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await expect(
      svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto()),
    ).rejects.toThrow(ForbiddenException);
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  // ── cap matrix, ACCEPTED wniosek (orig 200, paid 150 ⇒ cap 50) ──

  it('accepted orig 200 / approved 150: kwota 50 (exactly the cap) is accepted', async () => {
    const seeded = makeAcceptedClaim(200, 150);
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await withAuditContext(() =>
      svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto({ kwotaReklamacji: 50 })),
    );

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    expect(repoFake.updateWithinCalls[0]!.data.reklamacjaAmount).toBe(50);
  });

  it('accepted orig 200 / approved 150: kwota 50.01 → 422 REKLAMACJA_AMOUNT_EXCEEDS_CAP', async () => {
    const seeded = makeAcceptedClaim(200, 150);
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    let caught: unknown;
    try {
      await svc.submitReklamacja(
        makeAuth(),
        seeded.nrZgl,
        dto({ kwotaReklamacji: 50.01 }),
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect(codesOf(caught)).toEqual({
      code: 'REKLAMACJA_AMOUNT_EXCEEDS_CAP',
      extCode: 'REKLAMACJA_AMOUNT_EXCEEDS_CAP',
    });
    // The ceiling travels in the message (2 dp) for the banner…
    const body = (
      caught as UnprocessableEntityException
    ).getResponse() as {
      message: string;
      extensions: { maxAmount: number };
    };
    expect(body.message).toContain('50.00');
    // …and machine-readably for the form hint.
    expect(body.extensions.maxAmount).toBe(50);
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('accepted with the legacy +1 € tolerance amount (51 on a 50 cap) is now REFUSED', async () => {
    const seeded = makeAcceptedClaim(200, 150);
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await expect(
      svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto({ kwotaReklamacji: 51 })),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('accepted approved == orig → 422 REKLAMACJA_NO_DELTA', async () => {
    const seeded = makeAcceptedClaim(200, 200);
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    let caught: unknown;
    try {
      await svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect(codesOf(caught).extCode).toBe('REKLAMACJA_NO_DELTA');
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('accepted approved > orig → 422 REKLAMACJA_NO_DELTA (never a negative-cap pass)', async () => {
    const seeded = makeAcceptedClaim(200, 260);
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    let caught: unknown;
    try {
      await svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto());
    } catch (e) {
      caught = e;
    }
    expect(codesOf(caught).extCode).toBe('REKLAMACJA_NO_DELTA');
  });

  // ── cap matrix, REJECTED wniosek (nothing paid ⇒ cap = orig) ──

  it('rejected orig 200: kwota 200 (the whole request) is accepted', async () => {
    const seeded = makeClaim({ origPaymentEur: 200, paymentEur: 200 });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await withAuditContext(() =>
      svc.submitReklamacja(
        makeAuth(),
        seeded.nrZgl,
        dto({ kwotaReklamacji: 200 }),
      ),
    );
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('rejected orig 200: kwota 200.01 → 422 REKLAMACJA_AMOUNT_EXCEEDS_CAP', async () => {
    const seeded = makeClaim({ origPaymentEur: 200, paymentEur: 200 });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    let caught: unknown;
    try {
      await svc.submitReklamacja(
        makeAuth(),
        seeded.nrZgl,
        dto({ kwotaReklamacji: 200.01 }),
      );
    } catch (e) {
      caught = e;
    }
    expect(codesOf(caught).extCode).toBe('REKLAMACJA_AMOUNT_EXCEEDS_CAP');
  });

  it('rejected with a STALE amountApproved still caps at the full request', async () => {
    // `amountApproved` counts as paid ONLY on an acceptance.
    const seeded = makeClaim({
      origPaymentEur: 200,
      paymentEur: 200,
      amountApproved: 150,
    });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await withAuditContext(() =>
      svc.submitReklamacja(
        makeAuth(),
        seeded.nrZgl,
        dto({ kwotaReklamacji: 200 }),
      ),
    );
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('legacy row (origPaymentEur NULL) + rejected → falls back to paymentEur as the cap', async () => {
    const seeded = makeClaim({ origPaymentEur: null, paymentEur: 175.5 });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await withAuditContext(() =>
      svc.submitReklamacja(
        makeAuth(),
        seeded.nrZgl,
        dto({ kwotaReklamacji: 175.5 }),
      ),
    );
    expect(repoFake.updateWithinCalls).toHaveLength(1);

    // …and one cent above it is refused.
    const repoFake2 = makeRepo(seeded);
    const svc2 = makeService(repoFake2, makePrismaService().prisma);
    await expect(
      svc2.submitReklamacja(
        makeAuth(),
        seeded.nrZgl,
        dto({ kwotaReklamacji: 175.51 }),
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  // ── eligibility gates ─────────────────────────────────────

  it('already submitted → 409 with REKLAMACJA_ALREADY_SUBMITTED', async () => {
    const seeded = makeClaim({
      reklamacjaSubmitted: true,
      reklamacjaAmount: 100,
      reklamacjaResolution: 'ODRZUCONA',
    });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    let caught: unknown;
    try {
      await svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect(codesOf(caught)).toEqual({
      code: 'REKLAMACJA_ALREADY_SUBMITTED',
      extCode: 'REKLAMACJA_ALREADY_SUBMITTED',
    });
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('a PENDING reklamacja (status REKLAMACJA) also reports the 409, not "not decided"', async () => {
    const seeded = makeClaim({
      status: 'REKLAMACJA',
      statusBeforeReklamacja: 'ODRZUCONO',
      reklamacjaSubmitted: true,
      reklamacjaAmount: 100,
    });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    let caught: unknown;
    try {
      await svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect(codesOf(caught).extCode).toBe('REKLAMACJA_ALREADY_SUBMITTED');
  });

  it('NA_WERYFIKACJI → 422 REKLAMACJA_CLAIM_NOT_DECIDED', async () => {
    const seeded = makeClaim({ status: 'NA_WERYFIKACJI' });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    let caught: unknown;
    try {
      await svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect(codesOf(caught)).toEqual({
      code: 'REKLAMACJA_CLAIM_NOT_DECIDED',
      extCode: 'REKLAMACJA_CLAIM_NOT_DECIDED',
    });
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('OCZEKUJE_NA_AUTORYZACJE → 422 REKLAMACJA_CLAIM_NOT_DECIDED', async () => {
    const seeded = makeClaim({ status: 'OCZEKUJE_NA_AUTORYZACJE' });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await expect(
      svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto()),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('exactly 48 h after the decision is still allowed (inclusive boundary)', async () => {
    const seeded = makeClaim({
      statusChangedAt: new Date(NOW.getTime() - 48 * HOUR),
    });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await withAuditContext(() =>
      svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto()),
    );
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('48 h + 1 min → 422 REKLAMACJA_WINDOW_EXPIRED (with the deadline in extensions)', async () => {
    const decidedAt = new Date(NOW.getTime() - 48 * HOUR - MINUTE);
    const seeded = makeClaim({ statusChangedAt: decidedAt });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    let caught: unknown;
    try {
      await svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect(codesOf(caught).extCode).toBe('REKLAMACJA_WINDOW_EXPIRED');
    const body = (caught as UnprocessableEntityException).getResponse() as {
      extensions: { deadlineAt?: string };
    };
    expect(body.extensions.deadlineAt).toBe(
      new Date(decidedAt.getTime() + 48 * HOUR).toISOString(),
    );
    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('no statusChangedAt ⇒ the window rule cannot fire (legacy rows stay disputable)', async () => {
    const seeded = makeClaim({ statusChangedAt: null });
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    await withAuditContext(() =>
      svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto()),
    );
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  // ── persistence + emails ──────────────────────────────────

  it('happy path: persists via updateWithin on the AMBIENT tx, snapshots `before`, stamps one instant', async () => {
    const seeded = makeAcceptedClaim(200, 150);
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const svc = makeService(repoFake, prisma);

    const { result, store } = await withAuditContext(() =>
      svc.submitReklamacja(
        makeAuth(),
        seeded.nrZgl,
        dto({ kwotaReklamacji: 49.99, tresc: 'Brakuje 49,99 EUR.' }),
      ),
    );

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    // Atomic with the audit row: the write went through the ambient tx handle,
    // NOT the root client.
    const call = repoFake.updateWithinCalls[0]!;
    expect(call.tx).toBe(store.tx);
    expect(repoFake.rootUpdateCalls).toBe(0);

    const patch = call.data;
    expect(patch.reklamacjaSubmitted).toBe(true);
    expect(patch.reklamacjaText).toBe('Brakuje 49,99 EUR.');
    expect(patch.reklamacjaAmount).toBe(49.99);
    expect(patch.status).toBe('REKLAMACJA');
    // The pre-reklamacja status is what the decision will roll back to.
    expect(patch.statusBeforeReklamacja).toBe('ZAAKCEPTOWANO');
    // Filing stamp === status stamp (one `Date` instance).
    expect(patch.reklamacjaSubmittedAt).toBeInstanceOf(Date);
    expect((patch.reklamacjaSubmittedAt as Date).getTime()).toBe(
      (patch.statusChangedAt as Date).getTime(),
    );
    // Nothing about the OUTCOME is written at submit time.
    expect(patch.reklamacjaResolution).toBeUndefined();
    expect(patch.reklamacjaOrderNumber).toBeUndefined();
    expect(patch.reklamacjaDecidedAt).toBeUndefined();

    // Audit `before` = the pre-mutation projection (interceptor picks it up).
    const before = store.before as Record<string, unknown>;
    expect(before.status).toBe('ZAAKCEPTOWANO');
    expect(before.reklamacjaSubmitted).toBe(false);
    expect(before.reklamacjaSubmittedAt).toBeNull();

    // The DTO reflects the new state.
    expect(result.status).toBe('REKLAMACJA');
    expect(result.reklamacjaAmount).toBe(49.99);
    expect(result.reklamacjaSubmittedAt).toBe(
      (patch.statusChangedAt as Date).toISOString(),
    );
  });

  it('happy path enqueues BOTH submit emails (staff heads-up + carrier receipt)', async () => {
    const seeded = makeAcceptedClaim(200, 150);
    const repoFake = makeRepo(seeded);
    const { prisma } = makePrismaService();
    const mail = makeMailSpy();
    const svc = makeService(repoFake, prisma, mail.service);

    await withAuditContext(() =>
      svc.submitReklamacja(makeAuth(), seeded.nrZgl, dto({ kwotaReklamacji: 50 })),
    );
    await flushMicrotasks();

    // Every active admin + pracownik — NOT just the first admin (the pre-rework
    // `findFirst` bug).
    expect(mail.internalSubmitted).toHaveBeenCalledTimes(2);
    const recipients = mail.internalSubmitted.mock.calls.map((c) => c[0]);
    expect(recipients.sort()).toEqual([
      'admin@magtrans.eu',
      'pracownik@magtrans.eu',
    ]);
    const props = mail.internalSubmitted.mock.calls[0]![1] as {
      nrZgl: string;
      carrierName: string;
      vehiclePlate: string;
      kwota: string;
      wnioskowana: string;
      wyplacona: string;
      maksimum: string;
      tresc: string;
      deeplink: string;
    };
    expect(props.nrZgl).toBe(seeded.nrZgl);
    expect(props.carrierName).toBe('Carrier One');
    expect(props.vehiclePlate).toBe('WX12345');
    expect(props.kwota).toBe('50.00');
    expect(props.wnioskowana).toBe('200.00');
    expect(props.wyplacona).toBe('150.00');
    expect(props.maksimum).toBe('50.00');
    expect(props.deeplink).toBe(
      `http://localhost:3000/employee/claims?nrZgl=${encodeURIComponent(seeded.nrZgl)}`,
    );

    // Carrier receipt.
    expect(mail.carrierSubmitted).toHaveBeenCalledTimes(1);
    const [carrierTo, carrierProps] = mail.carrierSubmitted.mock.calls[0] as [
      string,
      { kwota: string; tresc: string; deeplink: string },
    ];
    expect(carrierTo).toBe('carrier@example.com');
    expect(carrierProps.kwota).toBe('50.00');
    expect(carrierProps.deeplink).toContain('/carrier/claims/');
  });
});
