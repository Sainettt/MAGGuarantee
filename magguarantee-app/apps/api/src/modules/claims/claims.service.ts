import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  ClaimDto,
  ClaimFilters,
  ClaimListItem,
  ClaimStatus,
  DelegationWarning,
  KmCalcBreakdown,
  PreviewClaimDto,
  PreviewClaimResponse,
  RequestAuthorizationDto,
  SetAuthorizationAmountDto,
  SubmitClaimDto,
  SubmitReklamacjaDto,
  UpdateClaimDto,
} from '@magguarantee/shared';
import {
  canSubmitByDuration,
  cooldownCheck,
  DEFAULTS as CARRIER_SUBMISSION_DEFAULTS,
  DELEGATION_NOT_YET_RETURNED_WARNING,
  getAuthThreshold,
  isCompensationDue,
  startOfBusinessTodayUtc,
  VEHICLE_NOT_GUARANTEED,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit/audit-context';
import type { Env } from '../../config/env.schema';
import { AuditWriter } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  DelegationsRepository,
  type DelegationRow,
} from '../delegations/delegations.repository';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { KmCalcService } from '../km-calc/km-calc.service';
import { MailService } from '../mail/mail.service';
import type { Tone } from '../mail/templates/_theme';
import { PrismaService } from '../prisma/prisma.service';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehicleDailyKmRepository } from '../vehicles/vehicle-daily-km.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import { assertLegalTransition } from './claim-state-machine';
import {
  ClaimsRepository,
  type ClaimRow,
  type TransactionLike,
  type UpdateClaimData,
} from './claims.repository';
import { NrZglService } from './nr-zgl.service';

/** AppConfig keys this service consults. */
// `min_days_to_submit` and `carrier_period_span_min_days` are intentionally
// NOT read anymore. The duration gate collapsed to a single hours-only check
// (`roundDays(hours) >= threshold`, boundary inclusive at 10.00) because the
// calendar-span branch was unreachable for realistic data — reaching the
// rounded-days threshold in fewer calendar days would require > 24 working
// hours per day. Seed rows are kept for back-compat; we just ignore them.
const APP_CONFIG_MAX_DAYS_AFTER_UNLOAD = 'max_days_after_unloading';
const APP_CONFIG_MAX_PERIOD_DAYS = 'max_period_days';
const APP_CONFIG_MAX_AVG_KM_PER_DAY = 'max_avg_km_per_day';
// AppConfig key stays `carrier_rounded_days_override_threshold` for back-compat
// (it's already in seed + dev DB); the in-code identifier matches the semantic
// (worked-days threshold from km-calc, not a raw-hours override).
const APP_CONFIG_WORKED_DAYS_THRESHOLD =
  'carrier_rounded_days_override_threshold';
const APP_CONFIG_VEHICLE_COOLDOWN_DAYS = 'carrier_vehicle_cooldown_days';

/** Hardcoded fallbacks if AppConfig rows are missing — match seed defaults. */
const DEFAULT_MAX_DAYS_AFTER_UNLOAD = 7;
const DEFAULT_MAX_PERIOD_DAYS = 90;
const DEFAULT_MAX_AVG_KM_PER_DAY = 2000;

/**
 * Wire shape of the multi-violation 422 envelope. The `ProblemDetailsFilter`
 * forwards the `violations` array to the client unchanged; the carrier UI
 * renders it as a list above the form. Submit / reklamacja both use this.
 *
 * `extensions` is an optional bag of structured fields that the
 * `ProblemDetailsFilter` lifts into the RFC-7807 envelope under the
 * `extensions` key — used today by the vehicle-cooldown 422 to surface a
 * machine-readable `nextAllowedAt` ISO timestamp alongside the human
 * message, so the carrier UI can render a "available from <date>" CTA
 * without parsing the localised string.
 */
interface ViolationsPayload {
  message: string;
  violations: string[];
  extensions?: Record<string, unknown>;
}

function violationsException(
  violations: string[],
  extensions?: Record<string, unknown>,
): UnprocessableEntityException {
  const payload: ViolationsPayload = {
    message:
      violations.length === 1
        ? violations[0]!
        : 'Wniosek nie może zostać zapisany — patrz lista poniżej.',
    violations,
    ...(extensions && Object.keys(extensions).length > 0
      ? { extensions }
      : {}),
  };
  return new UnprocessableEntityException(payload);
}

/**
 * Convenience wrapper for the per-vehicle cooldown 422. Carries the
 * machine-readable `nextAllowedAt` Date as an ISO string in `extensions`
 * so the carrier UI can compute "X hours remaining" without re-parsing
 * the Polish localised message.
 */
function vehicleCooldownException(
  message: string,
  nextAllowedAt: Date,
): UnprocessableEntityException {
  return violationsException([message], {
    nextAllowedAt: nextAllowedAt.toISOString(),
  });
}

/**
 * Phase 3 — Claims service.
 *
 * Orchestrates the carrier-driven flow: submit a wniosek, request a live
 * preview, file a reklamacja. Verification (PATCH /claims/:nrZgl) is Phase
 * 4 and out of scope here.
 *
 * Reference: `Code.gs:6118-6406` (`submitNewClaim`) and `Code.gs:6804-6945`
 * (`submitReklamacja`). Status transitions follow `docs/04-data-model.md`.
 */
@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly claims: ClaimsRepository,
    private readonly carriers: CarriersRepository,
    private readonly vehicles: VehiclesRepository,
    private readonly drivers: DriversRepository,
    private readonly trailers: TrailersRepository,
    private readonly kmCalc: KmCalcService,
    private readonly nrZgl: NrZglService,
    private readonly prisma: PrismaService,
    private readonly auditWriter: AuditWriter,
    // Phase 4.2 — mail handshake (kwota-Maksima request). `MailService` is
    // an optional ctor arg so the existing 9-arg test fakes keep compiling;
    // production wiring always passes the real provider via NestJS DI. When
    // null/undefined, `_dispatchAuthorizationEmail` logs-and-skips instead
    // of throwing — same fire-and-log policy as the other notifications.
    private readonly mailService?: MailService,
    private readonly configService?: ConfigService<Env, true>,
    // Phase 7 REWORK (#3) — claim mileage pre-fill source. Optional ctor arg so
    // the existing positional test fakes keep compiling; production wiring
    // always injects it via DI (exported from VehiclesModule). When absent the
    // prefill is skipped and the carrier-supplied mileage is used as-is.
    private readonly dailyKm?: VehicleDailyKmRepository,
    // Phase 7 REWORK (#4) — submit derives the period/ownership from the chosen
    // outing, and the delegation `returned()` auto-recalc reads the linked
    // wniosek through this repo. `@Optional()` + `forwardRef` so the circular
    // ClaimsModule↔DelegationsModule wiring resolves and existing positional
    // test fakes (which omit the arg) keep compiling.
    @Optional()
    @Inject(forwardRef(() => DelegationsRepository))
    private readonly delegations?: DelegationsRepository,
  ) {}

  /**
   * Resolves the effective mileage for submit / preview / recalc as
   * `Σ VehicleDailyKm.km (state=drove)` over `[dateStart, dateEnd]` of the
   * vehicle (Phase 7 §0″ finish, docs/20 §0″). There is NO carrier override —
   * the carrier no longer sends `mileage`; it is ALWAYS the server-computed
   * daily-km sum. `pracownik` revises it at verification. `dateEnd` is
   * inclusive, so we pass `dateEnd + 1d` as the half-open upper bound to the
   * repository.
   */
  private async _resolveMileage(
    vehicleId: string,
    dateStart: Date,
    dateEnd: Date,
  ): Promise<number> {
    if (!this.dailyKm) return 0;
    const toExclusive = new Date(dateEnd.getTime() + 24 * 60 * 60 * 1000);
    return this.dailyKm.sumDroveKm(vehicleId, dateStart, toExclusive);
  }

  /**
   * Phase 7 §0″ — resolves the chosen outing and enforces the link invariants,
   * returning the outing row itself (so the caller can DERIVE vehicle / trailer
   * / driver / plate snapshot / mileage from it — the carrier no longer sends
   * any of those). Throws:
   *  - 422 when the outing is missing, belongs to another carrier, or is not yet
   *    `w_trasie`/`zjechal` (i.e. still `gotowy`/`zgloszony`/`anulowany`),
   *  - 409 when a wniosek already exists for the outing (defence-in-depth ahead
   *    of the unique-FK P2002 catch in `submit`).
   *
   * Returns the outing row plus the derived period boundaries plus a soft
   * `warning` when the outing is still `w_trasie` (the carrier may proceed;
   * `dateEnd` then falls back to `plannedReturnAt`, and a later `zjechal`
   * triggers the auto-recalc).
   */
  private async _resolveDelegationContext(
    carrierId: string,
    delegationId: string,
  ): Promise<{
    delegation: DelegationRow;
    dateStart: Date;
    dateEnd: Date;
    warning: DelegationWarning | null;
  }> {
    if (!this.delegations) {
      throw new UnprocessableEntityException(
        'Wybór wyjazdu jest wymagany dla nowego wniosku.',
      );
    }
    const deleg = await this.delegations.findById(delegationId);
    if (!deleg || deleg.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowy wyjazd');
    }
    if (deleg.claimId) {
      throw new ConflictException('Na ten wyjazd już złożono wniosek.');
    }
    // Guarantee gate (single seam — covers BOTH submit and preview). A wniosek
    // may only be filed for a vehicle under "Porozumienie" (`agreement===true`).
    // `false` AND `null`/missing both count as NOT guaranteed → 422 with the
    // single stable `extensions.code` envelope (NOT the `violations[]` shape).
    await this._assertVehicleGuaranteed(deleg);
    const period = this._deriveDelegationPeriod(deleg);
    return { delegation: deleg, ...period };
  }

  /**
   * Guarantee gate for the claims flow. Resolves the vehicle's "Porozumienie"
   * (`Vehicle.agreement`) using the SAME eager-relation-with-fallback pattern as
   * `_resolveVehiclePlate`: prefer the eager `delegation.vehicle.agreement`
   * relation; if the relation wasn't hydrated, fall back to a repository lookup
   * by `delegation.vehicleId`. Only `agreement === true` passes — `false`,
   * `null`, and a missing vehicle all throw a 422 carrying the stable
   * `VEHICLE_NOT_GUARANTEED` code in the single-code `extensions` envelope.
   */
  private async _assertVehicleGuaranteed(deleg: DelegationRow): Promise<void> {
    let agreement = deleg.vehicle?.agreement;
    if (agreement === undefined) {
      const v = await this.vehicles.findById(deleg.vehicleId);
      agreement = v?.agreement ?? null;
    }
    if (agreement !== true) {
      throw new UnprocessableEntityException({
        message:
          'Ta maszyna nie jest objęta gwarancją — skontaktuj się z opiekunem.',
        extensions: { code: VEHICLE_NOT_GUARANTEED },
      });
    }
  }

  /**
   * Pure period derivation from an outing row + the status gate. `dateStart =
   * date(departureAt)`, `dateEnd = actualReturnAt ?? plannedReturnAt`. Only
   * {`w_trasie`, `zjechal`} may back a wniosek; `w_trasie` yields a soft
   * warning (no `actualReturnAt` yet → planned date used). No IO.
   */
  private _deriveDelegationPeriod(deleg: DelegationRow): {
    dateStart: Date;
    dateEnd: Date;
    warning: DelegationWarning | null;
  } {
    if (deleg.status !== 'w_trasie' && deleg.status !== 'zjechal') {
      throw new UnprocessableEntityException(
        'Wniosek można złożyć tylko dla wyjazdu w trasie lub zjechanego.',
      );
    }
    const dateStart = startOfUtcDay(deleg.departureAt);
    const dateEnd = startOfUtcDay(deleg.actualReturnAt ?? deleg.plannedReturnAt);
    const warning: DelegationWarning | null =
      deleg.status === 'w_trasie' ? DELEGATION_NOT_YET_RETURNED_WARNING : null;
    return { dateStart, dateEnd, warning };
  }

  /**
   * Resolves the vehicle plate snapshot for a claim derived from an outing.
   * Prefers the eager `delegation.vehicle.plateNumber` relation; falls back to
   * a repository lookup by `delegation.vehicleId` if the relation wasn't
   * hydrated (defensive — the delegations repo always includes it). Throws 422
   * only if neither path resolves a plate (a referential-integrity problem).
   */
  private async _resolveVehiclePlate(deleg: DelegationRow): Promise<string> {
    if (deleg.vehicle?.plateNumber) return deleg.vehicle.plateNumber;
    const v = await this.vehicles.findById(deleg.vehicleId);
    if (v?.plateNumber) return v.plateNumber;
    throw new UnprocessableEntityException('Nieprawidłowy pojazd');
  }

  /**
   * Derives the driver display-name snapshot for a claim from the outing.
   * Prefers `delegation.driverNameSnapshot` (the value the carrier already
   * captured at outing creation); falls back to the `driver` relation
   * (`firstName lastName`). Returns `null` when neither is available.
   */
  private _resolveDriverNameSnapshot(deleg: DelegationRow): string | null {
    if (deleg.driverNameSnapshot && deleg.driverNameSnapshot.trim().length > 0) {
      return deleg.driverNameSnapshot;
    }
    if (deleg.driver) {
      const full = `${deleg.driver.firstName} ${deleg.driver.lastName}`.trim();
      return full.length > 0 ? full : null;
    }
    return null;
  }

  // ── Submit ──────────────────────────────────────────────

  async submit(user: AuthUser, dto: SubmitClaimDto): Promise<ClaimDto> {
    // carrier-only path, see @Roles on POST /claims
    const carrier = await this._requireCarrierProfile(user);

    // Phase 7 §0″ finish — EVERYTHING (period, vehicle, trailer, driver,
    // mileage) DERIVES from the chosen outing; the carrier sends only
    // `delegationId` + `timeFrom`/`timeTo` (+ optional comment/attachments).
    // `_resolveDelegationContext` validates ownership (same carrier), the
    // status gate ({w_trasie, zjechal}), the not-already-claimed invariant, and
    // returns the outing row + derived period (`dateStart = date(departureAt)`,
    // `dateEnd = actualReturnAt ?? plannedReturnAt`). A still-`w_trasie` outing
    // is NOT blocked — it carries a soft warning; a `gotowy`/`zgloszony` outing
    // throws 422. The trailer/driver belong to the carrier transitively (they
    // were chosen by the carrier when the carrier created the outing, and the
    // outing is owned by the carrier), so no separate ownership check is needed.
    const delegationCtx = await this._resolveDelegationContext(
      carrier.id,
      dto.delegationId,
    );
    const { delegation, dateStart, dateEnd } = delegationCtx;
    const vehicleId = delegation.vehicleId;
    const vehiclePlateSnapshot = await this._resolveVehiclePlate(delegation);

    const config = await this._loadSubmitConfig();
    const today = startOfBusinessTodayUtc();
    const dateStartIso = toIsoDateOnly(dateStart);
    const dateEndIso = toIsoDateOnly(dateEnd);

    // Mileage is ALWAYS `Σ VehicleDailyKm.km (state=drove)` over [dateStart,
    // dateEnd] for the delegation's vehicle (Phase 7 §0″ finish — no carrier
    // override). All downstream checks + the persisted row use this value.
    const mileage = await this._resolveMileage(vehicleId, dateStart, dateEnd);

    // ── Tier 1: pre-calc business rules ───────────────────────
    // Collect everything we can check WITHOUT running km-calc. If the user
    // has any of these wrong, km-calc would produce garbage anyway, so we
    // throw the whole list at once and let them fix it.
    const tier1: string[] = [];

    if (dateEnd.getTime() > today.getTime()) {
      tier1.push(
        `Data rozładunku (${dateEndIso}) jest w przyszłości. ` +
          `Wniosek można złożyć dopiero po zjechaniu auta.`,
      );
    }
    if (dateStart.getTime() > today.getTime()) {
      tier1.push(
        `Data załadunku (${dateStartIso}) jest w przyszłości.`,
      );
    }
    if (mileage <= 0) {
      tier1.push(
        `Przebieg musi być większy od zera (podano ${mileage}).`,
      );
    }
    // NB: We deliberately do NOT block on `!vehicle.active`. A wniosek is
    // about a past period — the vehicle may have been legitimately operating
    // during that period and only got deactivated afterwards (e.g. sold,
    // contract terminated). Soft-deleted vehicles are filtered upstream by
    // the Prisma soft-delete extension, so `_findOwnedVehicleOrThrow` only
    // returns rows the carrier may legitimately reference.
    const periodDays = daysBetweenInclusive(dateStart, dateEnd);
    if (periodDays > config.maxPeriodDays) {
      tier1.push(
        `Okres wniosku nie może przekraczać ${config.maxPeriodDays} dni ` +
          `(podano ${periodDays} dni).`,
      );
    }
    const daysAfterUnload = daysBetween(dateEnd, today);
    if (daysAfterUnload > config.maxDaysAfter) {
      tier1.push(
        `Termin na złożenie wniosku minął. Zgodnie z umową masz ` +
          `${config.maxDaysAfter} dni od daty rozładunku ` +
          `(upłynęło ${daysAfterUnload} dni).`,
      );
    }

    if (tier1.length > 0) throw violationsException(tier1);

    // Cooldown gate — per-vehicle anti-spam (replaces the legacy date-range
    // overlap check). The previous (non-ODRZUCONO) claim on this vehicle
    // blocks new submits for `cooldownDays * 24h` after its `createdAt`.
    // ODRZUCONO claims are explicitly excluded by the repository query so
    // a rejected carrier can resubmit a corrected wniosek immediately.
    const lastClaim = await this.claims.findLastNonRejectedForVehicle(
      vehicleId,
    );
    const cooldown = cooldownCheck({
      now: new Date(),
      lastCreatedAt: lastClaim?.createdAt ?? null,
      cooldownDays: config.vehicleCooldownDays,
    });
    if (!cooldown.ok) {
      throw vehicleCooldownException(cooldown.message, cooldown.nextAllowedAt);
    }

    // ── Tier 2: km-calc dependent rules ───────────────────────
    // Same engine as `previewKmCalc` so live preview and submit produce
    // identical numbers. timeFrom/timeTo are NOT NULL since phase3_blocks.
    // `hoursAdjusted` is verifier-only — carriers never send it; submit
    // always feeds 0 into km-calc and persists 0 on both Decimal columns.
    const calc = await this.kmCalc.calc({
      dateStart: dateStartIso,
      dateEnd: dateEndIso,
      timeFrom: dto.timeFrom,
      timeTo: dto.timeTo,
      hoursAdjusted: 0,
    });

    const tier2: string[] = [];

    // Duration gate — `calc.totalDays` (post-adjustment working days from
    // km-calc) must be greater than or equal to the configured threshold
    // (default 10 → 10.00 passes, 9.99 does not — boundary inclusive). Lives
    // in `@magguarantee/shared` so the web form's live preview and the api
    // evaluate the same predicate with the same Polish message.
    const duration = canSubmitByDuration({
      totalDays: calc.totalDays,
      workedDaysThreshold: config.workedDaysThreshold,
    });
    if (!duration.ok) {
      tier2.push(duration.message);
    }

    if (calc.kmGuaranteed === 0) {
      tier2.push('Brak limitu km gwarantowanych w tym okresie.');
    }
    // Sanity: average km/day. Trucks legitimately do up to ~1500 km/day in
    // 2-driver continuous operation; anything past that is almost always a
    // typo or odometer reset. Cap configurable via `max_avg_km_per_day`.
    if (calc.totalDays > 0) {
      const avgKmPerDay = mileage / calc.totalDays;
      if (avgKmPerDay > config.maxAvgKmPerDay) {
        tier2.push(
          `Średni przebieg dzienny (${Math.round(avgKmPerDay)} km/dzień) ` +
            `przekracza dopuszczalny maksimum (${config.maxAvgKmPerDay} km/dzień). ` +
            `Sprawdź wartość przebiegu.`,
        );
      }
    }

    const kmDifference = calc.kmGuaranteed - mileage;
    const paymentEur =
      kmDifference > 0
        ? round2(kmDifference * calc.ratePerKmEffective)
        : 0;
    if (paymentEur === 0 && tier2.length === 0) {
      // Only surface "no underrun" if everything else is sane — otherwise
      // the user fixes the upstream issue first and this often resolves.
      tier2.push(
        `Km zrealizowane (${mileage}) są równe lub wyższe niż km ` +
          `gwarantowane (${calc.kmGuaranteed}). Brak podstaw do dopłaty.`,
      );
    }

    if (tier2.length > 0) throw violationsException(tier2);

    // NrZgl + insert atomically (same Prisma transaction).
    // `rawTotalDays` is the pre-`hoursAdjusted` total — persisted alongside
    // `totalDays` so the carrier/verifier UI can render `<HoursReadout>` with
    // both raw and adjusted hours per docs/14-design-system.md §"Phase 3.1".
    const breakdown: KmCalcBreakdown = {
      totalDays: calc.totalDays,
      rawTotalDays: calc.rawTotalDays,
      kmGuaranteed: calc.kmGuaranteed,
      ratePerKmEffective: calc.ratePerKmEffective,
      breakdown: calc.breakdown,
    };

    // `dateStart` / `dateEnd` were already parsed to UTC midnight at the top
    // of submit() for the violation checks; reuse them for the insert.
    // `kmPerDay` (NOT NULL post-phase3_blocks) is the trip-average km/day.
    // Degenerate input (`drivenDays === 0`) collapses to 0 — defensive; the
    // upstream `canSubmitByDuration` gate plus the `kmGuaranteed === 0`
    // tier-2 violation block the realistic case where it would matter.
    const kmPerDay =
      calc.totalDays > 0 ? round2(mileage / calc.totalDays) : 0;
    const now = new Date();

    // The `nrZgl` counter bump and the claim insert MUST commit atomically so
    // a duplicate insert never burns a sequence number. We open an explicit
    // `prisma.$transaction` here rather than relying on the `@Audit` interceptor
    // to provide an ambient one — transactional control is explicit and local
    // to this flow (`POST /claims` is marked `manualTransaction: true`, so the
    // interceptor does NOT wrap the handler). The audit row is written by the
    // interceptor standalone after success. If the insert hits a P2002 the
    // whole transaction rolls back — counter increment included — so no number
    // is burned.
    let row: ClaimRow;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const txLike = tx as unknown as TransactionLike;
        const nrZgl = await this.nrZgl.nextWithin(txLike, now);
        return this.claims.createWithin(txLike, {
          nrZgl,
          carrierId: carrier.id,
          // Vehicle + plate snapshot DERIVED from the outing (Phase 7 §0″).
          vehicleId,
          vehiclePlateSnapshot,
          dateStart,
          dateEnd,
          // Required post-phase3_blocks (NOT NULL).
          timeFrom: dto.timeFrom,
          timeTo: dto.timeTo,
          drivenDays: calc.totalDays,
          mileage,
          // `kmPerDay` is NOT NULL post-phase3_blocks — calculated above.
          kmPerDay,
          kmGuaranteed: calc.kmGuaranteed,
          kmDifference,
          paymentEur,
          ratePerKmEffective: calc.ratePerKmEffective,
          breakdown,
          status: 'NA_WERYFIKACJI',
          statusChangedAt: now,
          comment: dto.comment ?? null,
          // Per Revert #1: `orderNumber` / `orderDate` are MAGTRANS-internal,
          // assigned only on the verifier's transition to ZAAKCEPTOWANO. The
          // carrier-side submit always persists NULL; the
          // `claim_accepted_payment_complete` CHECK constraint enforces the
          // invariant when status flips.
          orderNumber: null,
          orderDate: null,
          // amountRequested derived from km-calc payment, not user input —
          // legacy GAS allowed manual override, we don't. `paymentEur` is
          // already `round2(...)` 2-dp rounded (or 0) so it fits Decimal(12,2)
          // cleanly without further coercion.
          amountRequested: paymentEur,
          // Hours-adjustment is verifier-only: carriers cannot send it on
          // submit, so both Decimal columns are seeded to 0. The verifier
          // PATCH path may later mutate `hoursAdjustedValue` alone — see
          // `_buildUpdatePatch` / `extractCorrectionFields`. `origHoursAdjusted`
          // is the immutable carrier snapshot (set-once at submit, 0 forever).
          origHoursAdjusted: 0,
          hoursAdjustedValue: 0,
          // Preserve the carrier's original (pre-verification) inputs, so
          // the verifier can later see what the carrier actually submitted.
          // Mirror of GAS columns AR-AV (`Code.gs:6272-6276`).
          origDateStart: dateStart,
          origDateEnd: dateEnd,
          origMileage: mileage,
          // Immutable time-window snapshot — same values that go into the
          // working `timeFrom/timeTo` columns above (`dto.timeFrom/timeTo`).
          // Write-once at submit; the verifier PATCH never overwrites these.
          origTimeFrom: dto.timeFrom,
          origTimeTo: dto.timeTo,
          // Phase 7 REWORK (2026-06-20 #4) — link the wniosek to the outing.
          // The `@unique` FK guarantees one claim per outing; a second submit
          // for the same outing hits P2002 → translated to a 409 below.
          delegationId: dto.delegationId,
        });
      });
    } catch (err) {
      // P2002 is a unique-constraint violation. Two distinct constraints can
      // fire here: `nrZgl` (theoretically impossible — the counter is per-tx)
      // and `delegationId` (a second wniosek on the same outing). Disambiguate
      // on the target field so the carrier gets the right message.
      if ((err as { code?: string }).code === 'P2002') {
        const target = (err as { meta?: { target?: unknown } }).meta?.target;
        const onDelegation =
          (Array.isArray(target) &&
            target.some((t) => String(t).includes('delegation'))) ||
          (typeof target === 'string' && target.includes('delegation'));
        if (onDelegation) {
          throw new ConflictException(
            'Na ten wyjazd już złożono wniosek.',
          );
        }
        throw new ConflictException('Wniosek o tym numerze już istnieje');
      }
      throw err;
    }

    // Email notifications (fire-and-log; never block on send failure).
    void this._notifySubmit(row).catch((err) => {
      this.logger.error({
        msg: 'claims.submit.notify_failed',
        nrZgl: row.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return this.toDto(row);
  }

  // ── Auto-recalc from delegation (Phase 7 REWORK 2026-06-20 #4) ──

  /**
   * Re-computes the linked wniosek when a delegation transitions to `zjechal`
   * with a (possibly later) `actualReturnAt`. Called from
   * `DelegationsService.markReturned()` INSIDE the `@Audit`-opened ambient
   * transaction, so every read/write here (`prisma.tx`-routed) commits
   * atomically with the outing status + `Vehicle.lastDroveAt` bump.
   *
   * Hard gate — applies ONLY when:
   *   - a claim is linked to the outing (else no-op), AND
   *   - `claim.status === NA_WERYFIKACJI` (the only mutable verification window —
   *     `OCZEKUJE_NA_AUTORYZACJE` is FROZEN: pracownik already sent a concrete
   *     amount to Maksim for authorization, so the number must not shift under
   *     authorization; decided statuses are likewise immutable), AND
   *   - `claim.periodAdjustedByVerifier === false` (a human-corrected period is
   *     never silently overwritten).
   *
   * When applied: `dateEnd = actualReturnAt` → re-prefill `mileage` via the SAME
   * `_resolveMileage` (only when the carrier didn't override at submit, detected
   * via `origMileage`) → re-run km-calc via the SAME `KmCalcService` → update
   * `kmGuaranteed/kmDifference/paymentEur/amountRequested/breakdown/
   * ratePerKmEffective/drivenDays/kmPerDay`. `timeFrom/timeTo` and the `orig*`
   * snapshots are NOT touched. Audit: `claim.autoRecalc` (before/after). No email.
   *
   * When NOT applied (decided OR human-adjusted): the period is left untouched
   * and an audit-only `claim.autoRecalcSkipped` row is written. No email.
   *
   * The `_tx` param is accepted for call-site clarity (the spec's
   * `recalcFromDelegation(delegationId, actualReturnAt, tx)` contract); routing
   * is via the ambient `prisma.tx`, so it is intentionally unused.
   */
  async recalcFromDelegation(
    delegationId: string,
    actualReturnAt: Date,
    _tx?: unknown,
  ): Promise<void> {
    const claim = await this.claims.findByDelegationId(delegationId);
    if (!claim) return; // no linked wniosek → nothing to recalc

    const recalcable =
      claim.status === 'NA_WERYFIKACJI' &&
      claim.periodAdjustedByVerifier === false;

    if (!recalcable) {
      // Decided OR human-adjusted period → leave the wniosek's numbers alone.
      // `autoRecalcState` is only set to `skipped` when there is a REAL period
      // divergence (the wniosek's `dateEnd` differs from the outing's actual
      // return date). Without a divergence the recalc would have been a no-op
      // anyway, so we leave `autoRecalcState` at its current value (`none`) to
      // avoid a false «skipped» badge on the frontend (REWORK 2026-06-20 #4).
      const hasDivergence = !sameUtcDay(claim.dateEnd, actualReturnAt);
      if (hasDivergence) {
        await this.claims.update(claim.id, { autoRecalcState: 'skipped' });
      }
      // Audit row is written regardless (the recalc trigger fired); the
      // `before`/`after` snapshot reflects whether the state column moved.
      await this.auditWriter.log({
        action: 'claim.autoRecalcSkipped',
        targetType: 'Claim',
        targetKey: claim.nrZgl,
        actor: AuditContext.current()?.actor ?? 'system',
        before: {
          reason: this._skipReason(claim),
          status: claim.status,
          hasDivergence,
        },
        after: hasDivergence ? { autoRecalcState: 'skipped' } : null,
      });
      return;
    }

    await this._applyDelegationRecalc(claim, actualReturnAt);
  }

  /** Human-readable skip reason for the `autoRecalcSkipped` audit row. */
  private _skipReason(claim: ClaimRow): string {
    if (claim.periodAdjustedByVerifier) return 'period_adjusted_by_verifier';
    // FROZEN under authorization: pracownik already sent a concrete amount to
    // Maksim, so the number must not shift while it is being authorized.
    if (claim.status === 'OCZEKUJE_NA_AUTORYZACJE') return 'sent_for_authorization';
    return 'claim_already_decided';
  }

  /**
   * Applies the delegation-driven recalc to a recalc-eligible claim. Re-prefills
   * mileage (only when the carrier didn't override at submit), re-runs km-calc
   * with the SAME engine, persists the new numbers, and writes a
   * `claim.autoRecalc` before/after audit row. No email. Private — the gate
   * lives in the public `recalcFromDelegation`.
   */
  private async _applyDelegationRecalc(
    claim: ClaimRow,
    actualReturnAt: Date,
  ): Promise<void> {
    const before = this._snapshotForAudit(claim);

    const dateStart = startOfUtcDay(claim.dateStart);
    const dateEnd = startOfUtcDay(actualReturnAt);

    // Re-prefill mileage via the SAME `_resolveMileage` (the daily-km sum over
    // the NEW period) UNLESS a human has since changed it. The carrier no longer
    // overrides at submit (mileage is always the daily-km sum), so the only way
    // `mileage` can diverge from the immutable `origMileage` snapshot is a
    // VERIFIER edit — and a human-corrected mileage must not be silently
    // re-prefilled. `origMileage === mileage` ⇒ untouched ⇒ safe to re-prefill.
    const mileageWasHumanEdited =
      claim.origMileage !== null && claim.origMileage !== claim.mileage;
    const mileage =
      mileageWasHumanEdited || claim.vehicleId === null
        ? claim.mileage
        : await this._resolveMileage(claim.vehicleId, dateStart, dateEnd);

    // Re-run km-calc via the SAME `KmCalcService` (preview == submit == recalc).
    const calc = await this.kmCalc.calc({
      dateStart: toIsoDateOnly(dateStart),
      dateEnd: toIsoDateOnly(dateEnd),
      timeFrom: claim.timeFrom,
      timeTo: claim.timeTo,
      // `hoursAdjustedValue` drives km-calc; preserve the currently-applied one.
      hoursAdjusted: claim.hoursAdjustedValue ?? 0,
    });

    const kmDifference = calc.kmGuaranteed - mileage;
    const paymentEur =
      kmDifference > 0 ? round2(kmDifference * calc.ratePerKmEffective) : 0;
    const kmPerDay =
      calc.totalDays > 0 ? round2(mileage / calc.totalDays) : 0;
    const breakdown: KmCalcBreakdown = {
      totalDays: calc.totalDays,
      rawTotalDays: calc.rawTotalDays,
      kmGuaranteed: calc.kmGuaranteed,
      ratePerKmEffective: calc.ratePerKmEffective,
      breakdown: calc.breakdown,
    };

    const updated = await this.claims.update(claim.id, {
      // dateStart is unchanged (departure day); only dateEnd shifts.
      dateEnd,
      mileage,
      drivenDays: calc.totalDays,
      kmPerDay,
      kmGuaranteed: calc.kmGuaranteed,
      kmDifference,
      paymentEur,
      ratePerKmEffective: calc.ratePerKmEffective,
      // amountRequested mirrors paymentEur (same derivation as submit).
      amountRequested: paymentEur,
      breakdown,
      // Stamp the explicit result so the frontend reads «przeliczono» directly.
      autoRecalcState: 'applied',
      // `timeFrom/timeTo` and the `orig*` snapshots are intentionally NOT touched.
    });

    await this.auditWriter.log({
      action: 'claim.autoRecalc',
      targetType: 'Claim',
      targetKey: claim.nrZgl,
      actor: AuditContext.current()?.actor ?? 'system',
      before,
      after: this._snapshotForAudit(updated),
    });
  }

  // ── Update / verify (Phase 4) ──────────────────────────

  /**
   * `PATCH /claims/:nrZgl` — verifier's decision endpoint.
   *
   * Per docs/13-api-design.md#claims (`PATCH /claims/:nrZgl` row) and the
   * `updateClaimFull` reference in `Code.gs:5183-5645`. Wired only for
   * `admin` / `pracownik` at the controller; service-side ownership scoping
   * is a defence-in-depth no-op for those roles.
   *
   * The 462-line GAS handler is split into 5 helpers per docs/17-migration-roadmap.md:234-239
   * — see `_validateClaimUpdate`, `_recalcClaim`, `_persistClaimUpdate`,
   * `_handleReklamacjaTransition`, `_applyDecisionEmails` below.
   *
   * The mutation + audit row commit atomically inside one
   * `prisma.$transaction(...)`; email notifications are dispatched OUTSIDE
   * the transaction (fire-and-log, like submit / reklamacja).
   */
  async update(
    user: AuthUser,
    nrZgl: string,
    dto: UpdateClaimDto,
    _ipAddress?: string,
  ): Promise<ClaimDto> {
    // Pre-Phase-4.4: PATCH /claims/:nrZgl carries `@Audit('updateClaim')`,
    // so the `AuditInterceptor` already opened a `prisma.$transaction` and
    // we're running inside an `AuditContext`. The audit-row write happens
    // automatically on commit — we no longer need to thread `tx` into the
    // `AuditWriter.log(...)` call, nor open a service-side `$transaction`.
    //
    // Both the row update (`updateWithin` via the ambient tx) and the
    // interceptor's audit-row insert commit atomically; if either throws
    // the whole transaction rolls back.
    //
    // The `before` snapshot is stashed into the ambient `AuditContext` so
    // the interceptor's writer picks it up — no manual log() call here.
    const existing = await this._validateClaimUpdate(nrZgl, dto);
    const recalc = await this._recalcClaim(existing, dto);
    // Authoritative accept-guard (Fix 3): a claim may only be ACCEPTED when the
    // (re)calculated km-difference shows an under-run, i.e. compensation is
    // actually due. This is the server-side mirror of the carrier-UI gate so a
    // forged/stale PATCH can't move a "guarantee met" claim into a paid state.
    this._assertCompensationDueForAccept(existing, dto, recalc);
    const patch = this._buildUpdatePatch(existing, dto, recalc, user);
    const reklamacjaSnapshot = this._handleReklamacjaTransition(existing, dto);
    const data: UpdateClaimData = { ...patch, ...reklamacjaSnapshot };

    AuditContext.setBefore(this._snapshotForAudit(existing));

    const txLike = this.prisma.tx as unknown as TransactionLike;
    const updated = await this.claims.updateWithin(txLike, existing.id, data);

    // Email notifications — outside the transaction. Mirrors submit/reklamacja.
    void this._applyDecisionEmails(updated).catch((err) => {
      this.logger.error({
        msg: 'claims.update.notify_failed',
        nrZgl: updated.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return this.toDto(updated);
  }

  // ── Request authorization (Phase 4.2) ───────────────────

  /**
   * `POST /claims/:nrZgl/request-authorization` — Phase 4.2.
   *
   * Admin / pracownik flags a verified claim as requiring Maksim's sign-off
   * before being moved to ZAAKCEPTOWANO. Steps:
   *
   *   1. Load the claim (404 if missing).
   *   2. Assert the transition is legal via the state machine (422 otherwise).
   *      The legal predecessor today is `NA_WERYFIKACJI` — the matrix in
   *      `claim-state-machine.ts` is the single source of truth and may grow
   *      additional inbound edges later (e.g. `REKLAMACJA → OCZEKUJE_*`).
   *   3. Mint a fresh `authorizationToken` (UUID v4) — used by Maksim's
   *      future approve-link click-through. Token is per-request; if the
   *      verifier re-requests authorization on a claim that already had one,
   *      we mint a new token and the old one stops being valid.
   *   4. Update the claim atomically inside the ambient `AuditContext` tx:
   *        - status            = OCZEKUJE_NA_AUTORYZACJE
   *        - authorizationToken= <new uuid>
   *        - authorizationRequired = true
   *        - authorizationDescription = comment (required, non-empty)
   *        - statusChangedAt   = now
   *        - decidedById       = caller (so the audit trail knows who flagged)
   *      `amountMaximum` is DELIBERATELY NOT touched here — the request carries
   *      no amount (Maksim hasn't replied yet). It stays whatever it was
   *      (normally null) and is recorded LATER via `setAuthorizationAmount`
   *      (`PUT /claims/:nrZgl/authorization-amount`) once Maksim's reply lands.
   *      A `before` snapshot is pushed into the ambient context for the
   *      `AuditInterceptor` to commit alongside the row.
   *   5. Fire the Maksim email outside the transaction (fire-and-log; never
   *      block the response on SMTP). Same notification policy as submit /
   *      reklamacja / verification — a 500 from Mailhog must not roll back
   *      the state transition.
   */
  async requestAuthorization(
    user: AuthUser,
    nrZgl: string,
    dto: RequestAuthorizationDto,
  ): Promise<ClaimDto> {
    const existing = await this.claims.findByNrZgl(nrZgl);
    if (!existing) {
      throw new NotFoundException('Wniosek nie znaleziony');
    }

    // State-machine validation — single source of truth. Throws 422 with the
    // friendly Polish message on any illegal transition (e.g. when the claim
    // is already pending authorization, or has been decided).
    assertLegalTransition(existing.status, 'OCZEKUJE_NA_AUTORYZACJE');

    const now = new Date();
    const token = randomUUID();
    // `comment` is REQUIRED at the schema level (RequestAuthorizationSchema),
    // so the DTO always carries a trimmed non-empty string here.
    const description = dto.comment;

    const patch: UpdateClaimData = {
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      statusChangedAt: now,
      decidedById: user.sub,
      authorizationRequired: true,
      authorizationDescription: description,
      authorizationToken: token,
      // `amountMaximum` is intentionally OMITTED — the request carries no
      // amount (Maksim hasn't decided yet). Recorded later via
      // `setAuthorizationAmount` once his reply lands.
    };

    AuditContext.setBefore(this._snapshotForAudit(existing));

    // Run on the ambient tx (opened by the `AuditInterceptor` via the
    // `@Audit('claim.requestAuthorization')` on the controller). Both the
    // claim update + audit-row insert commit atomically; if either throws,
    // the whole thing rolls back and no email is sent (see post-update void).
    const txLike = this.prisma.tx as unknown as TransactionLike;
    const updated = await this.claims.updateWithin(txLike, existing.id, patch);

    // Email dispatch — outside the transaction. Mirrors submit / reklamacja.
    void this._dispatchAuthorizationEmail(updated, dto).catch((err) => {
      this.logger.error({
        msg: 'claims.requestAuthorization.notify_failed',
        nrZgl: updated.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return this.toDto(updated);
  }

  /**
   * `PUT /claims/:nrZgl/authorization-amount` — Phase 4.2 (kwota-Maksima
   * follow-up). Records the amount Maksim assigned in his EMAIL REPLY, once
   * `request-authorization` has already put the claim into
   * `OCZEKUJE_NA_AUTORYZACJE`. Steps:
   *
   *   1. Load the claim (404 if missing).
   *   2. Require `status === OCZEKUJE_NA_AUTORYZACJE` (422 otherwise) — the
   *      amount only makes sense while the claim is pending Maksim's sign-off.
   *   3. Patch `amountMaximum = kwotaMaksima` atomically inside the ambient
   *      `AuditContext` tx (mirrors `requestAuthorization`'s `setBefore` +
   *      `updateWithin` shape). No status change, no token, NO email.
   *
   * Idempotent by design: it may be called again to CORRECT the value (Maksim
   * revised his reply) — each call overwrites `amountMaximum` and writes a
   * fresh before/after audit diff.
   */
  async setAuthorizationAmount(
    user: AuthUser,
    nrZgl: string,
    dto: SetAuthorizationAmountDto,
  ): Promise<ClaimDto> {
    const existing = await this.claims.findByNrZgl(nrZgl);
    if (!existing) {
      throw new NotFoundException('Wniosek nie znaleziony');
    }

    // Guard, not a state transition: the amount is only recordable while the
    // claim is pending authorization. Any other status is a 422 with a
    // friendly Polish message (mirrors the state-machine error shape).
    if (existing.status !== 'OCZEKUJE_NA_AUTORYZACJE') {
      throw new UnprocessableEntityException(
        'Kwotę Maksima można zapisać tylko dla wniosku oczekującego na autoryzację.',
      );
    }

    const patch: UpdateClaimData = {
      amountMaximum: dto.kwotaMaksima,
    };

    AuditContext.setBefore(this._snapshotForAudit(existing));

    // Run on the ambient tx (opened by the `AuditInterceptor` via
    // `@Audit('claim.setAuthorizationAmount')` on the controller). The row
    // update + audit-row insert commit atomically.
    const txLike = this.prisma.tx as unknown as TransactionLike;
    const updated = await this.claims.updateWithin(txLike, existing.id, patch);

    return this.toDto(updated);
  }

  /**
   * Builds the props for the React-Email template and ships it via the
   * MailService. Pulls the carrier display name from the underlying User row,
   * formats EUR amounts to two decimals, and constructs the deeplink against
   * `APP_URL` (the env value that points at the web front-end).
   *
   * The MAGTRANS recipient (`MAKSIM_EMAIL`) is read from validated env — default
   * is the production director address; dev/staging override it so test clicks
   * don't email the real director. Phase 9 may move it to AppConfig.
   */
  private async _dispatchAuthorizationEmail(
    row: ClaimRow,
    dto: RequestAuthorizationDto,
  ): Promise<void> {
    if (!this.mailService) {
      // Construction without a MailService instance is only valid in unit
      // tests; production wiring always injects one. Log + return so callers
      // see the gap without crashing.
      this.logger.warn({
        msg: 'claims.requestAuthorization.no_mail_service',
        nrZgl: row.nrZgl,
      });
      return;
    }
    const appUrl =
      this.configService?.get('APP_URL', { infer: true }) ??
      'http://localhost:3000';
    // configService is optional in unit-test construction — keep the default
    // fallback (same as the validated env default) so tests without a stub
    // still resolve a valid recipient.
    const maksimEmail =
      this.configService?.get('MAKSIM_EMAIL', { infer: true }) ??
      'maksim.siankevich@magtrans.eu';
    const carrierName = await this._resolveCarrierDisplayName(row.carrierId);
    const periodFrom = row.dateStart.toISOString().slice(0, 10);
    const periodTo = row.dateEnd.toISOString().slice(0, 10);
    const doplata = row.amountRequested.toFixed(2);
    // SOFT authorization-threshold hint (`Code.gs:5967`) — informational
    // context in the email only, never enforced on accept. Pre-formatted like
    // the sibling amounts so the template stays pure.
    const prog = getAuthThreshold(row.drivenDays).toFixed(2);
    const dniWTrasie = row.drivenDays.toFixed(2);
    const deeplink = `${appUrl.replace(/\/$/, '')}/employee/claims/${encodeURIComponent(row.nrZgl)}`;

    // No `kwotaMaksima` — the request email no longer carries an amount
    // (Maksim decides it in his reply). Matches legacy `Code.gs:6010
    // sendAuthorizationRequest`, which also sent no amount in the request.
    await this.mailService.enqueueAuthorizationRequest(maksimEmail, {
      nrZgl: row.nrZgl,
      carrierName,
      vehiclePlate: row.vehiclePlateSnapshot,
      periodFrom,
      periodTo,
      doplata,
      prog,
      dniWTrasie,
      comment: dto.comment,
      deeplink,
    });
  }

  /**
   * Resolves the carrier's display name (user.name with login fallback) for
   * the authorization-request email. Falls back to the carrier ID slice if
   * the FK chain is broken — defensive only; should never happen in practice.
   */
  private async _resolveCarrierDisplayName(carrierId: string): Promise<string> {
    // Root client, not the ambient tx — see `_collectClaimRecipients`: this is
    // called from fire-and-forget notification paths after the tx committed.
    const row = await this.prisma.client.carrier.findFirst({
      where: { id: carrierId },
      select: { user: { select: { login: true, name: true } } },
    });
    if (!row?.user) return carrierId.slice(0, 8);
    return row.user.name && row.user.name.trim().length > 0
      ? row.user.name
      : row.user.login;
  }

  // ── Preview ─────────────────────────────────────────────

  async previewKmCalc(
    user: AuthUser,
    dto: PreviewClaimDto,
  ): Promise<PreviewClaimResponse> {
    // carrier-only path, see @Roles on POST /claims/preview
    const carrier = await this._requireCarrierProfile(user);

    // Phase 7 §0″ finish — when the carrier has picked an outing the PERIOD,
    // VEHICLE, TRAILER, DRIVER, MILEAGE (and the `w_trasie` soft warning) are all
    // DERIVED from it, mirroring what submit() will compute; the body carries no
    // vehicle/mileage. When `delegationId` is absent (the existing-claim /
    // verifier inspection path reaching this method directly), we fall back to a
    // caller-supplied `vehicleId` + dates — ownership re-checked defence-in-depth.
    if (dto.delegationId) {
      const ctx = await this._resolveDelegationContext(
        carrier.id,
        dto.delegationId,
      );
      return this._runPreviewCalc(dto, ctx);
    }

    if (!dto.vehicleId) {
      throw new UnprocessableEntityException(
        'Wybór wyjazdu jest wymagany do podglądu wniosku.',
      );
    }
    // Ensure the carrier owns the vehicle they're previewing for — defence
    // in depth even with `CarrierOwnershipGuard` at the controller.
    await this._requireOwnedVehicle(carrier.id, dto.vehicleId);
    return this._runPreviewCalc(dto, null);
  }

  /**
   * Variant called by `POST /claims/:nrZgl/preview`. Resolves the existing
   * Claim first (to enforce ownership at the row level) and then runs the
   * same math as `previewKmCalc`. Used during reklamacja edits where the
   * carrier wants to see how a tweaked input would have changed the numbers,
   * and by verifier roles (admin / pracownik) inspecting a claim per
   * docs/13-api-design.md (`POST /claims/:nrZgl/preview` row).
   */
  async previewForExisting(
    user: AuthUser,
    nrZgl: string,
    dto: PreviewClaimDto,
  ): Promise<PreviewClaimResponse> {
    const claim = await this.claims.findByNrZgl(nrZgl);
    if (!claim) throw new NotFoundException('Wniosek nie znaleziony');
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (claim.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tego wniosku');
      }
    }
    // We deliberately don't re-check vehicle ownership here: for przewoznik,
    // claim ownership already implies vehicle access (FK chain Claim →
    // Vehicle → Carrier); for admin / pracownik, vehicle ownership is
    // irrelevant. The DTO's `vehicleId` is consumed only as km-calc input.
    //
    // Mileage-override gate: only VERIFIER roles (anything but `przewoznik`,
    // i.e. `pracownik`/`admin` — the roles wired at the controller for this
    // route) may replace the daily-km sum with `dto.mileage` so the ClaimModal's
    // live dopłata tracks a km edit. The carrier reklamacja-inspection path
    // (`przewoznik`) keeps the sum — the "no carrier override" invariant from
    // Phase 7 §0″ stands. `ctx` is null here (existing-claim path), so the flag
    // is actually consulted; the carrier new-claim `previewKmCalc` path never
    // sets it.
    const allowMileageOverride = user.role !== 'przewoznik';
    return this._runPreviewCalc(dto, null, allowMileageOverride);
  }

  /**
   * Pure math entry point for both preview routes. No role checks, no
   * ownership checks — callers are responsible for gating access before
   * invoking this helper. Mirrors the calc + envelope built historically
   * inside `previewKmCalc` so behaviour is byte-identical for the carrier.
   *
   * `ctx` (the delegation-derived context) drives the carrier new-claim path:
   * the period, the vehicle backing the mileage sum, and the read-only
   * vehicle/trailer/driver `delegationContext` all come from the outing. When
   * `ctx` is null, the legacy date-driven path runs off the body's
   * `dateStart`/`dateEnd` (+ optional `vehicleId` for the mileage sum).
   *
   * `allowMileageOverride` — VERIFIER inspection-path flag. Only honoured on the
   * existing-claim path (`ctx === null`): when a verifier (`pracownik`/`admin`)
   * supplies `dto.mileage`, it replaces the daily-km sum so the ClaimModal's
   * live dopłata / RecalcBadge / accept-gate track the km edit before the PATCH
   * commits (matching what `_recalcClaim` → `_buildUpdatePatch` will persist).
   * On the delegation-derived path (`ctx != null`) the override is ALWAYS
   * ignored — the "no carrier override" invariant from Phase 7 §0″ stands, and
   * the carrier reklamacja inspection passes `allowMileageOverride = false`.
   */
  private async _runPreviewCalc(
    dto: PreviewClaimDto,
    ctx: {
      delegation: DelegationRow;
      dateStart: Date;
      dateEnd: Date;
      warning: DelegationWarning | null;
    } | null = null,
    allowMileageOverride = false,
  ): Promise<PreviewClaimResponse> {
    // Resolve the effective period: derived from the outing when supplied,
    // otherwise the caller-supplied `dateStart`/`dateEnd` (existing-claim path).
    const dateStart = ctx ? ctx.dateStart : isoDateToMidnightUtc(dto.dateStart ?? '');
    const dateEnd = ctx ? ctx.dateEnd : isoDateToMidnightUtc(dto.dateEnd ?? '');
    const dateStartIso = dateStart ? toIsoDateOnly(dateStart) : (dto.dateStart ?? '');
    const dateEndIso = dateEnd ? toIsoDateOnly(dateEnd) : (dto.dateEnd ?? '');

    const calc = await this.kmCalc.calc({
      dateStart: dateStartIso,
      dateEnd: dateEndIso,
      // PreviewClaimSchema keeps timeFrom / timeTo optional — the engine
      // tolerates `null` for the live-preview shortcut where the carrier
      // hasn't yet typed the times.
      timeFrom: dto.timeFrom ?? null,
      timeTo: dto.timeTo ?? null,
      hoursAdjusted: dto.hoursAdjusted ?? 0,
    });

    // Mileage resolution, two paths:
    //  • Delegation-derived (new-claim) path OR carrier reklamacja inspection:
    //    ALWAYS `Σ VehicleDailyKm.km (state=drove)` over the period for the
    //    relevant vehicle (Phase 7 §0″ finish — no carrier override). The
    //    vehicle comes from the outing on the new-claim path, or from the
    //    caller-supplied `vehicleId` on the existing-claim path. With no vehicle
    //    and no valid period, mileage is 0 (the carrier hasn't picked an outing).
    //  • VERIFIER inspection path (existing claim, `ctx === null`,
    //    `allowMileageOverride`): a verifier-supplied `dto.mileage` REPLACES the
    //    sum, so the live preview tracks a km edit before the PATCH commits —
    //    mirroring `_recalcClaim` (which honours `dto.mileage` on PATCH). The
    //    override is confined to `ctx === null` so the delegation-derived path
    //    (and any carrier) never leaks a manual mileage into the math.
    const vehicleId = ctx ? ctx.delegation.vehicleId : dto.vehicleId;
    const canOverride = !ctx && allowMileageOverride && dto.mileage !== undefined;
    const mileage = canOverride
      ? (dto.mileage as number)
      : dateStart && dateEnd && vehicleId
        ? await this._resolveMileage(vehicleId, dateStart, dateEnd)
        : 0;

    const kmDifference = calc.kmGuaranteed - mileage;
    const paymentEur =
      kmDifference > 0
        ? round2(kmDifference * calc.ratePerKmEffective)
        : 0;

    return {
      mileage,
      kmGuaranteed: calc.kmGuaranteed,
      kmDifference,
      paymentEur,
      ratePerKmEffective: calc.ratePerKmEffective,
      breakdown: {
        totalDays: calc.totalDays,
        // Pre-`hoursAdjusted` raw total — surfaced so the live-preview UI
        // can render `<HoursReadout>` with both raw and adjusted values
        // (docs/14-design-system.md §"Phase 3.1").
        rawTotalDays: calc.rawTotalDays,
        kmGuaranteed: calc.kmGuaranteed,
        ratePerKmEffective: calc.ratePerKmEffective,
        breakdown: calc.breakdown,
      },
      // Surfaced only on the delegation-derived path so the carrier form can
      // show the read-only period + vehicle/trailer/driver + the `w_trasie`
      // soft-warning banner.
      ...(ctx
        ? {
            dateStart: dateStartIso,
            dateEnd: dateEndIso,
            delegationContext: this._buildDelegationContext(ctx.delegation),
            ...(ctx.warning ? { delegationWarning: ctx.warning } : {}),
          }
        : {}),
    };
  }

  /**
   * Builds the read-only vehicle/trailer/driver context block for the preview
   * response from the chosen outing (Phase 7 §0″ finish). Plate/driver-name are
   * the delegation's eager relations + snapshots; the web form renders these
   * fields read-only so the carrier sees exactly what the submit will persist /
   * link. Pure projection — no IO.
   */
  private _buildDelegationContext(deleg: DelegationRow): {
    vehicleId: string;
    vehiclePlate: string;
    trailerId: string;
    trailerPlate: string | null;
    driverId: string;
    driverName: string | null;
  } {
    return {
      vehicleId: deleg.vehicleId,
      vehiclePlate: deleg.vehicle?.plateNumber ?? '',
      trailerId: deleg.trailerId,
      trailerPlate: deleg.trailer?.plateNumber ?? null,
      driverId: deleg.driverId,
      driverName: this._resolveDriverNameSnapshot(deleg),
    };
  }

  // ── Reklamacja ──────────────────────────────────────────

  async submitReklamacja(
    user: AuthUser,
    nrZgl: string,
    dto: SubmitReklamacjaDto,
  ): Promise<ClaimDto> {
    // carrier-only path, see @Roles on POST /claims/:nrZgl/reklamacja
    const carrier = await this._requireCarrierProfile(user);
    const claim = await this.claims.findByNrZgl(nrZgl);
    if (!claim) throw new NotFoundException('Wniosek nie znaleziony');
    if (claim.carrierId !== carrier.id) {
      throw new ForbiddenException('Brak uprawnień do tego wniosku');
    }

    // Idempotency — re-submitting yields a clean error rather than a 500.
    // Mirrors `Code.gs:6814-6817`.
    if (claim.reklamacjaSubmitted) {
      throw new ConflictException(
        'Reklamacja została już złożona dla tego wniosku.',
      );
    }

    // Status gate: only decided claims (ZAAKCEPTOWANO / ODRZUCONO) can be
    // disputed. `Code.gs:6829` reads the current row status; we enforce
    // explicitly here for clarity.
    if (
      claim.status !== 'ZAAKCEPTOWANO' &&
      claim.status !== 'ODRZUCONO'
    ) {
      throw new UnprocessableEntityException(
        'Reklamację można złożyć tylko dla wniosku zaakceptowanego lub odrzuconego.',
      );
    }

    // 48h window from `statusChangedAt`. Mirrors `Code.gs:6836-6845`.
    if (claim.statusChangedAt) {
      const hoursPassed =
        (Date.now() - claim.statusChangedAt.getTime()) / 3_600_000;
      if (hoursPassed > 48) {
        throw new UnprocessableEntityException(
          'Czas na złożenie reklamacji minął. Reklamację można złożyć ' +
            'maksymalnie 48 godzin od rozpatrzenia wniosku.',
        );
      }
    }

    // Amount cap: `kwotaReklamacji ≤ kwotaWnioskowana − kwotaWyplacona`.
    // `kwotaWyplacona` = `paymentEur` if accepted, else 0. Mirrors
    // `Code.gs:6826-6832`. We allow ε=1 EUR rounding tolerance per legacy.
    const requested = claim.amountRequested ?? 0;
    const paid =
      claim.status === 'ZAAKCEPTOWANO' ? (claim.paymentEur ?? 0) : 0;
    const maxAmount = requested - paid;
    if (dto.kwotaReklamacji > maxAmount + 1) {
      throw new UnprocessableEntityException(
        `Kwota reklamacji (${dto.kwotaReklamacji} €) przekracza maksimum (` +
          `${Math.round(maxAmount)} €).`,
      );
    }

    const updated = await this.claims.update(claim.id, {
      reklamacjaSubmitted: true,
      reklamacjaText: dto.tresc,
      reklamacjaAmount: dto.kwotaReklamacji,
      status: 'REKLAMACJA',
      statusChangedAt: new Date(),
      statusBeforeReklamacja: claim.status,
      // Parity with the other `orig*` fields: `submitReklamacja` re-snapshots
      // the carrier's "second submit" inputs with a `?? current` fallback so a
      // claim that somehow lacks the original snapshot still gets one stamped
      // at reklamacja time. We mirror the same shape for `origHoursAdjusted`:
      // if the column was already set at original submit (the common case
      // post-`hoursAdjusted`-Decimal-split migration) the `??` short-circuits
      // and the immutable snapshot is preserved; otherwise we fall back to
      // the current applied value.
      origDateStart: claim.origDateStart ?? claim.dateStart,
      origDateEnd: claim.origDateEnd ?? claim.dateEnd,
      origMileage: claim.origMileage ?? claim.mileage,
      origHoursAdjusted: claim.origHoursAdjusted ?? claim.hoursAdjustedValue,
    });

    void this._notifyReklamacja(updated).catch((err) => {
      this.logger.error({
        msg: 'claims.reklamacja.notify_failed',
        nrZgl: updated.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return this.toDto(updated);
  }

  // ── Read ────────────────────────────────────────────────

  async getOne(user: AuthUser, nrZgl: string): Promise<ClaimDto> {
    const row = await this.claims.findByNrZgl(nrZgl);
    if (!row) throw new NotFoundException('Wniosek nie znaleziony');
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (row.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tego wniosku');
      }
    }
    return this.toDto(row);
  }

  async list(
    user: AuthUser,
    filters: ClaimFilters,
  ): Promise<{ items: ClaimListItem[]; nextCursor: string | null }> {
    const effective = await this._scopeListFilters(user, filters);
    const rows = await this.claims.list(effective);
    const hasNext = rows.length > effective.limit;
    const page = hasNext ? rows.slice(0, effective.limit) : rows;
    return {
      items: page.map((r) => this.toListItem(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  // ── Mappers ─────────────────────────────────────────────

  toDto(row: ClaimRow): ClaimDto {
    return {
      id: row.id,
      nrZgl: row.nrZgl,
      carrierId: row.carrierId,
      carrier: row.carrier,
      vehicleId: row.vehicleId,
      vehicle: row.vehicle,
      vehiclePlateSnapshot: row.vehiclePlateSnapshot,
      dateStart: row.dateStart.toISOString(),
      dateEnd: row.dateEnd.toISOString(),
      timeFrom: row.timeFrom,
      timeTo: row.timeTo,
      drivenDays: row.drivenDays,
      mileage: row.mileage,
      kmPerDay: row.kmPerDay,
      kmGuaranteed: row.kmGuaranteed,
      kmDifference: row.kmDifference,
      paymentEur: row.paymentEur,
      ratePerKmEffective: row.ratePerKmEffective,
      breakdown: row.breakdown,
      status: row.status,
      statusChangedAt: row.statusChangedAt
        ? row.statusChangedAt.toISOString()
        : null,
      decidedById: row.decidedById,
      decidedBy: row.decidedBy,
      comment: row.comment,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate ? toDateString(row.orderDate) : null,
      authorizationRequired: row.authorizationRequired,
      authorizationDescription: row.authorizationDescription,
      authorizationToken: row.authorizationToken,
      authorizationDecidedAt: row.authorizationDecidedAt
        ? row.authorizationDecidedAt.toISOString()
        : null,
      amountRequested: row.amountRequested,
      amountApproved: row.amountApproved,
      margin: row.margin,
      amountMaximum: row.amountMaximum,
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      reklamacjaText: row.reklamacjaText,
      reklamacjaResponse: row.reklamacjaResponse,
      reklamacjaAmount: row.reklamacjaAmount,
      statusBeforeReklamacja: row.statusBeforeReklamacja,
      origDateStart: row.origDateStart
        ? row.origDateStart.toISOString()
        : null,
      origDateEnd: row.origDateEnd ? row.origDateEnd.toISOString() : null,
      origMileage: row.origMileage,
      // Immutable carrier time-window snapshot — `HH:mm` strings forwarded
      // as-is (set once at submit, never mutated by the verifier PATCH).
      origTimeFrom: row.origTimeFrom,
      origTimeTo: row.origTimeTo,
      // Decimal(5,2) → number — repository already round-tripped through
      // `decimalToNumber`, so `row.*` is already `number | null`. We forward
      // unchanged; `null` means "no data" (column NULL), `0` means the
      // carrier explicitly entered zero.
      origHoursAdjusted: row.origHoursAdjusted,
      hoursAdjustedValue: row.hoursAdjustedValue,
      authScreenshotUrl: row.authScreenshotUrl,
      attachments: row.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        mimeType: a.mimeType,
        size: a.size,
        uploadedById: a.uploadedById,
        createdAt: a.createdAt.toISOString(),
      })),
      delegationId: row.delegationId,
      // Linked-outing plan/fakt return embedded for the «POWIĄZANY WYJAZD»
      // block. `planned` is date-only (`toDateString`); `actual` is a full ISO
      // datetime — mirrors the Delegation DTO so the frontend formats identically.
      delegationPlannedReturnAt: row.delegationPlannedReturnAt
        ? toDateString(row.delegationPlannedReturnAt)
        : null,
      delegationActualReturnAt: row.delegationActualReturnAt
        ? row.delegationActualReturnAt.toISOString()
        : null,
      periodAdjustedByVerifier: row.periodAdjustedByVerifier,
      // Stored auto-recalc result — forwarded verbatim so the frontend reads
      // the outcome directly (no heuristic inference).
      autoRecalcState: row.autoRecalcState,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  toListItem(row: ClaimRow): ClaimListItem {
    return {
      id: row.id,
      nrZgl: row.nrZgl,
      status: row.status,
      carrierId: row.carrierId,
      carrierName: row.carrier?.name ?? null,
      vehiclePlate: row.vehiclePlateSnapshot,
      dateStart: row.dateStart.toISOString(),
      dateEnd: row.dateEnd.toISOString(),
      drivenDays: row.drivenDays,
      mileage: row.mileage,
      kmGuaranteed: row.kmGuaranteed,
      kmDifference: row.kmDifference,
      paymentEur: row.paymentEur,
      amountRequested: row.amountRequested,
      amountApproved: row.amountApproved,
      authorizationRequired: row.authorizationRequired,
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ── Internals ───────────────────────────────────────────

  // ── update() helpers (Phase 4) ──────────────────────────

  /**
   * Loads the claim, normalises the wire-only synthetic literals, validates
   * the transition + per-target required fields, and returns the existing
   * row. Throws 404 on missing claim, 422 on illegal transition (via state
   * machine), 400 on cross-field invariant violation (missing required
   * fields per docs/01-overview.md#weryfikacja-wniosku).
   */
  private async _validateClaimUpdate(
    nrZgl: string,
    dto: UpdateClaimDto,
  ): Promise<ClaimRow> {
    const existing = await this.claims.findByNrZgl(nrZgl);
    if (!existing) {
      throw new NotFoundException('Wniosek nie znaleziony');
    }

    const targetStatus = translateSyntheticStatus(dto.targetStatus);

    // State-machine check first — gives the verifier a friendly Polish 422
    // before we run any cross-field validation.
    assertLegalTransition(existing.status, targetStatus);

    // Cross-field invariants. The discriminated union already enforces
    // presence at the type/Zod level, but we re-check here so the service
    // remains correct when called from tests / non-HTTP code paths that
    // bypass the pipe.
    if (dto.targetStatus === 'ZAAKCEPTOWANO') {
      if (!dto.orderNumber || dto.orderNumber.trim() === '') {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: 'Numer zlecenia (nrZlecenia) jest wymagany przy akceptacji.',
        });
      }
      if (!dto.orderDate) {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: 'Data zlecenia jest wymagana przy akceptacji.',
        });
      }
      if (
        dto.amountApproved === undefined ||
        dto.amountApproved === null
      ) {
        throw new BadRequestException({
          code: 'INVALID_STATUS_TRANSITION',
          message: 'Kwota zatwierdzona (zatwKwota) jest wymagana.',
        });
      }
    }

    // Reklamacja-accept needs a verifier-approved amount. Reklamacja-reject
    // needs only the rejection comment (already required by Zod schema).
    if (
      dto.targetStatus === 'REKLAMACJA_ZAAKCEPTOWANO' &&
      (dto.reklamacjaAmount === undefined || dto.reklamacjaAmount === null)
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: 'Kwota reklamacji jest wymagana przy akceptacji reklamacji.',
      });
    }

    return existing;
  }

  /**
   * Re-runs km-calc when the verifier changed at least one input that
   * affects the math (dates / times / mileage / hoursAdjusted). For pure
   * decision changes (status + nrZlecenia + komentarz + reklamacja flags
   * only), we skip the recalc and surface the existing values — that's
   * pure optimisation but it also keeps the audit diff clean.
   */
  private async _recalcClaim(
    existing: ClaimRow,
    dto: UpdateClaimDto,
  ): Promise<{
    drivenDays: number;
    kmGuaranteed: number;
    kmDifference: number;
    paymentEur: number;
    ratePerKmEffective: number;
    kmPerDay: number;
    breakdown: KmCalcBreakdown;
    mileage: number;
  } | null> {
    const corrections = extractCorrectionFields(dto);
    if (!corrections.touchesMath) {
      return null;
    }

    const dateStart = corrections.dateStart ?? toIsoDateOnly(existing.dateStart);
    const dateEnd = corrections.dateEnd ?? toIsoDateOnly(existing.dateEnd);
    const timeFrom = corrections.timeFrom ?? existing.timeFrom;
    const timeTo = corrections.timeTo ?? existing.timeTo;
    const mileage = corrections.mileage ?? existing.mileage;
    const hoursAdjusted = corrections.hoursAdjusted ?? 0;

    const calc = await this.kmCalc.calc({
      dateStart,
      dateEnd,
      timeFrom,
      timeTo,
      hoursAdjusted,
    });

    const kmDifference = calc.kmGuaranteed - mileage;
    const paymentEur =
      kmDifference > 0
        ? round2(kmDifference * calc.ratePerKmEffective)
        : 0;
    const kmPerDay =
      calc.totalDays > 0 ? round2(mileage / calc.totalDays) : 0;

    const breakdown: KmCalcBreakdown = {
      totalDays: calc.totalDays,
      // Same pre-adjustment raw total as on submit/preview — kept on the
      // re-calc patch so PATCH-driven verifier edits also propagate
      // `<HoursReadout>`-ready data into the persisted breakdown JSONB.
      rawTotalDays: calc.rawTotalDays,
      kmGuaranteed: calc.kmGuaranteed,
      ratePerKmEffective: calc.ratePerKmEffective,
      breakdown: calc.breakdown,
    };

    return {
      drivenDays: calc.totalDays,
      kmGuaranteed: calc.kmGuaranteed,
      kmDifference,
      paymentEur,
      ratePerKmEffective: calc.ratePerKmEffective,
      kmPerDay,
      breakdown,
      mileage,
    };
  }

  /**
   * Authoritative accept-guard (Fix 3, backend half).
   *
   * Blocks moving a claim into an ACCEPTED state when there is no under-run —
   * i.e. the carrier "drove the guarantee" (kmGuaranteed - mileage <= 0), so no
   * compensation is due. This is the server-side mirror of the carrier-UI gate:
   * the UI hides/disables the accept action, but a forged or stale PATCH must
   * not be able to flip such a claim to a paid state.
   *
   * Target states that count as ACCEPT:
   *   - `ZAAKCEPTOWANO` (fresh claim accepted by the verifier).
   *   - `REKLAMACJA_ZAAKCEPTOWANO` (verifier accepts a reklamacja; the service
   *     translates this synthetic wire literal back to `ZAAKCEPTOWANO`, see
   *     docs/13-api-design.md#update-claim-verification).
   * `ODRZUCONO` / `REKLAMACJA_ODRZUCONO` (and any other transition) are NOT
   * gated — a "no under-run" claim can always be rejected.
   *
   * km-difference source: the RECALCULATED value when the verifier touched a
   * math-affecting field (dates / times / mileage / hoursAdjusted), otherwise
   * the value already persisted on the row (recalc skipped ⇒ math unchanged).
   * We never trust a client-supplied amount here — only km-calc output.
   *
   * Pure decision helper — no IO. Throws `UnprocessableEntityException` (422).
   */
  private _assertCompensationDueForAccept(
    existing: ClaimRow,
    dto: UpdateClaimDto,
    recalc: { kmDifference: number } | null,
  ): void {
    const isAccept =
      dto.targetStatus === 'ZAAKCEPTOWANO' ||
      dto.targetStatus === 'REKLAMACJA_ZAAKCEPTOWANO';
    if (!isAccept) return;

    // Recalc ran ⇒ use its fresh kmDifference (post-verifier-edits); otherwise
    // the math is untouched and the persisted row value is authoritative.
    const kmDifference = recalc ? recalc.kmDifference : existing.kmDifference;
    if (!isCompensationDue(kmDifference)) {
      throw new UnprocessableEntityException(
        'Nie można zaakceptować — brak niedopałania (gwarancja wyjeżdżona).',
      );
    }
  }

  /**
   * Composes the actual `UpdateClaimData` patch from the validated DTO and
   * the optional recalc output. Pure function — no IO, no throws. Tested
   * indirectly via the update() spec.
   */
  private _buildUpdatePatch(
    existing: ClaimRow,
    dto: UpdateClaimDto,
    recalc:
      | {
          drivenDays: number;
          kmGuaranteed: number;
          kmDifference: number;
          paymentEur: number;
          ratePerKmEffective: number;
          kmPerDay: number;
          breakdown: KmCalcBreakdown;
          mileage: number;
        }
      | null,
    user: AuthUser,
  ): UpdateClaimData {
    const patch: UpdateClaimData = {};
    const target = translateSyntheticStatus(dto.targetStatus);
    const now = new Date();

    // Status & workflow.
    patch.status = target;
    patch.statusChangedAt = now;
    patch.decidedById = user.sub;

    // Correction fields — written only when the verifier actually changed
    // them. Mirror them onto the row regardless of recalc, because some
    // edits (e.g. timeFrom only) can affect calc while others (e.g. dateEnd
    // pushed forward by a day) might.
    const corrections = extractCorrectionFields(dto);
    if (corrections.dateStart) {
      const d = isoDateToMidnightUtc(corrections.dateStart);
      if (d) patch.dateStart = d;
    }
    if (corrections.dateEnd) {
      const d = isoDateToMidnightUtc(corrections.dateEnd);
      if (d) patch.dateEnd = d;
    }
    // Phase 7 REWORK (2026-06-20 #4) — a human edited the PERIOD (`dateStart`
    // and/or `dateEnd`). Mark it so a later delegation `zjechal` auto-recalc no
    // longer silently overwrites the verifier's correction (decision #6). The
    // human has now taken over the period, so reset `autoRecalcState` to `none`
    // — the «wymaga uwagi» badge (driven by a prior `skipped`) goes dark, since
    // the attention it flagged has been addressed (REWORK 2026-06-20 #4).
    if (
      corrections.dateStart !== undefined ||
      corrections.dateEnd !== undefined
    ) {
      patch.periodAdjustedByVerifier = true;
      patch.autoRecalcState = 'none';
    }
    if (corrections.timeFrom) patch.timeFrom = corrections.timeFrom;
    if (corrections.timeTo) patch.timeTo = corrections.timeTo;
    if (corrections.mileage !== undefined) patch.mileage = corrections.mileage;
    if (corrections.hoursAdjusted !== undefined) {
      // Verifier PATCH drives ONLY `hoursAdjustedValue` — `origHoursAdjusted`
      // is the immutable carrier snapshot and is never written here. Prisma
      // coerces the `number` into `Decimal(5,2)` at the persist boundary.
      // DTO range is bounded by `HoursAdjustedSchema.max(999.99)` so we don't
      // bounce off a Postgres numeric-overflow error.
      patch.hoursAdjustedValue = corrections.hoursAdjusted;
    }

    // km-calc outputs (only if recalc actually ran).
    if (recalc) {
      patch.drivenDays = recalc.drivenDays;
      patch.kmPerDay = recalc.kmPerDay;
      patch.kmGuaranteed = recalc.kmGuaranteed;
      patch.kmDifference = recalc.kmDifference;
      patch.paymentEur = recalc.paymentEur;
      patch.ratePerKmEffective = recalc.ratePerKmEffective;
      patch.breakdown = recalc.breakdown;
      // Restore the submit-time invariant `amountRequested === paymentEur`
      // whenever the math re-runs. Submit derives `amountRequested: paymentEur`
      // and `_applyDelegationRecalc` mirrors it; without this line a verifier km
      // edit moved `paymentEur` but left `amountRequested` stale, and the stale
      // value leaked into the kwota-Maksima authorization email
      // (`_notifyAuthorizationRequest` reads `row.amountRequested` at send time)
      // and the reklamacja amount cap. The human verifier is authoritative — if
      // a transition FROM `OCZEKUJE_NA_AUTORYZACJE` carries correction fields the
      // recalc runs and we keep mirroring, so the authorization email (sent from
      // `request-authorization`, i.e. WHEN entering OCZEKUJE_*) always reflects
      // the freshest amount.
      patch.amountRequested = recalc.paymentEur;
    }

    // Decision payload per discriminator branch.
    switch (dto.targetStatus) {
      case 'OCZEKUJE_NA_AUTORYZACJE':
        patch.margin = dto.margin;
        patch.authorizationRequired = true;
        patch.authorizationDescription = dto.authorizationDescription;
        break;
      case 'ZAAKCEPTOWANO':
        patch.orderNumber = dto.orderNumber;
        patch.orderDate = isoDateToMidnightUtc(dto.orderDate);
        patch.amountApproved = dto.amountApproved;
        if (dto.amountMaximum !== undefined) {
          patch.amountMaximum = dto.amountMaximum;
        }
        if (dto.comment !== undefined) patch.comment = dto.comment ?? null;
        break;
      case 'ODRZUCONO':
        patch.comment = dto.comment;
        break;
      case 'REKLAMACJA_ZAAKCEPTOWANO':
        patch.reklamacjaResponse = dto.comment;
        patch.reklamacjaAmount = dto.reklamacjaAmount;
        // Verifier accepted reklamacja → row's effective status becomes
        // ZAAKCEPTOWANO. `statusBeforeReklamacja` was already set when the
        // claim entered REKLAMACJA via submitReklamacja(); we leave it alone.
        break;
      case 'REKLAMACJA_ODRZUCONO':
        patch.reklamacjaResponse = dto.comment;
        break;
      default: {
        const exhaustive: never = dto;
        throw new Error(
          `claims.update: unhandled targetStatus ${String(
            (exhaustive as { targetStatus?: string }).targetStatus,
          )}`,
        );
      }
    }

    return patch;
  }

  /**
   * Tracks reklamacja-specific status bookkeeping.
   *
   * Per docs/01-overview.md#reklamacja: when a claim FIRST enters REKLAMACJA
   * we snapshot the carrier's original inputs into the `origData*` columns
   * so a downstream verifier can compare. The carrier-side path
   * (`submitReklamacja`) already does this; the verifier-side update flow
   * doesn't re-snapshot (we don't enter REKLAMACJA from this code path).
   *
   * Conversely, when leaving REKLAMACJA (verifier accepts/rejects the
   * dispute), we deliberately KEEP the orig data — it's historical record.
   *
   * Implementation: today the verifier doesn't push a claim INTO reklamacja
   * via this PATCH (only the carrier can, via the dedicated POST). The
   * helper exists so the orchestration stays explicit and future flows that
   * DO push a claim into REKLAMACJA from PATCH have a single place to wire.
   */
  private _handleReklamacjaTransition(
    existing: ClaimRow,
    dto: UpdateClaimDto,
  ): Partial<UpdateClaimData> {
    const target = translateSyntheticStatus(dto.targetStatus);

    // Defensive: verifier-side PATCH currently has NO edge into REKLAMACJA
    // (state-machine forbids it). Should the matrix grow such an edge, this
    // is the spot to snapshot origData* like `submitReklamacja` does.
    if (existing.status !== 'REKLAMACJA' && target === 'REKLAMACJA') {
      return {
        statusBeforeReklamacja: existing.status,
        origDateStart: existing.origDateStart ?? existing.dateStart,
        origDateEnd: existing.origDateEnd ?? existing.dateEnd,
        origMileage: existing.origMileage ?? existing.mileage,
      };
    }
    return {};
  }

  /**
   * Email dispatch hook for verification outcomes. Today this re-uses the
   * existing recipient logic (admin + carrier + planista + opiekun + lider)
   * and writes a structured log line; the BullMQ-backed templated send
   * lands in Phase 9 per docs/16-jobs-and-integrations.md. Bumping the
   * implementation to real Gmail-API sends is a localised swap inside the
   * Mail module — this caller does not change.
   */
  private async _applyDecisionEmails(row: ClaimRow): Promise<void> {
    // Only terminal verification outcomes notify carrier + internal staff.
    // Reklamacja and authorization transitions carry their own email flows.
    const meta: Partial<Record<ClaimStatus, { label: string; tone: Tone }>> = {
      ZAAKCEPTOWANO: { label: 'ZAAKCEPTOWANO', tone: 'success' },
      ODRZUCONO: { label: 'ODRZUCONO', tone: 'danger' },
    };
    const decision = meta[row.status];
    if (!decision) return;
    if (!this.mailService) {
      this.logger.warn({
        msg: 'claims.decision.no_mail_service',
        nrZgl: row.nrZgl,
      });
      return;
    }

    const targets = await this._collectClaimRecipients(row);
    if (!targets.carrierEmail && targets.internalEmails.length === 0) {
      this.logger.warn({
        msg: 'claims.decision.no_recipients',
        nrZgl: row.nrZgl,
      });
      return;
    }

    const appUrl = (
      this.configService?.get('APP_URL', { infer: true }) ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const carrierName = await this._resolveCarrierDisplayName(row.carrierId);
    const periodFrom = row.dateStart.toISOString().slice(0, 10);
    const periodTo = row.dateEnd.toISOString().slice(0, 10);
    // Approved payout is only meaningful for an acceptance.
    const amount =
      row.status === 'ZAAKCEPTOWANO'
        ? (row.amountApproved ?? row.paymentEur).toFixed(2)
        : undefined;
    const nz = encodeURIComponent(row.nrZgl);
    const warn = (msg: string) => (err: unknown) =>
      this.logger.warn({
        msg,
        nrZgl: row.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });

    if (targets.carrierEmail) {
      void this.mailService
        .enqueueCarrierDecision(targets.carrierEmail, {
          nrZgl: row.nrZgl,
          decisionLabel: decision.label,
          tone: decision.tone,
          vehiclePlate: row.vehiclePlateSnapshot,
          periodFrom,
          periodTo,
          amount,
          comment: row.comment ?? undefined,
          deeplink: `${appUrl}/carrier/claims/${nz}`,
        })
        .catch(warn('carrier decision enqueue failed'));
    }
    for (const email of targets.internalEmails) {
      void this.mailService
        .enqueueInternalDecision(email, {
          nrZgl: row.nrZgl,
          decisionLabel: decision.label,
          tone: decision.tone,
          carrierName,
          vehiclePlate: row.vehiclePlateSnapshot,
          periodFrom,
          periodTo,
          amount,
          comment: row.comment ?? undefined,
          deeplink: `${appUrl}/employee/claims/${nz}`,
        })
        .catch(warn('internal decision enqueue failed'));
    }

    this.logger.log({
      msg: 'claims.decision.notify',
      nrZgl: row.nrZgl,
      status: row.status,
      carrier: targets.carrierEmail ? maskEmail(targets.carrierEmail) : null,
      internal: targets.internalEmails.map((r) => maskEmail(r)),
    });
  }

  /**
   * Resolve recipients for claim notifications (submit + decision):
   *  - `carrierEmail`   — the claim's carrier (gets `carrier-*` emails).
   *  - `internalEmails` — admin + pracownik + opiekun + planista + lider +
   *    the company `wnioski@` mailbox (GMAIL_FROM). The carrier address is
   *    never double-sent as an internal recipient.
   *  - `openerEmails`   — subset of internal who may OPEN a wniosek
   *    (admin + pracownik only). Used to gate the deeplink button in the
   *    carrier-submitted email so non-staff recipients don't get an "open"
   *    link they aren't allowed to follow.
   *
   * IMPORTANT: reads via `this.prisma.client` (the root client), NOT
   * `this.prisma.tx`. These run in a fire-and-forget continuation AFTER the
   * caller's ambient `@Audit` transaction has committed; the ambient tx
   * client is closed by then, so reading through it intermittently throws
   * (that was the cause of decision emails silently failing).
   */
  private async _collectClaimRecipients(row: ClaimRow): Promise<{
    carrierEmail: string | null;
    internalEmails: string[];
    openerEmails: Set<string>;
  }> {
    const internal = new Set<string>();
    const openerEmails = new Set<string>();

    // admin + pracownik — the staff who verify wnioski (and may open them).
    const staff = await this.prisma.client.user.findMany({
      where: {
        role: { in: ['admin', 'pracownik'] },
        active: true,
        deletedAt: null,
      },
      select: { email: true },
    });
    for (const u of staff) {
      if (u.email && isValidEmail(u.email)) {
        const e = u.email.toLowerCase();
        internal.add(e);
        openerEmails.add(e);
      }
    }

    const carrier = await this.prisma.client.carrier.findFirst({
      where: { id: row.carrierId },
      select: {
        user: { select: { email: true } },
        opiekun: { select: { email: true } },
      },
    });
    const carrierEmail =
      carrier?.user.email && isValidEmail(carrier.user.email)
        ? carrier.user.email.toLowerCase()
        : null;
    if (carrier?.opiekun?.email) internal.add(carrier.opiekun.email.toLowerCase());

    if (row.vehicleId) {
      const v = await this.prisma.client.vehicle.findFirst({
        where: { id: row.vehicleId },
        select: { planner: { select: { email: true, liderEmail: true } } },
      });
      if (v?.planner?.email) internal.add(v.planner.email.toLowerCase());
      if (v?.planner?.liderEmail)
        internal.add(v.planner.liderEmail.toLowerCase());
    }

    const wnioski = this.configService?.get('GMAIL_FROM', { infer: true });
    if (wnioski) internal.add(wnioski.toLowerCase());

    if (carrierEmail) {
      internal.delete(carrierEmail);
      openerEmails.delete(carrierEmail);
    }
    return {
      carrierEmail,
      internalEmails: [...internal].filter(isValidEmail),
      openerEmails,
    };
  }

  /**
   * Audit `before`/`after` snapshot — a compact projection of the row that
   * captures every column a verifier might have touched. We intentionally
   * exclude unrelated columns (attachments, FK joins) so audit diffs stay
   * legible. Pure function, no IO.
   */
  private _snapshotForAudit(row: ClaimRow): Record<string, unknown> {
    return {
      status: row.status,
      statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
      decidedById: row.decidedById,
      dateStart: row.dateStart.toISOString(),
      dateEnd: row.dateEnd.toISOString(),
      timeFrom: row.timeFrom,
      timeTo: row.timeTo,
      mileage: row.mileage,
      // Snapshot BOTH hours-adjustment columns so a downstream diff of
      // `before`/`after` shows the verifier's `hoursAdjustedValue` change
      // alongside the immutable `origHoursAdjusted` (which will appear in
      // both halves of the diff, unchanged, since it's set-once at submit).
      // The History tab uses this to render
      // "Carrier: X → Currently: Y → Now changing to: Z" without a second
      // round-trip — `origHoursAdjusted` provides X, the diff provides Y and
      // Z. Per docs/16-jobs-and-integrations.md the audit shape is a whole-
      // row before/after snapshot (no per-field diff envelope), so we stay
      // consistent with the rest of the columns here.
      origHoursAdjusted: row.origHoursAdjusted,
      hoursAdjustedValue: row.hoursAdjustedValue,
      drivenDays: row.drivenDays,
      kmPerDay: row.kmPerDay,
      kmGuaranteed: row.kmGuaranteed,
      kmDifference: row.kmDifference,
      paymentEur: row.paymentEur,
      ratePerKmEffective: row.ratePerKmEffective,
      comment: row.comment,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate
        ? row.orderDate.toISOString().slice(0, 10)
        : null,
      amountRequested: row.amountRequested,
      amountApproved: row.amountApproved,
      amountMaximum: row.amountMaximum,
      margin: row.margin,
      authorizationRequired: row.authorizationRequired,
      authorizationDescription: row.authorizationDescription,
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      reklamacjaText: row.reklamacjaText,
      reklamacjaResponse: row.reklamacjaResponse,
      reklamacjaAmount: row.reklamacjaAmount,
      statusBeforeReklamacja: row.statusBeforeReklamacja,
      // Phase 7 REWORK (2026-06-20 #4) — capture the outing link + period-guard
      // flag so the delegation auto-recalc before/after diff shows the period
      // shift (and the History tab can render the linked-wyjazd context).
      delegationId: row.delegationId,
      periodAdjustedByVerifier: row.periodAdjustedByVerifier,
      // Stored auto-recalc result — captured so the History diff shows the
      // `applied`/`skipped`/`none` transition driven by the delegation recalc
      // and the verifier's period-edit reset.
      autoRecalcState: row.autoRecalcState,
    };
  }

  // ── end Phase 4 helpers ─────────────────────────────────

  private async _requireCarrierProfile(
    user: AuthUser,
  ): Promise<{ id: string }> {
    if (user.role !== 'przewoznik') {
      // Other roles don't have a carrier profile; the caller decides whether
      // that's an error (submit/preview) or a no-op (list).
      throw new ForbiddenException('Wymaga konta przewoźnika');
    }
    const list = await this.carriers.list({ limit: 200 });
    const mine = list.find((c) => c.userId === user.sub);
    if (!mine) {
      throw new ForbiddenException('Brak profilu przewoźnika');
    }
    return { id: mine.id };
  }

  /**
   * Resolves a vehicle the carrier owns. Throws on missing / wrong owner —
   * those are security problems with no UI affordance to recover. Does NOT
   * throw on `active=false` because a wniosek targets a past period and the
   * vehicle's *current* operational status is irrelevant; soft-deleted rows
   * are filtered upstream by the Prisma soft-delete extension and so never
   * reach this method (they 404 as "Nieprawidłowy pojazd").
   */
  private async _requireOwnedVehicle(
    carrierId: string,
    vehicleId: string,
  ): Promise<{ id: string; plateNumber: string }> {
    const v = await this.vehicles.findById(vehicleId);
    if (!v || v.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowy pojazd');
    }
    return { id: v.id, plateNumber: v.plateNumber };
  }

  // NOTE: `_requireOwnedDriver` / `_requireOwnedTrailer` were removed with the
  // Phase 7 §0″ finish — the carrier no longer sends `driverId`/`trailerId`, so
  // there is nothing to ownership-check at submit. The driver/trailer belong to
  // the carrier transitively via the owned outing. The `drivers`/`trailers`
  // repositories remain injected (DI surface stable) for future verifier-side
  // flows; they are intentionally not consulted on the carrier submit/preview
  // path anymore.

  private async _loadSubmitConfig(): Promise<{
    maxDaysAfter: number;
    maxPeriodDays: number;
    maxAvgKmPerDay: number;
    workedDaysThreshold: number;
    vehicleCooldownDays: number;
  }> {
    const rows = await this.prisma.tx.appConfig.findMany({
      where: {
        key: {
          in: [
            APP_CONFIG_MAX_DAYS_AFTER_UNLOAD,
            APP_CONFIG_MAX_PERIOD_DAYS,
            APP_CONFIG_MAX_AVG_KM_PER_DAY,
            APP_CONFIG_WORKED_DAYS_THRESHOLD,
            APP_CONFIG_VEHICLE_COOLDOWN_DAYS,
          ],
        },
      },
      select: { key: true, value: true },
    });
    let maxDaysAfter = DEFAULT_MAX_DAYS_AFTER_UNLOAD;
    let maxPeriodDays = DEFAULT_MAX_PERIOD_DAYS;
    let maxAvgKmPerDay = DEFAULT_MAX_AVG_KM_PER_DAY;
    // Carrier submission thresholds fall back to the shared `DEFAULTS` to
    // guarantee the api and `@magguarantee/shared` agree on the same numbers
    // when the AppConfig rows are missing. Explicit `number` annotations
    // widen the `as const` literal types so we can reassign from AppConfig
    // values below.
    let workedDaysThreshold: number =
      CARRIER_SUBMISSION_DEFAULTS.workedDaysThreshold;
    let vehicleCooldownDays: number =
      CARRIER_SUBMISSION_DEFAULTS.vehicleCooldownDays;
    for (const r of rows) {
      const v = Number(r.value);
      if (!Number.isFinite(v) || v < 0) continue;
      if (r.key === APP_CONFIG_MAX_DAYS_AFTER_UNLOAD) maxDaysAfter = v;
      if (r.key === APP_CONFIG_MAX_PERIOD_DAYS) maxPeriodDays = v;
      if (r.key === APP_CONFIG_MAX_AVG_KM_PER_DAY) maxAvgKmPerDay = v;
      if (r.key === APP_CONFIG_WORKED_DAYS_THRESHOLD) workedDaysThreshold = v;
      if (r.key === APP_CONFIG_VEHICLE_COOLDOWN_DAYS) vehicleCooldownDays = v;
    }
    return {
      maxDaysAfter,
      maxPeriodDays,
      maxAvgKmPerDay,
      workedDaysThreshold,
      vehicleCooldownDays,
    };
  }

  private async _scopeListFilters(
    user: AuthUser,
    filters: ClaimFilters,
  ): Promise<ClaimFilters> {
    if (
      user.role === 'admin' ||
      user.role === 'pracownik' ||
      user.role === 'opiekun' ||
      user.role === 'planista' ||
      user.role === 'dyspozytor' ||
      user.role === 'eksport' ||
      user.role === 'weryfikator'
    ) {
      // Phase 3 scope is carrier-driven; admin / employee filtering by
      // opiekun / planner happens in Phase 4 (ListController surface).
      return filters;
    }
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (filters.carrierId && filters.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tego przewoźnika');
      }
      return { ...filters, carrierId: carrier.id };
    }
    throw new ForbiddenException('Brak uprawnień');
  }

  // ── Email recipients ────────────────────────────────────

  /**
   * Send "claim submitted" notification per `Code.gs:6282-6400`.
   *
   * Recipients: ADMIN + carrier + planista + opiekun + planista's lider.
   * Implementation note: we read the planner / opiekun / lider email server-
   * side rather than trusting carrier-supplied IDs (defence in depth).
   */
  private async _notifySubmit(row: ClaimRow): Promise<void> {
    if (!this.mailService) {
      this.logger.warn({
        msg: 'claims.submit.no_mail_service',
        nrZgl: row.nrZgl,
      });
      return;
    }
    const targets = await this._collectClaimRecipients(row);
    if (!targets.carrierEmail && targets.internalEmails.length === 0) {
      this.logger.warn({ msg: 'claims.submit.no_recipients', nrZgl: row.nrZgl });
      return;
    }

    const appUrl = (
      this.configService?.get('APP_URL', { infer: true }) ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const carrierName = await this._resolveCarrierDisplayName(row.carrierId);
    const nz = encodeURIComponent(row.nrZgl);
    const warn = (err: unknown) =>
      this.logger.warn({
        msg: 'claim submitted enqueue failed',
        nrZgl: row.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });
    // Shared content. NO deeplink in `base` — the "open wniosek" button is
    // added per-recipient only for admin/pracownik (openerEmails), since other
    // recipients are not allowed to open a wniosek.
    const base = {
      nrZgl: row.nrZgl,
      carrierName,
      vehiclePlate: row.vehiclePlateSnapshot,
      periodFrom: row.dateStart.toISOString().slice(0, 10),
      periodTo: row.dateEnd.toISOString().slice(0, 10),
      kmDriven: row.mileage.toFixed(0),
      kmGuaranteed: row.kmGuaranteed.toFixed(0),
      kmShortfall: row.kmDifference.toFixed(0),
      drivenDays: row.drivenDays.toFixed(2),
      amountRequested: row.amountRequested.toFixed(2),
      paymentEur: row.paymentEur.toFixed(2),
    };
    const employeeDeeplink = `${appUrl}/employee/claims/${nz}`;

    // Carrier gets a receipt — no open button (only staff may open wnioski).
    if (targets.carrierEmail) {
      void this.mailService
        .enqueueClaimSubmitted(targets.carrierEmail, { ...base })
        .catch(warn);
    }
    for (const email of targets.internalEmails) {
      void this.mailService
        .enqueueClaimSubmitted(email, {
          ...base,
          // Button only for admin/pracownik; opiekun/planista/lider/wnioski@
          // are notified but cannot open the wniosek.
          ...(targets.openerEmails.has(email)
            ? { deeplink: employeeDeeplink }
            : {}),
        })
        .catch(warn);
    }

    this.logger.log({
      msg: 'claims.submit.notify',
      nrZgl: row.nrZgl,
      carrier: targets.carrierEmail ? maskEmail(targets.carrierEmail) : null,
      internal: targets.internalEmails.map((r) => maskEmail(r)),
    });
  }

  private async _notifyReklamacja(row: ClaimRow): Promise<void> {
    const recipients = await this._collectReklamacjaRecipients(row);
    if (recipients.length === 0) {
      this.logger.warn({
        msg: 'claims.reklamacja.no_recipients',
        nrZgl: row.nrZgl,
      });
      return;
    }
    this.logger.log({
      msg: 'claims.reklamacja.notify',
      nrZgl: row.nrZgl,
      recipients: recipients.map((r) => maskEmail(r)),
    });
  }

  private async _collectReklamacjaRecipients(
    row: ClaimRow,
  ): Promise<string[]> {
    const set = new Set<string>();
    // Root client, not the ambient tx — fire-and-forget post-commit read
    // (see `_collectClaimRecipients`).
    const admin = await this.prisma.client.user.findFirst({
      where: { role: 'admin', active: true, deletedAt: null },
      select: { email: true },
    });
    if (admin?.email) set.add(admin.email.toLowerCase());

    const carrier = await this.prisma.client.carrier.findFirst({
      where: { id: row.carrierId },
      select: { user: { select: { email: true } } },
    });
    if (carrier?.user.email) set.add(carrier.user.email.toLowerCase());

    return [...set].filter(isValidEmail);
  }
}

// ─── Pure helpers ────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * "Today" as UTC midnight of the current calendar date in the business
 * timezone (Europe/Warsaw) is now sourced from the shared
 * `startOfBusinessTodayUtc()` helper (`@magguarantee/shared`) so the API and
 * web share ONE implementation. The previous local `startOfTodayBusinessTz()`
 * + `BUSINESS_TZ` lived here; they were lifted verbatim into the shared package
 * (`domain/business-date.ts`) and removed from this file to avoid divergence.
 */

/** Parse `YYYY-MM-DD` to UTC midnight. Returns null on malformed input. */
function isoDateToMidnightUtc(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** `to - from` in whole calendar days (floor). Negative if `from > to`. */
function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Inclusive day count between two UTC-midnight dates (e.g. same-day → 1). */
function daysBetweenInclusive(from: Date, to: Date): number {
  return Math.max(0, daysBetween(from, to)) + 1;
}

function isValidEmail(s: string): boolean {
  // Cheap RFC-ish check — sufficient for the Phase 3 deduplication step.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? ''}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}

/**
 * Map a wire-only `targetStatus` literal back to its underlying `ClaimStatus`.
 * Synthetic `REKLAMACJA_ZAAKCEPTOWANO` / `REKLAMACJA_ODRZUCONO` collapse to
 * `ZAAKCEPTOWANO` / `ODRZUCONO` respectively. Real `ClaimStatus` literals
 * pass through unchanged. Pure function.
 */
function translateSyntheticStatus(
  target: UpdateClaimDto['targetStatus'],
): ClaimStatus {
  switch (target) {
    case 'REKLAMACJA_ZAAKCEPTOWANO':
      return 'ZAAKCEPTOWANO';
    case 'REKLAMACJA_ODRZUCONO':
      return 'ODRZUCONO';
    default:
      return target;
  }
}

/**
 * Extract the verifier-correction fields from the DTO and indicate whether
 * any of them affects the km-calc math (true → caller MUST re-run the
 * calc engine; false → existing kmGuaranteed/paymentEur stay).
 *
 * Branches that don't carry correction fields (e.g. `REKLAMACJA_ODRZUCONO`
 * which is comment-only) return `touchesMath: false` and empty correction
 * slots.
 */
function extractCorrectionFields(dto: UpdateClaimDto): {
  dateStart?: string;
  dateEnd?: string;
  timeFrom?: string;
  timeTo?: string;
  mileage?: number;
  hoursAdjusted?: number;
  touchesMath: boolean;
} {
  // Only some discriminator branches carry the correction fields. We
  // narrow via a property-presence check — TS doesn't help us here because
  // `UpdateClaimDto` is a union without a tagged-shape on the optional
  // fields.
  const r = dto as Partial<{
    dateStart: string;
    dateEnd: string;
    timeFrom: string;
    timeTo: string;
    mileage: number;
    hoursAdjusted: number;
  }>;
  const touchesMath =
    r.dateStart !== undefined ||
    r.dateEnd !== undefined ||
    r.timeFrom !== undefined ||
    r.timeTo !== undefined ||
    r.mileage !== undefined ||
    r.hoursAdjusted !== undefined;
  return {
    dateStart: r.dateStart,
    dateEnd: r.dateEnd,
    timeFrom: r.timeFrom,
    timeTo: r.timeTo,
    mileage: r.mileage,
    hoursAdjusted: r.hoursAdjusted,
    touchesMath,
  };
}

/** UTC date → `YYYY-MM-DD`. Inverse of `isoDateToMidnightUtc`. */
function toIsoDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Truncate any `Date` to UTC midnight of its calendar day. Used to derive a
 * claim period boundary from a delegation timestamp (`departureAt` carries a
 * time; `plannedReturnAt`/`actualReturnAt` are already date-only but we
 * normalise defensively).
 */
function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/**
 * Compare two timestamps by their UTC calendar day. Used by the delegation
 * recalc skip-branch to decide whether the wniosek's `dateEnd` actually
 * diverges from the outing's `actualReturnAt` (a same-day return is NOT a
 * divergence and must not flip `autoRecalcState` to `skipped`). The wniosek
 * period is stored at UTC midnight; `actualReturnAt` may carry a time, so we
 * normalise both to day granularity here.
 */
function sameUtcDay(a: Date, b: Date): boolean {
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}
