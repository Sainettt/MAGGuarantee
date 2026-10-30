// `POST /claims/:nrZgl/recalc-limits` — `ClaimsService.refreshLimits`.
//
// Feature «wyłączane limity gwarancji» (2026-09-20). Every OTHER recalc of an
// existing wniosek is pinned to the limits snapshot frozen in its
// `breakdown`, so a retroactively corrected `WeeklyLimit` never reaches a
// filed wniosek by itself. This endpoint is the deliberate escape hatch:
//
//   - re-runs km-calc with NO `limitsSnapshot` (live `weekly_limits`);
//   - rewrites kmGuaranteed / kmDifference / paymentEur / ratePerKmEffective /
//     breakdown / drivenDays / kmPerDay ONLY;
//   - leaves period / mileage / status / `orig*` alone and sends no email;
//   - is allowed ONLY in `NA_WERYFIKACJI` (422 `CLAIM_LIMITS_REFRESH_BLOCKED`
//     for an authorised or decided wniosek);
//   - resets the verification checkpoint + Maksim gate when the money moved,
//     so a dopłata that crossed the authorization threshold cannot reach a
//     decision unauthorised.
//
// The dry run (`GET …/recalc-limits/preview`) additionally lists the ISO
// weeks whose limits would change (`changedWeeks`, 2026-10-29) — the stored
// breakdown rows vs the fresh calc, paired by `isoWeek`.
//
// Style mirrors `claims.service.verify.spec.ts`: hand-rolled fakes, ambient
// `AuditContext` simulating the production `AuditInterceptor`.

import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import type { Prisma } from '@magguarantee/database';
import { RecalcLimitsPreviewSchema } from '@magguarantee/shared';
import type {
  BoardDay,
  ClaimStatus,
  KmCalcBreakdown,
  KmCalcResult,
  WeekBreakdown,
} from '@magguarantee/shared';

import {
  AuditContext,
  type AuditContextStore,
} from '../../common/audit/audit-context';
import type { AuditWriter } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { CarriersRepository } from '../carriers/carriers.repository';
import type { DriversRepository } from '../drivers/drivers.repository';
import type { KmCalcService, KmCalcServiceInput } from '../km-calc/km-calc.service';
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
import { makeWeekRow } from '../../common/testing/week-breakdown';

const ADMIN: AuthUser = makeAuthUser('admin', {
  sub: 'u-admin',
  login: 'admin',
  email: 'admin@magtrans.eu',
  name: 'Admin',
  mustChangePassword: false,
});

async function withAuditContext<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; store: AuditContextStore }> {
  const store: AuditContextStore = {
    tx: { __sentinel: 'tx' } as unknown as Prisma.TransactionClient,
    actor: { userId: 'u-admin', userRole: 'admin' },
    ipAddress: null,
  };
  const result = await AuditContext.run(store, fn);
  return { result, store };
}

/**
 * The four ISO weeks of the fixture period 01.04–20.04.2026 (Wed … Mon):
 * W14 and W17 are clipped by the period. Hand-rolled, 5 counted days each, so
 * the totals stay the round 20 days the claim fixture carries.
 */
function weeksAt(
  kmPerDay: number,
  overrides: Partial<Record<string, Partial<WeekBreakdown>>> = {},
): WeekBreakdown[] {
  return [
    makeWeekRow('2026-W14', { periodStart: '2026-04-01', kmPerDay, ...overrides['2026-W14'] }),
    makeWeekRow('2026-W15', { kmPerDay, ...overrides['2026-W15'] }),
    makeWeekRow('2026-W16', { kmPerDay, ...overrides['2026-W16'] }),
    makeWeekRow('2026-W17', {
      periodEnd: '2026-04-20',
      kmPerDay,
      ...overrides['2026-W17'],
    }),
  ];
}

/** The persisted breakdown — the limits SNAPSHOT: 540 km/day in every week. */
function makeBreakdown(): KmCalcBreakdown {
  return {
    totalDays: 20,
    rawTotalDays: 20,
    kmGuaranteed: 10_800,
    ratePerKmEffective: 0.5,
    breakdown: weeksAt(540),
    firstDay: null,
    lastDay: null,
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
    verifiedAt: new Date('2026-04-22T09:00:00.000Z'),
    verifiedById: 'u-prac',
    verifiedBy: { id: 'u-prac', login: 'prac', name: 'Prac' },
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

interface Built {
  svc: ClaimsService;
  updateSpy: jest.Mock;
  kmCalcSpy: jest.Mock<Promise<KmCalcResult>, [KmCalcServiceInput]>;
  /** Real `AuditWriter.log` seam — the dry run must never touch it. */
  auditLogSpy: jest.Mock;
  /** `VehicleDailyKmRepository.listBoardDays` — read only for a mixed period. */
  boardSpy: jest.Mock;
}

function build(opts: {
  claim: ClaimRow | null;
  kmResult?: Partial<KmCalcResult>;
  /** Board rows a MIXED period is settled on (docs/20 §0⁵). */
  board?: BoardDay[];
}): Built {
  const updateSpy = jest.fn(async (id: string, data: UpdateClaimData) => ({
    ...(opts.claim as ClaimRow),
    ...data,
    id,
  }));
  const claims = {
    findByNrZgl: jest.fn(async () => opts.claim),
    update: updateSpy,
  } as unknown as ClaimsRepository;

  // Default fresh calc: today's limits halved every week (540 → 270 km/day).
  const kmCalcSpy = jest.fn(
    async (_input: KmCalcServiceInput): Promise<KmCalcResult> => ({
      totalDays: 20,
      rawTotalDays: 20,
      kmGuaranteed: 5_400,
      ratePerKmEffective: 0.5,
      breakdown: weeksAt(270),
      firstDay: null,
      lastDay: null,
      ...opts.kmResult,
    }),
  );
  const kmCalc = { calc: kmCalcSpy } as unknown as KmCalcService;

  const auditLogSpy = jest.fn(async () => undefined);
  const boardSpy = jest.fn(async () => opts.board ?? []);
  const dailyKm = {
    listBoardDays: boardSpy,
  } as unknown as VehicleDailyKmRepository;
  const noop = {} as never;
  const svc = new ClaimsService(
    claims,
    noop as CarriersRepository,
    noop as VehiclesRepository,
    noop as DriversRepository,
    noop as TrailersRepository,
    kmCalc,
    noop as NrZglService,
    noop as PrismaService,
    { log: auditLogSpy } as unknown as AuditWriter,
    undefined,
    undefined,
    dailyKm,
  );
  return { svc, updateSpy, kmCalcSpy, auditLogSpy, boardSpy };
}

describe('ClaimsService.refreshLimits — happy path', () => {
  it('re-prices with LIVE limits (no snapshot passed to km-calc)', async () => {
    const { svc, kmCalcSpy } = build({ claim: makeClaim() });

    await withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/001/04/26'));

    expect(kmCalcSpy).toHaveBeenCalledTimes(1);
    const input = kmCalcSpy.mock.calls[0]![0];
    // THE contract of this endpoint: the frozen snapshot is NOT applied.
    expect(input.limitsSnapshot).toBeUndefined();
    // Period / times / korekta come from the row, unchanged.
    expect(input.dateStart).toBe('2026-04-01');
    expect(input.dateEnd).toBe('2026-04-20');
    expect(input.timeFrom).toBe('08:00');
    expect(input.hoursAdjusted).toBe(0);
  });

  it('writes only the money + breakdown fields; period, mileage, status untouched', async () => {
    const { svc, updateSpy } = build({ claim: makeClaim() });

    await withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/001/04/26'));

    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch.kmGuaranteed).toBe(5_400);
    // 5_400 − 8_000 ⇒ negative difference ⇒ no dopłata.
    expect(patch.kmDifference).toBe(-2_600);
    expect(patch.paymentEur).toBe(0);
    expect(patch.ratePerKmEffective).toBe(0.5);
    expect(patch.drivenDays).toBe(20);
    expect(patch.kmPerDay).toBe(400); // mileage 8_000 / 20 days — unchanged
    expect(patch.breakdown?.kmGuaranteed).toBe(5_400);
    // NOT touched:
    expect(patch.dateStart).toBeUndefined();
    expect(patch.dateEnd).toBeUndefined();
    expect(patch.mileage).toBeUndefined();
    expect(patch.status).toBeUndefined();
  });

  it('a limit switched off by the refresh settles the period on the board', async () => {
    // 01.04–08.05.2026 (W14 … W19): W14–W17 keep their guarantee, W18 and W19
    // are switched off.
    const { svc, updateSpy, boardSpy } = build({
      claim: makeClaim({ dateEnd: new Date('2026-05-08T00:00:00.000Z') }),
      board: [
        { date: '2026-04-01', state: 'drove', km: 1_000 },
        { date: '2026-04-02', state: 'drove', km: 1_000 },
        // W19 is off — whatever is on the board there is never charged.
        { date: '2026-05-04', state: 'drove', km: 6_000 },
      ],
      kmResult: {
        kmGuaranteed: 2_700,
        breakdown: [
          makeWeekRow('2026-W14', { periodStart: '2026-04-01', workingDays: 3, kmPerDay: 270 }),
          makeWeekRow('2026-W15', { workingDays: 5, kmPerDay: 270 }),
          makeWeekRow('2026-W16', { workingDays: 1, kmPerDay: 270 }),
          makeWeekRow('2026-W17', { workingDays: 1, kmPerDay: 270 }),
          // Weeks switched off by the admin → their days must not charge.
          makeWeekRow('2026-W18', { workingDays: 5, kmPerDay: 0 }),
          makeWeekRow('2026-W19', { periodEnd: '2026-05-08', workingDays: 5, kmPerDay: 0 }),
        ],
      },
    });

    await withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/001/04/26'));

    expect(boardSpy).toHaveBeenCalledWith(
      'v-1',
      new Date('2026-04-01T00:00:00.000Z'),
      new Date('2026-05-09T00:00:00.000Z'),
    );
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch.breakdown?.daysActive).toBe(10);
    expect(patch.breakdown?.daysTotal).toBe(20);
    expect(patch.breakdown?.mileageSource).toBe('board');
    // W14–W17 on the board = 2_000 (their unrecorded days count 0 km).
    expect(patch.breakdown?.mileageEffective).toBe(2_000);
    // 2_700 − 2_000 = 700 ⇒ 350 € — the declared 8_000 km no longer decide.
    expect(patch.kmDifference).toBe(700);
    expect(patch.paymentEur).toBe(350);
    // The declared mileage itself is never touched by a refresh.
    expect(patch.mileage).toBeUndefined();
  });

  it('an all-active refresh never reads the board', async () => {
    const { svc, boardSpy, updateSpy } = build({ claim: makeClaim() });

    await withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/001/04/26'));

    expect(boardSpy).not.toHaveBeenCalled();
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch.breakdown?.mileageSource).toBe('declared');
  });

  it('resets the verification checkpoint + Maksim gate when the money moved', async () => {
    const { svc, updateSpy } = build({
      claim: makeClaim({
        maksimGateRequired: true,
        maksimGateNotifiedAt: new Date('2026-04-22T10:00:00.000Z'),
        maksimGateNotifiedAmount: 1_400,
        maksimGateClearedAt: new Date('2026-04-23T10:00:00.000Z'),
        maksimGateClearedById: 'u-admin',
      }),
    });

    await withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/001/04/26'));

    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch.verifiedAt).toBeNull();
    expect(patch.verifiedById).toBeNull();
    expect(patch.maksimGateRequired).toBe(false);
    expect(patch.maksimGateNotifiedAt).toBeNull();
    expect(patch.maksimGateClearedAt).toBeNull();
  });

  it('an idempotent refresh (same numbers) keeps the verification stamp', async () => {
    const { svc, updateSpy } = build({
      claim: makeClaim(),
      // Same km-calc output as the persisted row → nothing moved.
      kmResult: { kmGuaranteed: 10_800, ratePerKmEffective: 0.5, totalDays: 20 },
    });

    await withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/001/04/26'));

    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch.kmGuaranteed).toBe(10_800);
    expect(patch.kmDifference).toBe(2_800);
    expect(patch.paymentEur).toBe(1_400);
    expect(patch.verifiedAt).toBeUndefined();
    expect(patch.maksimGateRequired).toBeUndefined();
  });

  it('stashes a `before` snapshot for the audit diff and returns the updated DTO', async () => {
    const { svc } = build({ claim: makeClaim() });

    const { result, store } = await withAuditContext(() =>
      svc.refreshLimits(ADMIN, 'GWA/001/04/26'),
    );

    const before = store.before as Record<string, unknown>;
    expect(before.kmGuaranteed).toBe(10_800);
    expect(before.paymentEur).toBe(1_400);
    expect(result.kmGuaranteed).toBe(5_400);
    expect(result.paymentEur).toBe(0);
  });
});

describe('ClaimsService.refreshLimits — gate', () => {
  it('404 when the wniosek does not exist', async () => {
    const { svc } = build({ claim: null });
    await expect(
      withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/999/04/26')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('422 CLAIM_LIMITS_REFRESH_BLOCKED while awaiting Maksim authorization', async () => {
    const { svc, updateSpy } = build({
      claim: makeClaim({ status: 'OCZEKUJE_NA_AUTORYZACJE' }),
    });

    await expect(
      withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/001/04/26')),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    try {
      await withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/001/04/26'));
    } catch (err) {
      const body = (err as UnprocessableEntityException).getResponse() as {
        code: string;
        message: string;
        extensions: { code: string; status: string };
      };
      expect(body.code).toBe('CLAIM_LIMITS_REFRESH_BLOCKED');
      expect(body.extensions.code).toBe('CLAIM_LIMITS_REFRESH_BLOCKED');
      expect(body.extensions.status).toBe('OCZEKUJE_NA_AUTORYZACJE');
      expect(body.message).toContain('autoryzacji');
    }
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it.each<ClaimStatus>(['ZAAKCEPTOWANO', 'ODRZUCONO', 'REKLAMACJA'])(
    '422 for a decided wniosek (%s) — the amount is closed',
    async (status) => {
      const { svc, updateSpy } = build({ claim: makeClaim({ status }) });

      await expect(
        withAuditContext(() => svc.refreshLimits(ADMIN, 'GWA/001/04/26')),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(updateSpy).not.toHaveBeenCalled();
    },
  );
});

// ── Dry run: GET /claims/:nrZgl/recalc-limits/preview ──────

describe('ClaimsService.previewLimitsRefresh — pure read', () => {
  it('computes the SAME numbers the write would persist, with live limits', async () => {
    const { svc, kmCalcSpy } = build({ claim: makeClaim() });

    const out = await svc.previewLimitsRefresh('GWA/001/04/26');

    // Same km-calc call shape as `refreshLimits`: no frozen snapshot.
    expect(kmCalcSpy).toHaveBeenCalledTimes(1);
    expect(kmCalcSpy.mock.calls[0]![0].limitsSnapshot).toBeUndefined();

    expect(out.current).toEqual({
      kmGuaranteed: 10_800,
      kmDifference: 2_800,
      paymentEur: 1_400,
      ratePerKmEffective: 0.5,
      drivenDays: 20,
    });
    expect(out.next).toEqual({
      kmGuaranteed: 5_400,
      // 5_400 − 8_000 ⇒ the refresh would wipe the dopłata out.
      kmDifference: -2_600,
      paymentEur: 0,
      ratePerKmEffective: 0.5,
      drivenDays: 20,
    });
    expect(out.changed).toBe(true);
  });

  it('agrees field-for-field with what the write actually persists', async () => {
    // Same fixture through both paths — a drifting second copy of the formula
    // would show up right here.
    const previewRun = build({ claim: makeClaim() });
    const preview = await previewRun.svc.previewLimitsRefresh('GWA/001/04/26');

    const writeRun = build({ claim: makeClaim() });
    await withAuditContext(() =>
      writeRun.svc.refreshLimits(ADMIN, 'GWA/001/04/26'),
    );
    const patch = writeRun.updateSpy.mock.calls[0]![1] as UpdateClaimData;

    expect(preview.next).toEqual({
      kmGuaranteed: patch.kmGuaranteed,
      kmDifference: patch.kmDifference,
      paymentEur: patch.paymentEur,
      ratePerKmEffective: patch.ratePerKmEffective,
      drivenDays: patch.drivenDays,
    });
  });

  it('writes NOTHING: no repository update, no audit row, no `before` snapshot', async () => {
    const { svc, updateSpy, auditLogSpy } = build({ claim: makeClaim() });

    const { store } = await withAuditContext(async () => {
      await svc.previewLimitsRefresh('GWA/001/04/26');
      return undefined;
    });

    expect(updateSpy).not.toHaveBeenCalled();
    expect(auditLogSpy).not.toHaveBeenCalled();
    // Nothing stashed for the interceptor either — the route carries no
    // `@Audit()`, and a stray `before` would attach to an unrelated row.
    expect(store.before).toBeUndefined();
  });

  it('changed = false when today\'s limits produce the persisted numbers', async () => {
    const { svc } = build({
      claim: makeClaim(),
      kmResult: {
        totalDays: 20,
        kmGuaranteed: 10_800,
        ratePerKmEffective: 0.5,
      },
    });

    const out = await svc.previewLimitsRefresh('GWA/001/04/26');

    expect(out.changed).toBe(false);
    expect(out.next).toEqual(out.current);
  });

  it('changed = true for a day-count-only move (no amount change)', async () => {
    // `drivenDays` and `ratePerKmEffective` are part of the diff even though
    // they alone do NOT trigger the verification reset on the write path.
    const { svc } = build({
      claim: makeClaim(),
      kmResult: {
        totalDays: 19,
        kmGuaranteed: 10_800,
        ratePerKmEffective: 0.5,
      },
    });

    const out = await svc.previewLimitsRefresh('GWA/001/04/26');

    expect(out.changed).toBe(true);
    expect(out.next.drivenDays).toBe(19);
    expect(out.next.paymentEur).toBe(out.current.paymentEur);
  });

  it('matches the response contract (RecalcLimitsPreviewSchema)', async () => {
    const { svc } = build({ claim: makeClaim() });
    const out = await svc.previewLimitsRefresh('GWA/001/04/26');
    expect(() => RecalcLimitsPreviewSchema.parse(out)).not.toThrow();
  });
});

describe('ClaimsService.previewLimitsRefresh — changedWeeks', () => {
  it('lists every week whose limits moved, with «było / będzie» limits and kmInWeek', async () => {
    // Default fixture: snapshot 540 km/day in all four weeks, today 270.
    const { svc } = build({ claim: makeClaim() });

    const out = await svc.previewLimitsRefresh('GWA/001/04/26');

    expect(out.unchangedWeekCount).toBe(0);
    expect(out.changedWeeks.map((w) => w.isoWeek)).toEqual([
      '2026-W14',
      '2026-W15',
      '2026-W16',
      '2026-W17',
    ]);
    // Range = the week's days INSIDE the period (W14 starts on Wed 01.04,
    // W17 ends on Mon 20.04).
    expect(out.changedWeeks[0]).toEqual({
      isoWeek: '2026-W14',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-05',
      current: { kmPerDay: 540, ratePerKm: 0.5, kmPerSaturday: 0, kmInWeek: 2_700 },
      next: { kmPerDay: 270, ratePerKm: 0.5, kmPerSaturday: 0, kmInWeek: 1_350 },
    });
    expect(out.changedWeeks[3]!.periodStart).toBe('2026-04-20');
    expect(out.changedWeeks[3]!.periodEnd).toBe('2026-04-20');
  });

  it('only the edited week is listed; the rest are counted as unchanged', async () => {
    const { svc } = build({
      claim: makeClaim(),
      kmResult: {
        kmGuaranteed: 10_600,
        breakdown: weeksAt(540, { '2026-W16': { kmPerDay: 500 } }),
      },
    });

    const out = await svc.previewLimitsRefresh('GWA/001/04/26');

    expect(out.changedWeeks).toHaveLength(1);
    expect(out.changedWeeks[0]!.isoWeek).toBe('2026-W16');
    expect(out.changedWeeks[0]!.current.kmPerDay).toBe(540);
    expect(out.changedWeeks[0]!.next.kmPerDay).toBe(500);
    expect(out.changedWeeks[0]!.next.kmInWeek).toBe(2_500);
    expect(out.unchangedWeekCount).toBe(3);
    expect(out.changed).toBe(true);
  });

  it('a rate-only or a Saturday-only edit lists the week too', async () => {
    const { svc } = build({
      claim: makeClaim(),
      kmResult: {
        kmGuaranteed: 11_100,
        breakdown: weeksAt(540, {
          '2026-W15': { ratePerKm: 0.6 },
          '2026-W16': {
            kmPerSaturday: 300,
            saturdaysCounted: 1,
            saturdayDays: ['2026-04-18'],
            kmFromSaturdays: 300,
          },
        }),
      },
    });

    const out = await svc.previewLimitsRefresh('GWA/001/04/26');

    expect(out.changedWeeks.map((w) => w.isoWeek)).toEqual(['2026-W15', '2026-W16']);
    expect(out.changedWeeks[0]!.next.ratePerKm).toBe(0.6);
    expect(out.changedWeeks[0]!.next.kmInWeek).toBe(2_700); // km unchanged, rate moved
    expect(out.changedWeeks[1]!.current.kmPerSaturday).toBe(0);
    expect(out.changedWeeks[1]!.next).toEqual({
      kmPerDay: 540,
      ratePerKm: 0.5,
      kmPerSaturday: 300,
      kmInWeek: 3_000,
    });
    expect(out.unchangedWeekCount).toBe(2);
  });

  it('a week whose kmInWeek moved but whose limits did not is NOT listed', async () => {
    // W14 switched off ⇒ the `hoursAdjusted` share moves onto the other weeks,
    // changing their kmInWeek; their LIMITS are untouched.
    const { svc } = build({
      claim: makeClaim(),
      kmResult: {
        kmGuaranteed: 7_830,
        breakdown: weeksAt(540, {
          '2026-W14': { kmPerDay: 0 },
          '2026-W15': { workingDays: 4.83 },
        }),
      },
    });

    const out = await svc.previewLimitsRefresh('GWA/001/04/26');

    expect(out.changedWeeks.map((w) => w.isoWeek)).toEqual(['2026-W14']);
    expect(out.unchangedWeekCount).toBe(3);
  });

  it('identical limits everywhere ⇒ no changed week, every week unchanged', async () => {
    const { svc } = build({
      claim: makeClaim(),
      kmResult: { kmGuaranteed: 10_800, breakdown: weeksAt(540) },
    });

    const out = await svc.previewLimitsRefresh('GWA/001/04/26');

    expect(out.changedWeeks).toEqual([]);
    expect(out.unchangedWeekCount).toBe(4);
    expect(out.changed).toBe(false);
  });

  it('weeks come out ascending even when the fresh rows do not', async () => {
    const { svc } = build({
      claim: makeClaim(),
      kmResult: { breakdown: [...weeksAt(270)].reverse() },
    });

    const out = await svc.previewLimitsRefresh('GWA/001/04/26');

    expect(out.changedWeeks.map((w) => w.isoWeek)).toEqual([
      '2026-W14',
      '2026-W15',
      '2026-W16',
      '2026-W17',
    ]);
  });

  it('a stored breakdown without week rows (legacy / monthly) lists nothing and does not throw', async () => {
    const legacyMonthly = {
      ...makeBreakdown(),
      breakdown: [
        { yearMonth: '2026-04', workingDays: 20, kmPerDay: 540, ratePerKm: 0.5 },
      ],
    } as unknown as KmCalcBreakdown;
    const forLegacy = build({ claim: makeClaim({ breakdown: legacyMonthly }) });
    const forNull = build({ claim: makeClaim({ breakdown: null }) });

    const outLegacy = await forLegacy.svc.previewLimitsRefresh('GWA/001/04/26');
    const outNull = await forNull.svc.previewLimitsRefresh('GWA/001/04/26');

    for (const out of [outLegacy, outNull]) {
      expect(out.changedWeeks).toEqual([]);
      expect(out.unchangedWeekCount).toBe(0);
      // The money comparison is unaffected — it reads the claim columns.
      expect(out.next.kmGuaranteed).toBe(5_400);
      expect(() => RecalcLimitsPreviewSchema.parse(out)).not.toThrow();
    }
  });
});

describe('ClaimsService.previewLimitsRefresh — same gate as the write', () => {
  it('404 when the wniosek does not exist', async () => {
    const { svc } = build({ claim: null });
    await expect(svc.previewLimitsRefresh('GWA/999/04/26')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each<ClaimStatus>([
    'OCZEKUJE_NA_AUTORYZACJE',
    'ZAAKCEPTOWANO',
    'ODRZUCONO',
    'REKLAMACJA',
  ])(
    '422 CLAIM_LIMITS_REFRESH_BLOCKED for %s — refused BEFORE the dialog opens',
    async (status) => {
      const { svc, kmCalcSpy } = build({ claim: makeClaim({ status }) });

      let caught: unknown;
      try {
        await svc.previewLimitsRefresh('GWA/001/04/26');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      const body = (caught as UnprocessableEntityException).getResponse() as {
        code: string;
        extensions: { code: string; status: string };
      };
      expect(body.code).toBe('CLAIM_LIMITS_REFRESH_BLOCKED');
      expect(body.extensions.status).toBe(status);
      // Gate runs before any computation.
      expect(kmCalcSpy).not.toHaveBeenCalled();
    },
  );
});
