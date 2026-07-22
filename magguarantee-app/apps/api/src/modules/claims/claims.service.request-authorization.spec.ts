// Phase 4.2 — `ClaimsService.requestAuthorization()` unit tests.
//
// Covers the Maksim authorization handshake:
//   - status transition NA_WERYFIKACJI → OCZEKUJE_NA_AUTORYZACJE,
//   - authorizationToken (UUID v4) mint,
//   - authorizationDescription persistence (the request carries NO amount —
//     `amountMaximum` stays untouched; it is recorded later via
//     `setAuthorizationAmount` once Maksim replies),
//   - audit `before` snapshot pushed into the ambient AuditContext,
//   - email dispatch via MailService.sendAuthorizationRequest()
//     (fire-and-log — failure inside the email send does NOT roll back the
//     row update).
//
// Style follows `claims.service.update.spec.ts` — hand-rolled fakes, no
// jest-mock-extended dependency.

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Prisma } from '@magguarantee/database';
import type {
  ClaimStatus,
  KmCalcBreakdown,
  RequestAuthorizationDto,
  SetAuthorizationAmountDto,
} from '@magguarantee/shared';

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

// ─── helpers ─────────────────────────────────────────────────

// Recipient of kwota-Maksima authorization requests. Now sourced from the
// validated `MAKSIM_EMAIL` env var (default = production director address);
// the config stub below returns this so we assert against the literal, the
// same way `APP_URL` is stubbed and checked.
const MAKSIM_EMAIL = 'maksim.siankevich@magtrans.eu';

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
    // NA_WERYFIKACJI fixtures carry a verification stamp so the
    // request-authorization gate passes by default; gate tests override to null.
    verifiedAt: new Date('2026-04-21T09:00:00.000Z'),
    verifiedById: 'u-verifier',
    verifiedBy: { id: 'u-verifier', login: 'ver', name: 'Verifier' },
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
        const next: ClaimRow = {
          ...existing,
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.statusChangedAt !== undefined
            ? { statusChangedAt: data.statusChangedAt }
            : {}),
          ...(data.decidedById !== undefined
            ? { decidedById: data.decidedById }
            : {}),
          ...(data.amountMaximum !== undefined
            ? { amountMaximum: data.amountMaximum }
            : {}),
          ...(data.authorizationRequired !== undefined
            ? { authorizationRequired: data.authorizationRequired }
            : {}),
          ...(data.authorizationDescription !== undefined
            ? { authorizationDescription: data.authorizationDescription }
            : {}),
          ...(data.authorizationToken !== undefined
            ? { authorizationToken: data.authorizationToken }
            : {}),
        };
        rows.set(next.nrZgl, next);
        return next;
      },
    ),
  } as unknown as ClaimsRepository;

  return { repo, rows, updateWithinCalls };
}

interface MailFake {
  svc: MailService;
  calls: { to: string; props: unknown }[];
  throwOnNext?: boolean;
}

function makeMailService(throwOnNext = false): MailFake {
  const calls: { to: string; props: unknown }[] = [];
  const fake: MailFake = {
    svc: {} as unknown as MailService,
    calls,
    throwOnNext,
  };
  const sendAuthorizationRequest = jest.fn(
    async (to: string, props: unknown) => {
      calls.push({ to, props });
      if (fake.throwOnNext) {
        fake.throwOnNext = false;
        throw new Error('mailhog down');
      }
    },
  );
  // Production routes through `enqueueAuthorizationRequest`; with no queue the
  // fake delegates to the send mock so existing `calls` / throw assertions hold.
  fake.svc = {
    sendAuthorizationRequest,
    enqueueAuthorizationRequest: jest.fn((to: string, props: unknown) =>
      sendAuthorizationRequest(to, props),
    ),
  } as unknown as MailService;
  return fake;
}

function makeConfigService(
  appUrl = 'http://localhost:3000',
  maksimEmail = MAKSIM_EMAIL,
): ConfigService<Env, true> {
  return {
    get: jest.fn((key: string) => {
      if (key === 'APP_URL') return appUrl;
      if (key === 'MAKSIM_EMAIL') return maksimEmail;
      return undefined;
    }),
  } as unknown as ConfigService<Env, true>;
}

function makePrismaService(
  carrierLookup?: { user: { login: string; name: string | null } } | null,
): PrismaService {
  const client = {
    appConfig: { findMany: jest.fn(async () => []) },
    user: { findFirst: jest.fn(async () => null) },
    carrier: {
      findFirst: jest.fn(async () => carrierLookup ?? null),
    },
    vehicle: { findFirst: jest.fn(async () => null) },
    claim: { update: jest.fn(), findFirst: jest.fn() },
    claimSequence: { upsert: jest.fn() },
  };
  return {
    client,
    get tx() {
      return client;
    },
  } as unknown as PrismaService;
}

function makeService(
  repoFake: ClaimsRepoFake,
  mail: MailService | undefined,
  prisma: PrismaService,
  config?: ConfigService<Env, true>,
): ClaimsService {
  const noop = {} as unknown;
  const km = {
    calc: jest.fn(async () => ({
      totalDays: 20,
      rawTotalDays: 20,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
      breakdown: [],
    })),
  } as unknown as KmCalcService;
  const audit = {
    log: jest.fn(async () => undefined),
  } as unknown as AuditWriter;
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

// ─── tests ───────────────────────────────────────────────────

describe('ClaimsService.requestAuthorization — Phase 4.2', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('1. happy path NA_WERYFIKACJI → OCZEKUJE_NA_AUTORYZACJE persists token + description, leaves amountMaximum untouched', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService();
    const prisma = makePrismaService({
      user: { login: 'pwz1', name: 'Pwz One' },
    });
    const config = makeConfigService();
    const svc = makeService(repoFake, mail.svc, prisma, config);

    const dto: RequestAuthorizationDto = {
      comment: 'Powyżej progu — wymaga zgody Maksima.',
    };

    const { result, store } = await withAuditContext(() =>
      svc.requestAuthorization(makeAuth('pracownik'), seeded.nrZgl, dto),
    );

    expect(result.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    // The request carries NO amount — `amountMaximum` stays whatever it was
    // (null on a fresh claim); it is recorded later via setAuthorizationAmount.
    expect(result.amountMaximum).toBeNull();
    expect(result.authorizationRequired).toBe(true);
    expect(result.authorizationDescription).toBe(
      'Powyżej progu — wymaga zgody Maksima.',
    );
    // token is a non-empty UUID v4 (lowercase 8-4-4-4-12 hex with version 4).
    expect(result.authorizationToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(patch.authorizationRequired).toBe(true);
    expect(patch.authorizationToken).toEqual(result.authorizationToken);
    // The request patch must NOT touch amountMaximum.
    expect(patch.amountMaximum).toBeUndefined();
    expect(patch.decidedById).toBe('u-actor');

    // audit `before` snapshot in the ambient store — interceptor commits this
    const before = store.before as { status: ClaimStatus };
    expect(before.status).toBe('NA_WERYFIKACJI');

    // Email — wait a tick so the fire-and-log void promise resolves
    await Promise.resolve();
    await Promise.resolve();
    expect(mail.calls).toHaveLength(1);
    expect(mail.calls[0]!.to).toBe(MAKSIM_EMAIL);
    const props = mail.calls[0]!.props as {
      nrZgl: string;
      kwotaMaksima?: string;
      doplata: string;
      prog: string;
      dniWTrasie?: string;
      deeplink: string;
      comment?: string;
      carrierName: string;
    };
    expect(props.nrZgl).toBe('GWA/001/04/26');
    // No amount is enqueued for the request email.
    expect(props.kwotaMaksima).toBeUndefined();
    expect(props.doplata).toBe('1400.00');
    // SOFT authorization-threshold hint: drivenDays=20 → 16–30 band → 500 EUR
    // (Code.gs:5967). Pre-formatted to two decimals like the sibling amounts.
    expect(props.prog).toBe('500.00');
    expect(props.dniWTrasie).toBe('20.00');
    expect(props.deeplink).toBe(
      'http://localhost:3000/employee/claims/GWA%2F001%2F04%2F26',
    );
    expect(props.comment).toBe('Powyżej progu — wymaga zgody Maksima.');
    expect(props.carrierName).toBe('Pwz One');
  });

  it('2. illegal transition (already OCZEKUJE_NA_AUTORYZACJE) throws 422 + no writes + no email', async () => {
    const seeded = makeClaim({ status: 'OCZEKUJE_NA_AUTORYZACJE' });
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService();
    const prisma = makePrismaService();
    const config = makeConfigService();
    const svc = makeService(repoFake, mail.svc, prisma, config);

    await expect(
      svc.requestAuthorization(makeAuth('pracownik'), seeded.nrZgl, {
        comment: 'Opis sprawy dla Maksima.',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(mail.calls).toHaveLength(0);
  });

  it('3. illegal transition (claim already ZAAKCEPTOWANO) throws 422', async () => {
    const seeded = makeClaim({ status: 'ZAAKCEPTOWANO' });
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, mail.svc, prisma, makeConfigService());

    await expect(
      svc.requestAuthorization(makeAuth('admin'), seeded.nrZgl, {
        comment: 'Opis sprawy dla Maksima.',
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(mail.calls).toHaveLength(0);
  });

  it('4. claim not found → NotFoundException + no writes, no email', async () => {
    const repoFake = makeClaimsRepo([]);
    const mail = makeMailService();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, mail.svc, prisma, makeConfigService());

    await expect(
      svc.requestAuthorization(makeAuth('pracownik'), 'GWA/999/04/26', {
        comment: 'Opis sprawy dla Maksima.',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
    expect(mail.calls).toHaveLength(0);
  });

  it('5. required `comment` persisted into authorizationDescription; carrier name=null falls back to login', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService();
    const prisma = makePrismaService({
      user: { login: 'pwz1', name: null },
    });
    const svc = makeService(repoFake, mail.svc, prisma, makeConfigService());

    const result = await svc.requestAuthorization(
      makeAuth('admin'),
      seeded.nrZgl,
      { comment: 'Uzasadnienie doplaty.' },
    );

    expect(result.authorizationDescription).toBe('Uzasadnienie doplaty.');
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.authorizationDescription).toBe('Uzasadnienie doplaty.');

    // Carrier fallback: name=null → login is used in the email; comment carried
    await Promise.resolve();
    await Promise.resolve();
    expect(mail.calls).toHaveLength(1);
    const props = mail.calls[0]!.props as {
      carrierName: string;
      comment?: string;
    };
    expect(props.carrierName).toBe('pwz1');
    expect(props.comment).toBe('Uzasadnienie doplaty.');
  });

  it('6. mail send failure does NOT roll back the row update (fire-and-log)', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService(true); // first send throws
    const prisma = makePrismaService({
      user: { login: 'pwz1', name: 'Pwz One' },
    });
    const svc = makeService(repoFake, mail.svc, prisma, makeConfigService());

    const result = await svc.requestAuthorization(
      makeAuth('pracownik'),
      seeded.nrZgl,
      { comment: 'Opis sprawy dla Maksima.' },
    );

    expect(result.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
    // Let the rejected void promise settle to confirm the service swallowed it.
    await Promise.resolve();
    await Promise.resolve();
    expect(mail.calls).toHaveLength(1);
  });

  it('8. unverified NA_WERYFIKACJI → request-authorization gated (422 CLAIM_NOT_VERIFIED, no email)', async () => {
    const seeded = makeClaim({ verifiedAt: null, verifiedById: null });
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, mail.svc, prisma, makeConfigService());

    let caught: unknown;
    try {
      await svc.requestAuthorization(makeAuth('pracownik'), seeded.nrZgl, {
        comment: 'Powyżej progu — wymaga zgody Maksima.',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    const body = (caught as UnprocessableEntityException).getResponse() as {
      code?: string;
    };
    expect(body.code).toBe('CLAIM_NOT_VERIFIED');
    // Gate fires before any write / email.
    expect(repoFake.updateWithinCalls).toHaveLength(0);
    await Promise.resolve();
    expect(mail.calls).toHaveLength(0);
  });

  it('7. missing MailService (legacy unit-test wiring) logs warning but does not throw', async () => {
    const seeded = makeClaim();
    const repoFake = makeClaimsRepo([seeded]);
    const prisma = makePrismaService();
    // Pass undefined for mail and config — service must still complete.
    const svc = makeService(repoFake, undefined, prisma, undefined);

    const result = await svc.requestAuthorization(
      makeAuth('pracownik'),
      seeded.nrZgl,
      { comment: 'Opis sprawy dla Maksima.' },
    );

    expect(result.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('9. linked outing still w_trasie → request-authorization gated (422 CLAIM_DELEGATION_IN_TRANSIT, no email)', async () => {
    const seeded = makeClaim({
      delegationId: 'deleg-1',
      delegationStatus: 'w_trasie',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, mail.svc, prisma, makeConfigService());

    let caught: unknown;
    try {
      await svc.requestAuthorization(makeAuth('pracownik'), seeded.nrZgl, {
        comment: 'Auto jeszcze w trasie.',
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
    // Gate fires before any write / email.
    expect(repoFake.updateWithinCalls).toHaveLength(0);
    await Promise.resolve();
    expect(mail.calls).toHaveLength(0);
  });

  it('10. linked outing zjechal → request-authorization passes', async () => {
    const seeded = makeClaim({
      delegationId: 'deleg-1',
      delegationStatus: 'zjechal',
    });
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, mail.svc, prisma, makeConfigService());

    const result = await svc.requestAuthorization(
      makeAuth('pracownik'),
      seeded.nrZgl,
      { comment: 'Auto zjechało.' },
    );

    expect(result.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });

  it('11. no linked outing (delegationId null) → request-authorization passes', async () => {
    const seeded = makeClaim({ delegationId: null, delegationStatus: null });
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, mail.svc, prisma, makeConfigService());

    const result = await svc.requestAuthorization(
      makeAuth('pracownik'),
      seeded.nrZgl,
      { comment: 'Brak powiązanego wyjazdu.' },
    );

    expect(result.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
    expect(repoFake.updateWithinCalls).toHaveLength(1);
  });
});

// ─── setAuthorizationAmount — records Maksim's replied amount ───
//
// The kwota-Maksima is recorded AFTER Maksim's email reply, while the claim
// sits in OCZEKUJE_NA_AUTORYZACJE. Pure amount write onto Claim.amountMaximum:
// no status change, no token, no email. Repeat calls overwrite (corrections).

describe('ClaimsService.setAuthorizationAmount — Phase 4.2 (kwota follow-up)', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('happy path: pending claim → writes amountMaximum + audit before/after, no email', async () => {
    const seeded = makeClaim({ status: 'OCZEKUJE_NA_AUTORYZACJE' });
    const repoFake = makeClaimsRepo([seeded]);
    const mail = makeMailService();
    const prisma = makePrismaService();
    const svc = makeService(repoFake, mail.svc, prisma, makeConfigService());

    const dto: SetAuthorizationAmountDto = { kwotaMaksima: 1_550.5 };

    const { result, store } = await withAuditContext(() =>
      svc.setAuthorizationAmount(makeAuth('pracownik'), seeded.nrZgl, dto),
    );

    expect(result.amountMaximum).toBe(1_550.5);
    // Status is unchanged — this is a pure amount record.
    expect(result.status).toBe('OCZEKUJE_NA_AUTORYZACJE');

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.amountMaximum).toBe(1_550.5);
    // No status / token churn on this path.
    expect(patch.status).toBeUndefined();
    expect(patch.authorizationToken).toBeUndefined();

    // audit `before` captures the pre-mutation amountMaximum (null on seed)
    const before = store.before as {
      amountMaximum: number | null;
      status: ClaimStatus;
    };
    expect(before.amountMaximum).toBeNull();
    expect(before.status).toBe('OCZEKUJE_NA_AUTORYZACJE');

    // No email is dispatched on the amount-record path.
    await Promise.resolve();
    await Promise.resolve();
    expect(mail.calls).toHaveLength(0);
  });

  it('404: unknown claim throws NotFoundException, no writes', async () => {
    const repoFake = makeClaimsRepo([]);
    const prisma = makePrismaService();
    const svc = makeService(
      repoFake,
      makeMailService().svc,
      prisma,
      makeConfigService(),
    );

    await expect(
      svc.setAuthorizationAmount(makeAuth('pracownik'), 'GWA/999/04/26', {
        kwotaMaksima: 1_200,
      }),
    ).rejects.toThrow(NotFoundException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('422: claim on NA_WERYFIKACJI (not pending) throws, no writes', async () => {
    const seeded = makeClaim({ status: 'NA_WERYFIKACJI' });
    const repoFake = makeClaimsRepo([seeded]);
    const prisma = makePrismaService();
    const svc = makeService(
      repoFake,
      makeMailService().svc,
      prisma,
      makeConfigService(),
    );

    await expect(
      svc.setAuthorizationAmount(makeAuth('pracownik'), seeded.nrZgl, {
        kwotaMaksima: 1_200,
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('422: claim already ZAAKCEPTOWANO throws, no writes', async () => {
    const seeded = makeClaim({ status: 'ZAAKCEPTOWANO', amountMaximum: 1_500 });
    const repoFake = makeClaimsRepo([seeded]);
    const prisma = makePrismaService();
    const svc = makeService(
      repoFake,
      makeMailService().svc,
      prisma,
      makeConfigService(),
    );

    await expect(
      svc.setAuthorizationAmount(makeAuth('admin'), seeded.nrZgl, {
        kwotaMaksima: 1_650,
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(repoFake.updateWithinCalls).toHaveLength(0);
  });

  it('repeat call overwrites the previously-recorded amountMaximum', async () => {
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      amountMaximum: 1_400,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const prisma = makePrismaService();
    const svc = makeService(
      repoFake,
      makeMailService().svc,
      prisma,
      makeConfigService(),
    );

    const { result } = await withAuditContext(() =>
      svc.setAuthorizationAmount(makeAuth('pracownik'), seeded.nrZgl, {
        kwotaMaksima: 1_650,
      }),
    );

    expect(result.amountMaximum).toBe(1_650);
    expect(repoFake.updateWithinCalls).toHaveLength(1);
    expect(repoFake.updateWithinCalls[0]!.data.amountMaximum).toBe(1_650);
  });
});

// ─── PATCH /claims/:nrZgl with kwotaMaksima (amountMaximum) ───
//
// Pins the separately-routed PATCH path that the orchestrator decided NOT
// to split off into its own endpoint. The verifier passes `amountMaximum`
// alongside the ZAAKCEPTOWANO decision payload; service writes it onto
// `Claim.amountMaximum` and the audit-diff covers the field change via the
// usual `_snapshotForAudit` path.

import type { UpdateClaimDto } from '@magguarantee/shared';

describe('ClaimsService.update — amountMaximum override (Phase 4.2)', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('PATCH ZAAKCEPTOWANO with amountMaximum writes Claim.amountMaximum + audit diff captures it', async () => {
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      // Pre-existing maximum from a prior request-authorization step.
      amountMaximum: 1_500,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const prisma = makePrismaService();
    const svc = makeService(repoFake, makeMailService().svc, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-77',
      orderDate: '2026-04-30',
      amountApproved: 1_500,
      amountMaximum: 1_650, // verifier overrides during acceptance
    };

    const { store } = await withAuditContext(() =>
      svc.update(makeAuth('pracownik'), seeded.nrZgl, dto),
    );

    expect(repoFake.updateWithinCalls).toHaveLength(1);
    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.amountMaximum).toBe(1_650);

    // audit `before` captures the pre-mutation amountMaximum
    const before = store.before as { amountMaximum: number | null };
    expect(before.amountMaximum).toBe(1_500);
  });

  it('PATCH WITHOUT amountMaximum leaves Claim.amountMaximum untouched', async () => {
    const seeded = makeClaim({
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      amountMaximum: 1_500,
    });
    const repoFake = makeClaimsRepo([seeded]);
    const prisma = makePrismaService();
    const svc = makeService(repoFake, makeMailService().svc, prisma);

    const dto: UpdateClaimDto = {
      targetStatus: 'ZAAKCEPTOWANO',
      orderNumber: 'ZL-77',
      orderDate: '2026-04-30',
      amountApproved: 1_500,
    };

    await svc.update(makeAuth('pracownik'), seeded.nrZgl, dto);

    const patch = repoFake.updateWithinCalls[0]!.data;
    expect(patch.amountMaximum).toBeUndefined();
  });
});
