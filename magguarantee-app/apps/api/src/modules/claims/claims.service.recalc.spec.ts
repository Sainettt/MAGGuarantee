// Phase 7 REWORK (2026-06-20 #4) — `ClaimsService.recalcFromDelegation` tests.
//
// Covers the auto-recalc invoked from `DelegationsService.markReturned()`:
//   - happy path (applied): NA_WERYFIKACJI + periodAdjustedByVerifier=false →
//     dateEnd shifts to actualReturnAt, mileage re-prefilled (no carrier
//     override), km-calc re-run, numbers persisted, `claim.autoRecalc` audited.
//   - skip by status (FROZEN OCZEKUJE_NA_AUTORYZACJE — the claim crossed the auth
//     threshold at verification and the system already emailed Maksim the
//     concrete dopłata, so it must not shift) → `autoRecalcSkipped`.
//   - skip by status (decided ZAAKCEPTOWANO) → no write, `autoRecalcSkipped`.
//   - skip by periodAdjustedByVerifier=true → no write, `autoRecalcSkipped`.
//   - no-op when no claim is linked.
//
// NA_WERYFIKACJI is now the ONLY status where the late-`zjechal` auto-recalc
// mutates the wniosek.
//
// Reuses the SAME `_resolveMileage` (via the daily-km repo) + `KmCalcService`
// the submit/preview paths use, so the project invariant
// "preview == submit == recalc" holds.

import type { KmCalcResult } from '@magguarantee/shared';

import type { AuditWriter } from '../audit/audit.service';
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

function makeClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: 'claim-1',
    nrZgl: 'GWA/001/05/26',
    carrierId: 'c-1',
    carrier: { id: 'c-1', login: 'pwz', name: 'Pwz' },
    vehicleId: 'v-1',
    vehicle: { id: 'v-1', plateNumber: 'WX1' },
    vehiclePlateSnapshot: 'WX1',
    dateStart: new Date('2026-05-01T00:00:00.000Z'),
    dateEnd: new Date('2026-05-09T00:00:00.000Z'),
    timeFrom: '08:00',
    timeTo: '18:00',
    drivenDays: 10,
    mileage: 8_000,
    kmPerDay: 800,
    kmGuaranteed: 10_800,
    kmDifference: 2_800,
    paymentEur: 1_400,
    ratePerKmEffective: 0.5,
    breakdown: {
      totalDays: 10,
      rawTotalDays: 10,
      kmGuaranteed: 10_800,
      ratePerKmEffective: 0.5,
      breakdown: [],
      firstDay: null,
      lastDay: null,
    },
    status: 'NA_WERYFIKACJI',
    statusChangedAt: null,
    decidedById: null,
    decidedBy: null,
    // Verified by default so the auto-recalc reset test can assert the stamp
    // gets cleared back to null when the underlying data changes.
    verifiedAt: new Date('2026-05-10T09:00:00.000Z'),
    verifiedById: 'u-verifier',
    verifiedBy: { id: 'u-verifier', login: 'ver', name: 'Verifier' },
    comment: null,
    orderNumber: null,
    orderDate: null,
    amountApproved: null,
    reklamacjaSubmitted: false,
    reklamacjaText: null,
    reklamacjaResponse: null,
    reklamacjaAmount: null,
    statusBeforeReklamacja: null,
    origDateStart: new Date('2026-05-01T00:00:00.000Z'),
    origDateEnd: new Date('2026-05-09T00:00:00.000Z'),
    // origMileage === mileage ⇒ "carrier did not override" → re-prefill on recalc
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
    delegationId: 'deleg-1',
    delegationDepartureAt: null,
    delegationActualDepartureAt: null,
    delegationPlannedReturnAt: null,
    delegationActualReturnAt: null,
    delegationStatus: 'zjechal',
    periodAdjustedByVerifier: false,
    autoRecalcState: 'none',
    createdAt: new Date('2026-05-10T08:00:00.000Z'),
    updatedAt: new Date('2026-05-10T08:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

interface Built {
  service: ClaimsService;
  updateSpy: jest.Mock;
  auditLogs: { action: string }[];
  kmCalcSpy: jest.Mock;
  sumSpy: jest.Mock;
}

function build(opts: {
  claim: ClaimRow | null;
  kmResult?: Partial<KmCalcResult>;
  droveSum?: number;
}): Built {
  const updateSpy = jest.fn(async (id: string, data: UpdateClaimData) => ({
    ...(opts.claim as ClaimRow),
    ...data,
    id,
  }));
  const claims = {
    findByDelegationId: jest.fn(async () => opts.claim),
    update: updateSpy,
  } as unknown as ClaimsRepository;

  const kmCalcSpy = jest.fn(async (): Promise<KmCalcResult> => ({
    totalDays: 12,
    rawTotalDays: 12,
    kmGuaranteed: 12_000,
    ratePerKmEffective: 0.5,
    breakdown: [],
    firstDay: null,
    lastDay: null,
    ...opts.kmResult,
  }));
  const kmCalc = { calc: kmCalcSpy } as unknown as KmCalcService;

  const sumSpy = jest.fn(async () => opts.droveSum ?? 9_000);
  const dailyKm = {
    sumDroveKm: sumSpy,
  } as unknown as VehicleDailyKmRepository;

  const auditLogs: { action: string }[] = [];
  const auditWriter = {
    log: jest.fn(async (e: { action: string }) => {
      auditLogs.push({ action: e.action });
    }),
  } as unknown as AuditWriter;

  const service = new ClaimsService(
    claims,
    {} as CarriersRepository,
    {} as VehiclesRepository,
    {} as DriversRepository,
    {} as TrailersRepository,
    kmCalc,
    {} as NrZglService,
    {} as PrismaService,
    auditWriter,
    undefined,
    undefined,
    dailyKm,
  );
  return { service, updateSpy, auditLogs, kmCalcSpy, sumSpy };
}

describe('ClaimsService.recalcFromDelegation', () => {
  const ACTUAL = new Date('2026-05-12T00:00:00.000Z');

  it('applies on NA_WERYFIKACJI + not-adjusted: shifts dateEnd, re-prefills mileage, re-runs km-calc, audits autoRecalc', async () => {
    const { service, updateSpy, auditLogs, kmCalcSpy, sumSpy } = build({
      claim: makeClaim(),
      kmResult: { kmGuaranteed: 12_000, ratePerKmEffective: 0.5, totalDays: 12 },
      droveSum: 9_000,
    });

    await service.recalcFromDelegation('deleg-1', ACTUAL);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    // dateEnd shifted to actualReturnAt; dateStart untouched (not in patch).
    expect((patch.dateEnd as Date).toISOString()).toBe(
      '2026-05-12T00:00:00.000Z',
    );
    expect(patch.dateStart).toBeUndefined();
    // mileage re-prefilled from Σ drove km (9_000), not the old 8_000.
    expect(patch.mileage).toBe(9_000);
    // km-calc was re-run with the new period (re-prefill queried daily km).
    expect(kmCalcSpy).toHaveBeenCalledTimes(1);
    expect(sumSpy).toHaveBeenCalledTimes(1);
    // numbers recomputed: kmDifference = 12_000 - 9_000 = 3_000;
    // paymentEur = 3_000 * 0.5 = 1_500.
    expect(patch.kmGuaranteed).toBe(12_000);
    expect(patch.kmDifference).toBe(3_000);
    expect(patch.paymentEur).toBe(1_500);
    // timeFrom/timeTo NOT touched.
    expect(patch.timeFrom).toBeUndefined();
    expect(patch.timeTo).toBeUndefined();
    // Verification checkpoint INVALIDATED — the underlying data changed, so any
    // prior «Zapisz weryfikację» stamp is cleared and the verifier must
    // re-confirm before the (now re-gated) decision transitions unlock.
    expect(patch.verifiedAt).toBeNull();
    expect(patch.verifiedById).toBeNull();
    // Maksim gate reset IN LOCKSTEP with the verification stamp — the gate must
    // never outlive a data change Maksim never confirmed. A later re-verify
    // re-arms (and re-sends) from scratch.
    expect(patch.maksimGateRequired).toBe(false);
    expect(patch.maksimGateNotifiedAt).toBeNull();
    // Amount-aware dedup stamp nulled in lockstep with the rest of the gate.
    expect(patch.maksimGateNotifiedAmount).toBeNull();
    expect(patch.maksimGateClearedAt).toBeNull();
    expect(patch.maksimGateClearedById).toBeNull();
    // audit: autoRecalc (not skipped).
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalc']);
  });

  it('Fix A e2e — an already-verified, over-threshold, NOT-period-adjusted claim + a diverging late zjechał APPLIES the recalc and clears verifiedAt + the whole Maksim gate', async () => {
    // This is the exact bug the value-based period-change detection unblocks:
    // BEFORE the fix, a verify that re-sent the prefilled dates latched
    // periodAdjustedByVerifier=true, which gated out THIS recalc. With the fix
    // the flag stays false, so the late zjechał applies + resets everything.
    const { service, updateSpy, kmCalcSpy } = build({
      claim: makeClaim({
        status: 'NA_WERYFIKACJI',
        periodAdjustedByVerifier: false,
        verifiedAt: new Date('2026-05-10T09:00:00.000Z'),
        verifiedById: 'u-verifier',
        // Over threshold + already notified (the 1st Maksim email fired).
        maksimGateRequired: true,
        maksimGateNotifiedAt: new Date('2026-05-10T09:05:00.000Z'),
        maksimGateNotifiedAmount: 1_400,
        maksimGateClearedAt: null,
        maksimGateClearedById: null,
      }),
      kmResult: { kmGuaranteed: 12_000, ratePerKmEffective: 0.5, totalDays: 12 },
      droveSum: 9_000,
    });

    // ACTUAL (2026-05-12) diverges from the claim's dateEnd (2026-05-09).
    await service.recalcFromDelegation('deleg-1', ACTUAL);

    // Recalc APPLIED (not skipped): km-calc ran + the period shifted.
    expect(kmCalcSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect((patch.dateEnd as Date).toISOString()).toBe(
      '2026-05-12T00:00:00.000Z',
    );
    expect(patch.autoRecalcState).toBe('applied');
    // Verification stamp cleared via _resetVerificationState.
    expect(patch.verifiedAt).toBeNull();
    expect(patch.verifiedById).toBeNull();
    // The WHOLE Maksim gate reset in lockstep — including the amount-aware
    // dedup stamp — so a later re-verify re-arms + re-sends the 2nd email.
    expect(patch.maksimGateRequired).toBe(false);
    expect(patch.maksimGateNotifiedAt).toBeNull();
    expect(patch.maksimGateNotifiedAmount).toBeNull();
    expect(patch.maksimGateClearedAt).toBeNull();
    expect(patch.maksimGateClearedById).toBeNull();
  });

  it('SKIPS OCZEKUJE_NA_AUTORYZACJE (FROZEN under authorization) WITH divergence: writes autoRecalcState=skipped (no recalc), audits autoRecalcSkipped', async () => {
    // Reflects the 2026-06-22 boundary change: once pracownik sends a concrete
    // amount to Maksim for authorization, the wniosek's number is frozen and the
    // late-`zjechal` auto-recalc must NOT shift it. claim.dateEnd = 2026-05-09;
    // ACTUAL = 2026-05-12 ⇒ real divergence → state stamps to `skipped`.
    const { service, updateSpy, auditLogs, kmCalcSpy } = build({
      claim: makeClaim({ status: 'OCZEKUJE_NA_AUTORYZACJE' }),
    });
    await service.recalcFromDelegation('deleg-1', ACTUAL);
    // The ONLY write is the state stamp — no period/km-calc recalc.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch).toEqual({ autoRecalcState: 'skipped' });
    expect(kmCalcSpy).not.toHaveBeenCalled();
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalcSkipped']);
  });

  it('SKIPS OCZEKUJE_NA_AUTORYZACJE WITHOUT divergence (dateEnd === actualReturnAt): leaves autoRecalcState=none — no write, audit only', async () => {
    const { service, updateSpy, auditLogs, kmCalcSpy } = build({
      claim: makeClaim({
        status: 'OCZEKUJE_NA_AUTORYZACJE',
        dateEnd: new Date('2026-05-12T00:00:00.000Z'), // === ACTUAL day
      }),
    });
    await service.recalcFromDelegation('deleg-1', ACTUAL);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(kmCalcSpy).not.toHaveBeenCalled();
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalcSkipped']);
  });

  it('preserves a carrier mileage override (origMileage !== mileage) — no re-prefill', async () => {
    const { service, updateSpy, sumSpy } = build({
      // carrier overrode: applied mileage 8_500 differs from the snapshot 8_000.
      claim: makeClaim({ mileage: 8_500, origMileage: 8_000 }),
    });
    await service.recalcFromDelegation('deleg-1', ACTUAL);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch.mileage).toBe(8_500);
    // daily-km repo never queried — the override is respected.
    expect(sumSpy).not.toHaveBeenCalled();
  });

  it('applied path stamps autoRecalcState=applied on the persisted patch', async () => {
    const { service, updateSpy } = build({ claim: makeClaim() });
    await service.recalcFromDelegation('deleg-1', ACTUAL);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch.autoRecalcState).toBe('applied');
  });

  it('SKIPS a decided claim (ZAAKCEPTOWANO) WITH divergence: writes autoRecalcState=skipped (no recalc), audits autoRecalcSkipped', async () => {
    // claim.dateEnd = 2026-05-09; ACTUAL = 2026-05-12 ⇒ real divergence.
    const { service, updateSpy, auditLogs, kmCalcSpy } = build({
      claim: makeClaim({ status: 'ZAAKCEPTOWANO' }),
    });
    await service.recalcFromDelegation('deleg-1', ACTUAL);
    // The ONLY write is the state stamp — no period/km-calc recalc.
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch).toEqual({ autoRecalcState: 'skipped' });
    expect(kmCalcSpy).not.toHaveBeenCalled();
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalcSkipped']);
  });

  it('SKIPS when periodAdjustedByVerifier=true WITH divergence: writes autoRecalcState=skipped (no recalc), audits autoRecalcSkipped', async () => {
    const { service, updateSpy, auditLogs, kmCalcSpy } = build({
      claim: makeClaim({ periodAdjustedByVerifier: true }),
    });
    await service.recalcFromDelegation('deleg-1', ACTUAL);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch).toEqual({ autoRecalcState: 'skipped' });
    expect(kmCalcSpy).not.toHaveBeenCalled();
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalcSkipped']);
  });

  it('SKIPS WITHOUT divergence (dateEnd === actualReturnAt): leaves autoRecalcState=none — no write, audit only', async () => {
    // Decided claim whose dateEnd already equals the outing's actual return —
    // the recalc would be a no-op, so the state must NOT flip to skipped.
    const { service, updateSpy, auditLogs } = build({
      claim: makeClaim({
        status: 'ZAAKCEPTOWANO',
        dateEnd: new Date('2026-05-12T00:00:00.000Z'), // === ACTUAL day
      }),
    });
    await service.recalcFromDelegation('deleg-1', ACTUAL);
    // No write — the column stays at its current `none`.
    expect(updateSpy).not.toHaveBeenCalled();
    // Audit row still recorded (the trigger fired), but `after` is null.
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalcSkipped']);
  });

  it('no-op when no claim is linked: no write, no audit', async () => {
    const { service, updateSpy, auditLogs } = build({ claim: null });
    await service.recalcFromDelegation('deleg-1', ACTUAL);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(auditLogs).toHaveLength(0);
  });
});

// The DEPARTURE-side mirror: `recalcDepartureFromDelegation` is invoked from
// `DelegationsService.markInTransit()` when the weryfikator captures a (possibly
// backdated) `actualDepartureAt`. It shifts `dateStart` (not `dateEnd`) but
// otherwise shares the same gate + audit contract as the return side.
describe('ClaimsService.recalcDepartureFromDelegation', () => {
  // makeClaim() period is [2026-05-01, 2026-05-09]. A backdated actual departure
  // of 2026-05-03 shifts dateStart forward within the period.
  const ACTUAL_DEP = new Date('2026-05-03T00:00:00.000Z');

  it('applies on NA_WERYFIKACJI + not-adjusted: shifts dateStart, re-prefills mileage, re-runs km-calc, audits autoRecalc', async () => {
    const { service, updateSpy, auditLogs, kmCalcSpy, sumSpy } = build({
      claim: makeClaim(),
      kmResult: { kmGuaranteed: 12_000, ratePerKmEffective: 0.5, totalDays: 12 },
      droveSum: 9_000,
    });

    await service.recalcDepartureFromDelegation('deleg-1', ACTUAL_DEP);

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    // dateStart shifted to actualDepartureAt; dateEnd untouched (not in patch).
    expect((patch.dateStart as Date).toISOString()).toBe(
      '2026-05-03T00:00:00.000Z',
    );
    expect(patch.dateEnd).toBeUndefined();
    // mileage re-prefilled from Σ drove km (9_000), not the old 8_000.
    expect(patch.mileage).toBe(9_000);
    expect(kmCalcSpy).toHaveBeenCalledTimes(1);
    expect(sumSpy).toHaveBeenCalledTimes(1);
    // numbers recomputed: kmDifference = 12_000 - 9_000 = 3_000;
    // paymentEur = 3_000 * 0.5 = 1_500.
    expect(patch.kmGuaranteed).toBe(12_000);
    expect(patch.kmDifference).toBe(3_000);
    expect(patch.paymentEur).toBe(1_500);
    // timeFrom/timeTo NOT touched.
    expect(patch.timeFrom).toBeUndefined();
    expect(patch.timeTo).toBeUndefined();
    // Verification checkpoint invalidated (same as the return side).
    expect(patch.verifiedAt).toBeNull();
    expect(patch.verifiedById).toBeNull();
    // Maksim gate reset in lockstep (same as the return side).
    expect(patch.maksimGateRequired).toBe(false);
    expect(patch.maksimGateNotifiedAt).toBeNull();
    expect(patch.maksimGateNotifiedAmount).toBeNull();
    expect(patch.maksimGateClearedAt).toBeNull();
    expect(patch.maksimGateClearedById).toBeNull();
    expect(patch.autoRecalcState).toBe('applied');
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalc']);
  });

  it('re-prefills mileage over the NEW (shifted) period — daily-km queried once', async () => {
    const { service, sumSpy } = build({ claim: makeClaim(), droveSum: 7_500 });
    await service.recalcDepartureFromDelegation('deleg-1', ACTUAL_DEP);
    expect(sumSpy).toHaveBeenCalledTimes(1);
  });

  it('preserves a carrier mileage override (origMileage !== mileage) — no re-prefill', async () => {
    const { service, updateSpy, sumSpy } = build({
      claim: makeClaim({ mileage: 8_500, origMileage: 8_000 }),
    });
    await service.recalcDepartureFromDelegation('deleg-1', ACTUAL_DEP);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch.mileage).toBe(8_500);
    expect(sumSpy).not.toHaveBeenCalled();
  });

  it('SKIPS OCZEKUJE_NA_AUTORYZACJE (FROZEN) WITH divergence: writes autoRecalcState=skipped, audits autoRecalcSkipped', async () => {
    // claim.dateStart = 2026-05-01; ACTUAL_DEP = 2026-05-03 ⇒ real divergence.
    const { service, updateSpy, auditLogs, kmCalcSpy } = build({
      claim: makeClaim({ status: 'OCZEKUJE_NA_AUTORYZACJE' }),
    });
    await service.recalcDepartureFromDelegation('deleg-1', ACTUAL_DEP);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch).toEqual({ autoRecalcState: 'skipped' });
    expect(kmCalcSpy).not.toHaveBeenCalled();
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalcSkipped']);
  });

  it('SKIPS a decided claim (ZAAKCEPTOWANO) WITH divergence: writes autoRecalcState=skipped, audits autoRecalcSkipped', async () => {
    const { service, updateSpy, auditLogs, kmCalcSpy } = build({
      claim: makeClaim({ status: 'ZAAKCEPTOWANO' }),
    });
    await service.recalcDepartureFromDelegation('deleg-1', ACTUAL_DEP);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch).toEqual({ autoRecalcState: 'skipped' });
    expect(kmCalcSpy).not.toHaveBeenCalled();
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalcSkipped']);
  });

  it('SKIPS when periodAdjustedByVerifier=true WITH divergence: writes autoRecalcState=skipped, audits autoRecalcSkipped', async () => {
    const { service, updateSpy, auditLogs, kmCalcSpy } = build({
      claim: makeClaim({ periodAdjustedByVerifier: true }),
    });
    await service.recalcDepartureFromDelegation('deleg-1', ACTUAL_DEP);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const patch = updateSpy.mock.calls[0]![1] as UpdateClaimData;
    expect(patch).toEqual({ autoRecalcState: 'skipped' });
    expect(kmCalcSpy).not.toHaveBeenCalled();
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalcSkipped']);
  });

  it('SKIPS WITHOUT divergence (dateStart === actualDepartureAt): leaves autoRecalcState=none — no write, audit only', async () => {
    // Decided claim whose dateStart already equals the outing's actual departure
    // — the recalc would be a no-op, so the state must NOT flip to skipped.
    const { service, updateSpy, auditLogs } = build({
      claim: makeClaim({
        status: 'ZAAKCEPTOWANO',
        dateStart: new Date('2026-05-03T00:00:00.000Z'), // === ACTUAL_DEP day
      }),
    });
    await service.recalcDepartureFromDelegation('deleg-1', ACTUAL_DEP);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(auditLogs.map((l) => l.action)).toEqual(['claim.autoRecalcSkipped']);
  });

  it('no-op when no claim is linked: no write, no audit', async () => {
    const { service, updateSpy, auditLogs } = build({ claim: null });
    await service.recalcDepartureFromDelegation('deleg-1', ACTUAL_DEP);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(auditLogs).toHaveLength(0);
  });
});
