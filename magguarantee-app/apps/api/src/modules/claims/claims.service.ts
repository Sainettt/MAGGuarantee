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
  KmCalcBreakdown,
  PreviewClaimDto,
  PreviewClaimResponse,
  ReklamacjaEligibility,
  SubmitClaimDto,
  SubmitReklamacjaDto,
  UpdateClaimDto,
  VerifyClaimDto,
} from '@magguarantee/shared';
import {
  canSubmitByDuration,
  CLAIM_DATE_BEFORE_DEPARTURE,
  cooldownCheck,
  DEFAULTS as CARRIER_SUBMISSION_DEFAULTS,
  getAuthThreshold,
  getReklamacjaEligibility,
  isCompensationDue,
  isWithinReklamacjaCap,
  REKLAMACJA_ALREADY_SUBMITTED,
  REKLAMACJA_AMOUNT_EXCEEDS_CAP,
  REKLAMACJA_CLAIM_NOT_DECIDED,
  REKLAMACJA_NO_DELTA,
  REKLAMACJA_NOT_PENDING,
  REKLAMACJA_WINDOW_EXPIRED,
  REKLAMACJA_WINDOW_HOURS,
  requiresMaksimConfirmation,
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
 * Statuses in which the «Zapisz weryfikację» checkpoint may be saved.
 * `OCZEKUJE_NA_AUTORYZACJE` is admin-only — narrowed by
 * `_assertMayVerifyInStatus`, NOT by this list.
 */
const VERIFIABLE_CLAIM_STATUSES: readonly ClaimStatus[] = [
  'NA_WERYFIKACJI',
  'OCZEKUJE_NA_AUTORYZACJE',
];

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

/**
 * What the linked outing contributes to a wniosek after the REWORK 2026-07-30:
 * the row itself (vehicle / trailer / driver snapshots), the FLOOR for the
 * carrier-declared loading date, and the DEADLINE anchor. It no longer carries
 * a period or a time window — the carrier declares those.
 */
interface DelegationContext {
  delegation: DelegationRow;
  /** Day of the DECLARED `departureAt` — floor for the carrier's `dateStart`. */
  declaredDepartureDay: Date;
  /** Day of the weryfikator's `actualReturnAt` — anchor for the deadline rule. */
  actualReturnDay: Date;
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
    // Mail dispatch (Maksim over-threshold confirmation request + decision
    // emails). `MailService` is an optional ctor arg so the existing 9-arg test
    // fakes keep compiling; production wiring always passes the real provider
    // via NestJS DI. When null/undefined, `_dispatchMaksimConfirmationEmail`
    // logs-and-skips instead of throwing — same fire-and-log policy as the
    // other notifications.
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
   *    `zjechal` (i.e. still `w_trasie`/`gotowy`/`zgloszony`/`anulowany`),
   *  - 409 when a wniosek already exists for the outing (defence-in-depth ahead
   *    of the unique-FK P2002 catch in `submit`).
   *
   * Returns the outing row plus the derived period boundaries AND the derived
   * time window (`timeFrom`/`timeTo` = wall-clock `HH:mm` of the outing's
   * `actualDepartureAt`/`actualReturnAt`). Only `zjechal` outings back a wniosek,
   * so both actual datetimes are present.
   */
  private async _resolveDelegationContext(
    carrierId: string,
    delegationId: string,
  ): Promise<DelegationContext> {
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
    return { delegation: deleg, ...this._delegationFacts(deleg) };
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
   * The outing's status gate + the two FACTS the claim rules are measured
   * against. Pure, no IO.
   *
   * ⚠️ REWORK 2026-07-30 — this used to DERIVE the claim's period and times
   * from the outing. It no longer does: the carrier declares those itself (see
   * `SubmitClaimSchema`). What the outing still decides:
   *
   *   - the STATUS gate — only `zjechal` may back a wniosek (unchanged: the
   *     trip must be over before money is claimed for it);
   *   - `declaredDepartureDay` — the day the carrier said it would leave, i.e.
   *     the FLOOR for the carrier-declared `dateStart`;
   *   - `actualReturnDay` — the weryfikator's recorded return, i.e. the anchor
   *     for the submission DEADLINE. Deliberately NOT the carrier's `dateEnd`:
   *     that one is carrier-typed, so anchoring the deadline on it would let a
   *     late carrier type a fresher date and walk past the cut-off.
   *
   * The `?? departureAt` / `?? plannedReturnAt` fallbacks are defensive (a
   * `zjechal` outing always carries both actual datetimes) — they keep a
   * malformed legacy row from throwing on `null`.
   */
  private _delegationFacts(deleg: DelegationRow): {
    declaredDepartureDay: Date;
    actualReturnDay: Date;
  } {
    if (deleg.status !== 'zjechal') {
      throw new UnprocessableEntityException(
        'Wniosek można złożyć tylko dla zjechanego wyjazdu.',
      );
    }
    return {
      declaredDepartureDay: startOfUtcDay(deleg.departureAt),
      actualReturnDay: startOfUtcDay(
        deleg.actualReturnAt ?? deleg.plannedReturnAt,
      ),
    };
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

    // REWORK 2026-07-30 — the outing supplies the IDENTITY (vehicle, trailer,
    // driver, plate snapshot) and the two rule anchors; the carrier declares the
    // FACTS (period, time window, mileage). `_resolveDelegationContext` validates
    // ownership (same carrier), the status gate (ONLY `zjechal` — a wniosek can
    // only back a RETURNED outing), the not-already-claimed invariant and the
    // guarantee gate, then returns the outing row + `declaredDepartureDay`
    // (floor for `dateStart`) + `actualReturnDay` (deadline anchor). A `w_trasie`
    // / `gotowy` / `zgloszony` outing throws 422. The trailer/driver belong to
    // the carrier transitively (they were chosen by the carrier when the carrier
    // created the outing, and the outing is owned by the carrier), so no separate
    // ownership check is needed.
    const delegationCtx = await this._resolveDelegationContext(
      carrier.id,
      dto.delegationId,
    );
    const { delegation, declaredDepartureDay, actualReturnDay } = delegationCtx;
    const vehicleId = delegation.vehicleId;
    const vehiclePlateSnapshot = await this._resolveVehiclePlate(delegation);

    const config = await this._loadSubmitConfig();
    const today = startOfBusinessTodayUtc();

    // REWORK 2026-07-30 — the FACTS come from the carrier again. The outing
    // still supplies the vehicle/trailer/driver identity and the two anchors
    // (`declaredDepartureDay`, `actualReturnDay`), but the period, the time
    // window and the mileage are all declared here.
    const dateStart = isoDateToMidnightUtc(dto.dateStart)!;
    const dateEnd = isoDateToMidnightUtc(dto.dateEnd)!;
    const dateStartIso = dto.dateStart;
    const dateEndIso = dto.dateEnd;
    const timeFrom = dto.timeFrom;
    const timeTo = dto.timeTo;
    const mileage = dto.mileage;

    // Departure floor — the carrier may claim a LATER loading date than the one
    // it reported when registering the outing (delays happen), never an earlier
    // one. Thrown on its own, ahead of the tier-1 aggregation, so the machine
    // code stays unambiguous and the web form can attach it to the field.
    if (dateStart.getTime() < declaredDepartureDay.getTime()) {
      const floorIso = toIsoDateOnly(declaredDepartureDay);
      throw violationsException(
        [
          `Data załadunku (${dateStartIso}) jest wcześniejsza niż zgłoszona ` +
            `data wyjazdu (${floorIso}).`,
        ],
        { code: CLAIM_DATE_BEFORE_DEPARTURE, minDateStart: floorIso },
      );
    }

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
    // Deadline is measured from the weryfikator's ACTUAL return, not from the
    // carrier-typed `dateEnd` (REWORK 2026-07-30). Anchoring it on a field the
    // carrier controls would make the rule self-defeating: whoever missed the
    // window would just type a fresher unloading date.
    const daysAfterUnload = daysBetween(actualReturnDay, today);
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
    // identical numbers — both now price the carrier-declared period + times.
    // `hoursAdjusted` is verifier-only — carriers never send it; submit always
    // feeds 0 into km-calc and persists 0 on both Decimal columns.
    const calc = await this.kmCalc.calc({
      dateStart: dateStartIso,
      dateEnd: dateEndIso,
      timeFrom,
      timeTo,
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
      // Credited fraction of the period's first/last calendar day (RAW, pre
      // `hoursAdjusted`) — surfaced so the "Miesiąc" block can show exactly how
      // much of each boundary day was counted without re-deriving the walk.
      firstDay: calc.firstDay,
      lastDay: calc.lastDay,
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
          // Required post-phase3_blocks (NOT NULL) — carrier-declared again
          // since the REWORK 2026-07-30.
          timeFrom,
          timeTo,
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
          // Immutable submit-time payment snapshot — captured once so the
          // authorization-email «Korekty weryfikatora» diff and the History tab
          // can compare the carrier's originally-derived dopłata against the
          // verifier's applied amount. Same write-once contract as origMileage.
          origPaymentEur: paymentEur,
          // Immutable time-window snapshot — the SAME values that go into the
          // working `timeFrom/timeTo` columns above. Write-once at submit; the
          // verifier PATCH never overwrites these, which is what makes the
          // ClaimModal's «deklaracja vs weryfikacja» pair meaningful now that
          // the carrier types its own window.
          origTimeFrom: timeFrom,
          origTimeTo: timeTo,
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
  //
  // TODO(defensive): both delegation recalc entry points below
  // (`recalcFromDelegation` / `recalcDepartureFromDelegation`) are now
  // UNREACHABLE with a linked claim — a wniosek can only be filed on a `zjechal`
  // outing and `zjechal` is terminal, so no claim can exist while these
  // `w_trasie`/`zjechal` transitions run (they immediately no-op on the
  // "no linked wniosek" branch). Kept intact as a low-blast-radius safety net;
  // do NOT rely on them firing in the current flow.

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
   *     `OCZEKUJE_NA_AUTORYZACJE` is FROZEN: the claim crossed the auth threshold
   *     and the system already emailed Maksim the concrete dopłata, so the number
   *     must not shift while it awaits his confirmation; decided statuses are
   *     likewise immutable), AND
   *   - `claim.periodAdjustedByVerifier === false` (a human-corrected period is
   *     never silently overwritten).
   *
   * When applied: `dateEnd = actualReturnAt` → re-prefill `mileage` via the SAME
   * `_resolveMileage` (only when the carrier didn't override at submit, detected
   * via `origMileage`) → re-run km-calc via the SAME `KmCalcService` → update
   * `kmGuaranteed/kmDifference/paymentEur/breakdown/
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
    // FROZEN under authorization: the claim crossed the auth threshold at
    // verification and the system already emailed Maksim the concrete dopłata,
    // so the number must not shift while it awaits his confirmation.
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
      // Credited fraction of the period's first/last calendar day (RAW, pre
      // `hoursAdjusted`) — surfaced so the "Miesiąc" block can show exactly how
      // much of each boundary day was counted without re-deriving the walk.
      firstDay: calc.firstDay,
      lastDay: calc.lastDay,
    };

    const recalcPatch: UpdateClaimData = {
      // dateStart is unchanged (departure day); only dateEnd shifts.
      dateEnd,
      mileage,
      drivenDays: calc.totalDays,
      kmPerDay,
      kmGuaranteed: calc.kmGuaranteed,
      kmDifference,
      paymentEur,
      ratePerKmEffective: calc.ratePerKmEffective,
      breakdown,
      // Stamp the explicit result so the frontend reads «przeliczono» directly.
      autoRecalcState: 'applied',
      // `timeFrom/timeTo` and the `orig*` snapshots are intentionally NOT touched.
    };
    // Checkpoint invalidated — the underlying data changed (period/mileage/
    // km-calc were rewritten), so any prior «Zapisz weryfikację» stamp no
    // longer reflects the current numbers. Reset the verification stamp AND the
    // Maksim gate IN LOCKSTEP so the verifier must re-confirm (and, if still
    // over threshold, re-notify Maksim) before the decision unlocks again.
    this._resetVerificationState(recalcPatch);
    const updated = await this.claims.update(claim.id, recalcPatch);

    await this.auditWriter.log({
      action: 'claim.autoRecalc',
      targetType: 'Claim',
      targetKey: claim.nrZgl,
      actor: AuditContext.current()?.actor ?? 'system',
      before,
      after: this._snapshotForAudit(updated),
    });
  }

  // ── Auto-recalc from delegation DEPARTURE (in-transit) ──

  /**
   * Re-computes the linked wniosek when a delegation is marked `w_trasie` with a
   * (possibly backdated) `actualDepartureAt` — the ACTUAL start of the guarantee
   * period. Called from `DelegationsService.markInTransit()` INSIDE the
   * `@Audit`-opened ambient transaction, so every read/write here (`prisma.tx`-
   * routed) commits atomically with the outing status change.
   *
   * This is the DEPARTURE-side mirror of `recalcFromDelegation` (the return
   * side): the same hard gate, the same «applied»/«skipped» audit contract, the
   * same mileage-re-prefill / km-calc rules — but it shifts `dateStart` (not
   * `dateEnd`) because moving the actual departure moves the period START.
   *
   * Hard gate — applies ONLY when a claim is linked AND
   * `claim.status === NA_WERYFIKACJI` AND `claim.periodAdjustedByVerifier ===
   * false` (identical to the return-side gate — `OCZEKUJE_NA_AUTORYZACJE` and
   * decided statuses are frozen; a human-corrected period is never overwritten).
   *
   * The `_tx` param is accepted for call-site clarity (routing is via the
   * ambient `prisma.tx`, so it is intentionally unused).
   */
  async recalcDepartureFromDelegation(
    delegationId: string,
    actualDepartureAt: Date,
    _tx?: unknown,
  ): Promise<void> {
    const claim = await this.claims.findByDelegationId(delegationId);
    if (!claim) return; // no linked wniosek → nothing to recalc

    const recalcable =
      claim.status === 'NA_WERYFIKACJI' &&
      claim.periodAdjustedByVerifier === false;

    if (!recalcable) {
      // Decided OR human-adjusted period → leave the wniosek's numbers alone.
      // Only stamp `skipped` when the wniosek's `dateStart` actually diverges
      // from the outing's actual departure day (else the recalc would have been
      // a no-op — avoid a false «skipped» badge). Mirrors the return side.
      const hasDivergence = !sameUtcDay(claim.dateStart, actualDepartureAt);
      if (hasDivergence) {
        await this.claims.update(claim.id, { autoRecalcState: 'skipped' });
      }
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

    await this._applyDepartureRecalc(claim, actualDepartureAt);
  }

  /**
   * Applies the delegation-DEPARTURE-driven recalc to a recalc-eligible claim.
   * Shifts `dateStart` to `actualDepartureAt`, re-prefills mileage over the NEW
   * period (only when the carrier didn't override — same `origMileage` detection
   * as the return side), re-runs km-calc with the SAME engine, persists the new
   * numbers, and writes a `claim.autoRecalc` before/after audit row. No email.
   * Private — the gate lives in the public `recalcDepartureFromDelegation`.
   */
  private async _applyDepartureRecalc(
    claim: ClaimRow,
    actualDepartureAt: Date,
  ): Promise<void> {
    const before = this._snapshotForAudit(claim);

    // dateStart shifts to the actual departure day; dateEnd is unchanged.
    const dateStart = startOfUtcDay(actualDepartureAt);
    const dateEnd = startOfUtcDay(claim.dateEnd);

    // Re-prefill mileage via the SAME `_resolveMileage` (the daily-km sum over
    // the NEW period) UNLESS a human has since changed it. `origMileage ===
    // mileage` ⇒ untouched ⇒ safe to re-prefill (identical rule to the return
    // side).
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
      hoursAdjusted: claim.hoursAdjustedValue ?? 0,
    });

    const kmDifference = calc.kmGuaranteed - mileage;
    const paymentEur =
      kmDifference > 0 ? round2(kmDifference * calc.ratePerKmEffective) : 0;
    const kmPerDay = calc.totalDays > 0 ? round2(mileage / calc.totalDays) : 0;
    const breakdown: KmCalcBreakdown = {
      totalDays: calc.totalDays,
      rawTotalDays: calc.rawTotalDays,
      kmGuaranteed: calc.kmGuaranteed,
      ratePerKmEffective: calc.ratePerKmEffective,
      breakdown: calc.breakdown,
      // Credited fraction of the period's first/last calendar day (RAW, pre
      // `hoursAdjusted`) — surfaced so the "Miesiąc" block can show exactly how
      // much of each boundary day was counted without re-deriving the walk.
      firstDay: calc.firstDay,
      lastDay: calc.lastDay,
    };

    const recalcPatch: UpdateClaimData = {
      // dateEnd is unchanged (return day); only dateStart shifts.
      dateStart,
      mileage,
      drivenDays: calc.totalDays,
      kmPerDay,
      kmGuaranteed: calc.kmGuaranteed,
      kmDifference,
      paymentEur,
      ratePerKmEffective: calc.ratePerKmEffective,
      breakdown,
      autoRecalcState: 'applied',
      // `timeFrom/timeTo` and the `orig*` snapshots are intentionally NOT touched.
    };
    // Checkpoint invalidated — the underlying data changed, so a prior «Zapisz
    // weryfikację» stamp no longer reflects the current numbers. Reset the
    // verification stamp AND the Maksim gate IN LOCKSTEP (re-verification
    // re-arms + re-sends).
    this._resetVerificationState(recalcPatch);
    const updated = await this.claims.update(claim.id, recalcPatch);

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
    // `_validateClaimUpdate` also RESOLVES the effective target status: the
    // synthetic `REKLAMACJA_*` literals no longer map to a fixed
    // ZAAKCEPTOWANO/ODRZUCONO — they roll the status BACK to
    // `statusBeforeReklamacja` (REWORK 2026-07-31). Every downstream helper
    // consumes that single resolved value instead of re-deriving it.
    const { existing, target } = await this._validateClaimUpdate(nrZgl, dto);
    const isReklamacjaDecision = isReklamacjaTarget(dto.targetStatus);
    // In-transit gate (OUTERMOST): no decision (accept / reject) may be taken
    // while the linked outing is still `w_trasie` — the period/mileage isn't
    // final until `zjechal`. Runs BEFORE the verification gate so a still-driving
    // claim reports "in transit", not "not verified". No-op when there is no
    // linked outing or it already returned. 422 CLAIM_DELEGATION_IN_TRANSIT.
    this._assertDelegationReturned(existing);
    // Verification gate: a decision (akceptacja / odmowa) FROM `NA_WERYFIKACJI`
    // is blocked until the pracownik has saved the verification checkpoint
    // (`verifiedAt` stamped). Transitions FROM `OCZEKUJE_NA_AUTORYZACJE` and
    // `REKLAMACJA` are NOT gated (the claim was already verified before it left
    // NA_WERYFIKACJI). 422 CLAIM_NOT_VERIFIED.
    this._assertVerifiedIfNaWeryfikacji(existing);
    // Maksim authorization gate: an over-threshold verified claim (now sitting in
    // `OCZEKUJE_NA_AUTORYZACJE`) can only be accepted OR rejected once the
    // confirmation screenshot has cleared the gate. Independent of and STRICTER
    // than CLAIM_NOT_VERIFIED. 422 CLAIM_AUTHORIZATION_REQUIRED. Gated on the
    // decision edge out of either verification-window status; reklamacja paths
    // are not.
    this._assertMaksimGateCleared(existing, dto);
    // km-calc NEVER re-runs on a reklamacja branch: the amounts are FROZEN (the
    // uznana reklamacja pays exactly the carrier's `reklamacjaAmount`, capped at
    // submit) and those branches carry no correction fields at all since the
    // REWORK 2026-07-31. The explicit skip is belt-and-braces so a future schema
    // change cannot silently reintroduce a recalc here.
    const recalc = isReklamacjaDecision
      ? null
      : await this._recalcClaim(existing, dto);
    // Authoritative accept-guard (Fix 3): a claim may only be ACCEPTED when the
    // (re)calculated km-difference shows an under-run, i.e. compensation is
    // actually due. This is the server-side mirror of the carrier-UI gate so a
    // forged/stale PATCH can't move a "guarantee met" claim into a paid state.
    // Reklamacja resolutions are EXEMPT (see the helper's docblock).
    this._assertCompensationDueForAccept(existing, dto, recalc);
    const patch = this._buildUpdatePatch(existing, dto, recalc, user, target);
    const reklamacjaSnapshot = this._handleReklamacjaTransition(
      existing,
      target,
    );
    const data: UpdateClaimData = { ...patch, ...reklamacjaSnapshot };

    AuditContext.setBefore(this._snapshotForAudit(existing));

    const txLike = this.prisma.tx as unknown as TransactionLike;
    const updated = await this.claims.updateWithin(txLike, existing.id, data);

    // Email notifications — outside the transaction. Mirrors submit/reklamacja.
    // A reklamacja resolution gets its OWN carrier-only email: the generic
    // decision mails key off `row.status`, which after the rollback still reads
    // ZAAKCEPTOWANO/ODRZUCONO and would announce the ORIGINAL wniosek decision
    // all over again (to the carrier AND all internal recipients).
    const notify = isReklamacjaDecision
      ? this._applyReklamacjaDecisionEmail(updated)
      : this._applyDecisionEmails(updated);
    void notify.catch((err) => {
      this.logger.error({
        msg: 'claims.update.notify_failed',
        nrZgl: updated.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return this.toDto(updated);
  }

  // ── Verification checkpoint («Zapisz weryfikację») ──────

  /**
   * `PATCH /claims/:nrZgl/verification` — the pracownik's «Zapisz weryfikację»
   * checkpoint per docs/13-api-design.md#claims.
   *
   * The verifier persists their corrections to a `NA_WERYFIKACJI` claim BEFORE
   * making any decision. Stamps `verifiedAt`/`verifiedById`, which UNGATES the
   * decision transitions (akceptacja / odmowa) FROM `NA_WERYFIKACJI` (422
   * `CLAIM_NOT_VERIFIED` until verified). Steps:
   *
   *   1. Load the claim (404 if missing).
   *   2. Require a verifiable status (422 otherwise): `NA_WERYFIKACJI` for
   *      admin + pracownik alike, plus `OCZEKUJE_NA_AUTORYZACJE` for `admin`
   *      ONLY (422 `CLAIM_VERIFY_ADMIN_ONLY` for pracownik there). The role
   *      split lives HERE, not on `@Roles`, because it is status-dependent —
   *      the documented pattern (docs/15-auth-strategy.md §Roles: coarse gate on
   *      the controller, fine-grained scope in the service).
   *   3. Re-run km-calc when the body carries a math-affecting correction (the
   *      SAME `_recalcClaim` the decision PATCH uses; an EMPTY body → recalc is
   *      `null` ⇒ "confirmed as-is", no math churn).
   *   4. Arm / clear the Maksim authorization gate from the FINAL numbers, and
   *      AUTO-TRANSITION the status accordingly (this is the ONLY authorization
   *      mechanism — there is no manual request flow):
   *        - over threshold + `NA_WERYFIKACJI` → move to `OCZEKUJE_NA_AUTORYZACJE`,
   *        - under threshold + `OCZEKUJE_NA_AUTORYZACJE` → roll back to
   *          `NA_WERYFIKACJI`,
   *        - idempotent re-save over threshold in `OCZEKUJE_NA_AUTORYZACJE` →
   *          status unchanged (re-notify only on an amount-aware dedup miss).
   *   5. Persist: the corrections (via the SHARED `_applyCorrectionsToPatch`, so
   *      the field-by-field rules match the decision PATCH exactly) + the recalc
   *      outputs (when math ran) + the `verifiedAt`/`verifiedById` stamp + any
   *      status change, inside the ambient `AuditContext` transaction (setBefore
   *      + updateWithin — mirror of `update`).
   *
   * Repeatable: a second call overwrites the stamp + corrections (re-verify).
   * MAY change status (the threshold auto-transition above); `decidedById` is NOT
   * touched (this is verification, not a decision). The Maksim confirmation email
   * fires fire-and-log (amount-deduped) when the gate (re)arms.
   */
  async verifyClaim(
    user: AuthUser,
    nrZgl: string,
    dto: VerifyClaimDto,
  ): Promise<ClaimDto> {
    const existing = await this.claims.findByNrZgl(nrZgl);
    if (!existing) {
      throw new NotFoundException('Wniosek nie znaleziony');
    }

    // A checkpoint is valid in the verification window, and — for `admin` ONLY
    // — in the pending-authorization window (an admin may still fix the numbers
    // on a wniosek that already went out to Maksim). Two DISTINCT 422s: the
    // status refusal and the role refusal are different causes and the web must
    // tell them apart (the role one carries a machine code).
    this._assertVerifiableStatus(existing);
    this._assertMayVerifyInStatus(user, existing);

    // In-transit gate: a verification checkpoint on a wniosek whose linked
    // outing is still `w_trasie` is blocked (period/mileage not yet final). This
    // sits BEFORE `_recalcClaim` + the Maksim gate arming, so the Maksim
    // confirmation auto-email is NOT dispatched on the gated path. No-op when
    // there is no linked outing or it already returned. 422
    // CLAIM_DELEGATION_IN_TRANSIT.
    this._assertDelegationReturned(existing);

    // Re-run km-calc only when the body carries a math-affecting correction.
    // An empty body ⇒ `touchesMath: false` ⇒ `recalc === null` ⇒ "confirmed
    // as-is": we stamp `verifiedAt` without touching any calc column.
    const recalc = await this._recalcClaim(existing, dto);

    const now = new Date();
    const patch: UpdateClaimData = {
      verifiedAt: now,
      verifiedById: user.sub,
    };
    // Corrections + recalc outputs — SAME field-by-field logic as the decision
    // PATCH (periodAdjustedByVerifier + autoRecalcState:'none' on date edits;
    // km-calc outputs rewritten on recalc).
    const corrections = extractCorrectionFields(dto);
    this._applyCorrectionsToPatch(patch, corrections, recalc, existing);

    // Maksim authorization gate — arm / clear from the FINAL numbers (recalc
    // output when the math re-ran, otherwise the values already on the row).
    // `_applyMaksimGate` mutates `patch` and returns whether the auto-email
    // should be dispatched (fire-and-log, OUTSIDE the tx) after commit.
    //
    // Runs in BOTH verifiable statuses. This is the ONLY authorization mechanism
    // (the manual request flow was removed), so an admin re-verify while the
    // claim sits in `OCZEKUJE_NA_AUTORYZACJE` must re-evaluate the gate too:
    // re-notify on a moved over-threshold amount (amount-aware dedup), or clear
    // the gate and roll the status back to `NA_WERYFIKACJI` when a correction
    // drops the dopłata under threshold. Both harms the old scoping guarded
    // against are now DESIRED: (a) an admin amount edit re-notifies Maksim of the
    // NEW dopłata, and (b) dropping under threshold correctly clears the
    // clearance because the status rolls back in the same patch.
    const finalPaymentEur = recalc ? recalc.paymentEur : existing.paymentEur;
    const finalDrivenDays = recalc ? recalc.drivenDays : existing.drivenDays;
    const overThreshold = requiresMaksimConfirmation({
      paymentEur: finalPaymentEur,
      drivenDays: finalDrivenDays,
    });
    const shouldNotifyMaksim = this._applyMaksimGate(
      patch,
      existing,
      finalPaymentEur,
      finalDrivenDays,
      now,
    );

    // Threshold-driven status auto-transition. The state machine carries both
    // edges in/out of `OCZEKUJE_NA_AUTORYZACJE`; PATCH never targets that status
    // — only this checkpoint moves in and out of it. An idempotent re-save over
    // threshold while already in `OCZEKUJE_NA_AUTORYZACJE` leaves the status
    // untouched (only the amount-aware dedup decides on re-notify). `decidedById`
    // is deliberately NOT set — this is verification, not a decision.
    if (overThreshold && existing.status === 'NA_WERYFIKACJI') {
      assertLegalTransition(existing.status, 'OCZEKUJE_NA_AUTORYZACJE');
      patch.status = 'OCZEKUJE_NA_AUTORYZACJE';
      patch.statusChangedAt = now;
    } else if (!overThreshold && existing.status === 'OCZEKUJE_NA_AUTORYZACJE') {
      assertLegalTransition(existing.status, 'NA_WERYFIKACJI');
      patch.status = 'NA_WERYFIKACJI';
      patch.statusChangedAt = now;
    }

    AuditContext.setBefore(this._snapshotForAudit(existing));

    // Ambient tx opened by the `@Audit('claim.verify')` interceptor — the row
    // update + audit-row insert commit atomically (mirror of update()).
    const txLike = this.prisma.tx as unknown as TransactionLike;
    const updated = await this.claims.updateWithin(txLike, existing.id, patch);

    // Maksim notification — outside the transaction (fire-and-log), only on the
    // first over-threshold save or a moved amount (amount-aware dedup via the
    // just-stamped notifiedAt/notifiedAmount). A mail failure must not roll back
    // the verification stamp or the status auto-transition.
    if (shouldNotifyMaksim) {
      void this._dispatchMaksimConfirmationEmail(updated).catch((err) => {
        this.logger.error({
          msg: 'claims.verify.maksim_notify_failed',
          nrZgl: updated.nrZgl,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return this.toDto(updated);
  }

  /**
   * Status gate for the verification checkpoint. A checkpoint only makes sense
   * while the wniosek is still actionable by a verifier:
   *
   *   - `NA_WERYFIKACJI`           — the normal verification window.
   *   - `OCZEKUJE_NA_AUTORYZACJE`  — the pending-authorization window; the
   *     numbers can still need a fix while Maksim's reply is awaited. Role is
   *     narrowed separately by `_assertMayVerifyInStatus` (admin only).
   *
   * Any other status (decided / reklamacja) → 422 with a friendly Polish
   * message, no machine code (unchanged from before). Pure guard — no IO.
   */
  private _assertVerifiableStatus(existing: ClaimRow): void {
    if (!VERIFIABLE_CLAIM_STATUSES.includes(existing.status)) {
      throw new UnprocessableEntityException(
        'Weryfikację można zapisać tylko dla wniosku w statusie „Na weryfikacji" lub „Oczekuje na autoryzację".',
      );
    }
  }

  /**
   * Role gate for the verification checkpoint, STATUS-DEPENDENT — which is why
   * it lives in the service and not on `@Roles('admin','pracownik')` (the
   * controller decorator stays the coarse gate per docs/15-auth-strategy.md
   * §Roles; docs/03-roles.md gives admin the superset of pracownik).
   *
   * `NA_WERYFIKACJI` is open to admin + pracownik alike (unchanged).
   * `OCZEKUJE_NA_AUTORYZACJE` is admin-ONLY: the wniosek already left the
   * verifier's desk and is awaiting Maksim, so only an admin may reach back in.
   *
   * Enforced HERE (server-side) rather than by merely hiding the button, so it
   * cannot be bypassed by calling the endpoint directly. Throws 422 with the
   * DISTINCT `CLAIM_VERIFY_ADMIN_ONLY` code — the refusal reason differs from
   * the status refusal above and the web must render them differently. Pure
   * guard — no IO.
   */
  private _assertMayVerifyInStatus(user: AuthUser, existing: ClaimRow): void {
    if (existing.status !== 'OCZEKUJE_NA_AUTORYZACJE') return;
    if (user.role === 'admin') return;

    throw new UnprocessableEntityException({
      code: 'CLAIM_VERIFY_ADMIN_ONLY',
      message:
        'Wniosek oczekuje na autoryzację — weryfikację może zapisać tylko administrator.',
      // Surface the machine code under `extensions` so the global
      // `ProblemDetailsFilter` lifts it into the RFC-7807 body (a top-level
      // `code` alone is dropped). Mirrors the CLAIM_AUTHORIZATION_REQUIRED /
      // CLAIM_DELEGATION_IN_TRANSIT pattern; the top-level `code`/`message` are
      // kept for the in-process unit tests that read `getResponse().code`.
      extensions: { code: 'CLAIM_VERIFY_ADMIN_ONLY' },
    });
  }

  /**
   * Arms / clears the Maksim authorization gate on the verification-save patch
   * from the FINAL dopłata + driven days, and reports whether the auto-email
   * should be dispatched. Pure mutation of `patch` — no IO (the email is fired
   * by the caller, outside the tx). Rules (docs/13 §claims, brief §2.2):
   *
   *  - OVER threshold (`requiresMaksimConfirmation`) → `maksimGateRequired=true`.
   *    Dedup is AMOUNT-aware: re-notify Maksim when he was NOT yet notified
   *    (`maksimGateNotifiedAt == null`), OR the last-notified amount is unknown
   *    (`maksimGateNotifiedAmount == null` — legacy rows), OR the final
   *    over-threshold dopłata DIFFERS (rounded to 2dp) from the last-notified
   *    amount. On (re)notify: stamp `maksimGateNotifiedAt=now` +
   *    `maksimGateNotifiedAmount=round2(finalPaymentEur)`, and NULL any prior
   *    clearance (`maksimGateClearedAt`/`ById`) — a moved amount invalidates the
   *    old confirmation, so Maksim must re-confirm the NEW number and a
   *    previously-unblocked decision is re-blocked (intended). Returns `true`.
   *    When the amount is UNCHANGED vs the last notification → idempotent re-save,
   *    return `false` and touch nothing (preserve `notifiedAt`/`notifiedAmount`
   *    and any prior clearance).
   *  - NOT over threshold → clear the whole gate (a correction that drops below
   *    threshold unlocks the decision normally): `maksimGateRequired=false` +
   *    null `notifiedAt`/`notifiedAmount`/`clearedAt`/`clearedById`. Returns
   *    `false`.
   *
   * @returns `true` when the caller must enqueue the Maksim email.
   */
  private _applyMaksimGate(
    patch: UpdateClaimData,
    existing: ClaimRow,
    finalPaymentEur: number,
    finalDrivenDays: number,
    now: Date,
  ): boolean {
    const overThreshold = requiresMaksimConfirmation({
      paymentEur: finalPaymentEur,
      drivenDays: finalDrivenDays,
    });

    if (!overThreshold) {
      // Under threshold — no authorization needed; a prior gate unlocks.
      patch.maksimGateRequired = false;
      patch.maksimGateNotifiedAt = null;
      patch.maksimGateNotifiedAmount = null;
      patch.maksimGateClearedAt = null;
      patch.maksimGateClearedById = null;
      return false;
    }

    patch.maksimGateRequired = true;

    const finalRounded = round2(finalPaymentEur);
    const amountMoved =
      existing.maksimGateNotifiedAmount === null ||
      round2(existing.maksimGateNotifiedAmount) !== finalRounded;

    if (existing.maksimGateNotifiedAt === null || amountMoved) {
      // First over-threshold save on this cycle OR the over-threshold amount
      // moved → (re)notify + re-stamp dedup. A moved amount invalidates any
      // prior clearance: Maksim must re-confirm the NEW number.
      patch.maksimGateNotifiedAt = now;
      patch.maksimGateNotifiedAmount = finalRounded;
      patch.maksimGateClearedAt = null;
      patch.maksimGateClearedById = null;
      return true;
    }
    // Already notified at this exact amount — idempotent re-save, no re-send.
    // Leave the notifiedAt/notifiedAmount + any prior clearedAt/ById untouched.
    return false;
  }

  /**
   * Verification gate. Throws 422 `CLAIM_NOT_VERIFIED` when a decision is
   * attempted on a `NA_WERYFIKACJI` claim that has not yet been verified (no
   * `verifiedAt` stamp). No-op for any other status — a claim in
   * `OCZEKUJE_NA_AUTORYZACJE` / `REKLAMACJA` was already verified before it left
   * NA_WERYFIKACJI (indeed `OCZEKUJE_NA_AUTORYZACJE` is reached ONLY via a
   * successful verification), so those transitions are NOT gated. Pure decision
   * helper — no IO.
   */
  private _assertVerifiedIfNaWeryfikacji(existing: ClaimRow): void {
    if (existing.status === 'NA_WERYFIKACJI' && !existing.verifiedAt) {
      throw new UnprocessableEntityException({
        code: 'CLAIM_NOT_VERIFIED',
        message: 'Najpierw zapisz weryfikację danych wniosku.',
      });
    }
  }

  /**
   * In-transit gate. HARD-blocks every verifier-side ACTION (verify / decision)
   * on a wniosek whose LINKED outing is still `w_trasie` — the auto is on the
   * road, so the period/mileage the verifier would act on is not yet final (the
   * `zjechal` transition triggers the auto-recalc). Viewing (GET) stays open; the
   * block lives only on the mutating paths. Throws 422
   * `CLAIM_DELEGATION_IN_TRANSIT`.
   *
   * Passes through silently when there is NO linked outing
   * (`delegationId === null`) or the outing has already returned
   * (`delegationStatus !== 'w_trasie'`, i.e. `zjechal` etc.) — the flow then
   * behaves exactly as before. Pure guard — no IO. Wired as the OUTERMOST gate
   * on `update` (before `CLAIM_NOT_VERIFIED`) and on `verifyClaim` (before the
   * recalc + Maksim auto-email + status auto-transition).
   *
   * TODO(defensive): now effectively unreachable — a wniosek can only be filed
   * on a `zjechal` outing, so a linked outing is never `w_trasie` in the current
   * flow. Kept as a low-blast-radius safety net (a re-opened lifecycle would
   * re-arm it) rather than deleted.
   */
  private _assertDelegationReturned(existing: ClaimRow): void {
    if (
      existing.delegationId !== null &&
      existing.delegationStatus === 'w_trasie'
    ) {
      throw new UnprocessableEntityException({
        code: 'CLAIM_DELEGATION_IN_TRANSIT',
        message:
          'Nie można podjąć akcji — wyjazd jest jeszcze w trasie. Poczekaj na zjazd auta.',
        // Surface the machine code under `extensions` so the global
        // `ProblemDetailsFilter` lifts it into the RFC-7807 body. The filter
        // only forwards `detail`/`errors`/`violations`/`extensions` — a
        // top-level `code` alone is dropped. Web keys its stale-state handler on
        // `body.extensions.code`. Mirrors the `CLAIM_AUTHORIZATION_REQUIRED`
        // pattern above. The top-level `code`/`message` are kept for the
        // in-process unit tests that read `getResponse().code` directly.
        extensions: { code: 'CLAIM_DELEGATION_IN_TRANSIT' },
      });
    }
  }

  /**
   * Maksim authorization gate. HARD-blocks the accept/reject decision on an
   * over-threshold claim until the confirmation screenshot has cleared the gate.
   * Throws 422 `CLAIM_AUTHORIZATION_REQUIRED` (a stable code, distinct from and
   * stricter than `CLAIM_NOT_VERIFIED`) when the gate is armed
   * (`maksimGateRequired`) and not yet cleared (`maksimGateClearedAt == null`).
   * Blocks BOTH `ZAAKCEPTOWANO` and `ODRZUCONO` — no decision either way until
   * Maksim confirmed.
   *
   * Scope: the decision edge out of EITHER verification-window status
   * (`NA_WERYFIKACJI` or `OCZEKUJE_NA_AUTORYZACJE`). An over-threshold claim now
   * sits in `OCZEKUJE_NA_AUTORYZACJE` (auto-moved at verification), so decisions
   * out of it are gated too. Any reklamacja resolution (`REKLAMACJA_*`) is NOT
   * gated here — the gate lives on the verification checkpoint, and that path
   * does not re-enter it. Pure decision helper — no IO.
   */
  private _assertMaksimGateCleared(
    existing: ClaimRow,
    dto: UpdateClaimDto,
  ): void {
    // Gate the fresh accept/reject decision out of the verification window
    // (`NA_WERYFIKACJI` or `OCZEKUJE_NA_AUTORYZACJE`). The synthetic REKLAMACJA_*
    // literals are excluded.
    const isDecision =
      dto.targetStatus === 'ZAAKCEPTOWANO' ||
      dto.targetStatus === 'ODRZUCONO';
    const inVerificationWindow =
      existing.status === 'NA_WERYFIKACJI' ||
      existing.status === 'OCZEKUJE_NA_AUTORYZACJE';
    if (!inVerificationWindow || !isDecision) return;

    if (existing.maksimGateRequired && existing.maksimGateClearedAt === null) {
      throw new UnprocessableEntityException({
        code: 'CLAIM_AUTHORIZATION_REQUIRED',
        message:
          'Wgraj potwierdzenie autoryzacji od Maksima, aby podjąć decyzję.',
        // Surface the machine code under `extensions` so the global
        // `ProblemDetailsFilter` lifts it into the RFC-7807 body. The filter
        // only forwards `detail`/`errors`/`violations`/`extensions` — a
        // top-level `code` alone is dropped. Web keys its stale-state handler on
        // `body.extensions.code`. Mirrors the vehicle-cooldown 422 pattern. The
        // top-level `code`/`message` are kept for the in-process unit tests that
        // read `getResponse().code` directly.
        extensions: { code: 'CLAIM_AUTHORIZATION_REQUIRED' },
      });
    }
  }

  /**
   * Resets the verification checkpoint AND the Maksim authorization gate IN
   * LOCKSTEP. The invariant this centralizes: the gate must never outlive a
   * data change that Maksim never confirmed — so wherever `verifiedAt` is
   * invalidated, the whole gate (required / notified / cleared / clearedBy) is
   * cleared too, letting a re-verification re-arm (and re-send) from scratch.
   *
   * Mutates the supplied patch in place (no IO). Called from every
   * verification-reset site: the delegation departure/return auto-recalc, and
   * (implicitly) the verifier period/mileage edits — those re-run
   * `verifyClaim`, which re-arms via `_applyMaksimGate` rather than resetting,
   * so `verifyClaim` calls this ONLY to null a prior gate before re-deciding.
   */
  private _resetVerificationState(patch: UpdateClaimData): void {
    patch.verifiedAt = null;
    patch.verifiedById = null;
    patch.maksimGateRequired = false;
    patch.maksimGateNotifiedAt = null;
    patch.maksimGateNotifiedAmount = null;
    patch.maksimGateClearedAt = null;
    patch.maksimGateClearedById = null;
  }

  /**
   * Ships the Maksim over-threshold CONFIRMATION-REQUEST email — the ONLY
   * authorization notification (there is no manual request flow). Fired
   * fire-and-log from `verifyClaim` outside the tx, guarded by the amount-aware
   * `maksimGateNotifiedAt`/`maksimGateNotifiedAmount` dedup, so a mail failure
   * never rolls back the verification stamp or the status auto-transition.
   *
   * Content rows (brief §2.6): Dopłata / Próg / Dni w trasie / Okno godzin,
   * Odjazd (zgłoszony `departureAt` → faktyczny `actualDepartureAt`), Zjazd
   * (planowany `plannedReturnAt` → faktyczny `actualReturnAt`), and the reused
   * «Korekty weryfikatora» diff. Date-only fields are rendered as dates (not
   * datetime — avoids a phantom "02:00" from the timezone offset). Deeplink to
   * the employee claim page; recipient `MAKSIM_EMAIL`.
   */
  private async _dispatchMaksimConfirmationEmail(row: ClaimRow): Promise<void> {
    if (!this.mailService) {
      this.logger.warn({
        msg: 'claims.verify.maksim_no_mail_service',
        nrZgl: row.nrZgl,
      });
      return;
    }
    const appUrl =
      this.configService?.get('APP_URL', { infer: true }) ??
      'http://localhost:3000';
    const maksimEmail =
      this.configService?.get('MAKSIM_EMAIL', { infer: true }) ??
      'maksim.siankevich@magtrans.eu';
    const carrierName = await this._resolveCarrierDisplayName(row.carrierId);
    const deeplink = `${appUrl.replace(/\/$/, '')}/employee/claims/${encodeURIComponent(row.nrZgl)}`;

    // Reuse the same diff builder as the manual authorization email.
    const korekty = this._buildAuthorizationKorekty(row);

    await this.mailService.enqueueMaksimConfirmationRequest(maksimEmail, {
      nrZgl: row.nrZgl,
      carrierName,
      vehiclePlate: row.vehiclePlateSnapshot,
      // Amounts pre-formatted here so the template stays pure. `paymentEur` is
      // the CURRENT km-calc output — i.e. post-correction, which is exactly the
      // figure Maksim is being asked to authorize.
      doplata: row.paymentEur.toFixed(2),
      prog: getAuthThreshold(row.drivenDays).toFixed(2),
      dniWTrasie: row.drivenDays.toFixed(2),
      // «Okno godzin» — the existing time window (no new "hours" field).
      godzinyFrom: row.timeFrom,
      godzinyTo: row.timeTo,
      // Odjazd: zgłoszony (date) → faktyczny (date). Rendered as dates so a
      // date-only `plannedReturnAt` / a `@db.Date` never shows "02:00".
      odjazdPlan: row.delegationDepartureAt
        ? toDateString(row.delegationDepartureAt)
        : null,
      odjazdFakt: row.delegationActualDepartureAt
        ? toDateString(row.delegationActualDepartureAt)
        : null,
      // Zjazd: planowany → faktyczny.
      zjazdPlan: row.delegationPlannedReturnAt
        ? toDateString(row.delegationPlannedReturnAt)
        : null,
      zjazdFakt: row.delegationActualReturnAt
        ? toDateString(row.delegationActualReturnAt)
        : null,
      deeplink,
      ...(korekty.length > 0 ? { korekty } : {}),
    });
  }

  /**
   * Builds the «Korekty weryfikatora» diff for the Maksim confirmation email —
   * the carrier's original submit data (`orig*` snapshots) vs the
   * currently-applied (verified) values on the row. Emits ONE preformatted
   * `{label, from, to}`
   * row per field the verifier actually changed; a field whose `orig*` snapshot
   * is `null` (legacy row) or equals the current value is skipped. When nothing
   * changed the array is empty and the caller omits the section entirely.
   *
   * Rows (in display order):
   *  - Okres      — origDateStart/origDateEnd vs dateStart/dateEnd (dd.MM.yyyy,
   *                 a single combined row emitted when EITHER boundary differs),
   *  - Godziny    — origTimeFrom/origTimeTo vs timeFrom/timeTo (HH:mm range),
   *  - Przebieg   — origMileage vs mileage ('X km'),
   *  - Korekta godzin — origHoursAdjusted vs hoursAdjustedValue ('X h'),
   *  - Dopłata    — origPaymentEur vs paymentEur (EUR, 2dp).
   *
   * Pure projection — no IO. Kept out of the template so the JSX stays pure.
   */
  private _buildAuthorizationKorekty(
    row: ClaimRow,
  ): Array<{ label: string; from: string; to: string }> {
    const korekty: Array<{ label: string; from: string; to: string }> = [];

    // Okres — single row when either boundary moved (needs both orig snapshots).
    if (row.origDateStart !== null && row.origDateEnd !== null) {
      const startMoved = !sameUtcDay(row.origDateStart, row.dateStart);
      const endMoved = !sameUtcDay(row.origDateEnd, row.dateEnd);
      if (startMoved || endMoved) {
        korekty.push({
          label: 'Okres',
          from: `${formatDdMmYyyy(row.origDateStart)} – ${formatDdMmYyyy(row.origDateEnd)}`,
          to: `${formatDdMmYyyy(row.dateStart)} – ${formatDdMmYyyy(row.dateEnd)}`,
        });
      }
    }

    // Godziny — single combined range row when either bound differs.
    if (row.origTimeFrom !== null && row.origTimeTo !== null) {
      if (row.origTimeFrom !== row.timeFrom || row.origTimeTo !== row.timeTo) {
        korekty.push({
          label: 'Godziny',
          from: `${row.origTimeFrom} – ${row.origTimeTo}`,
          to: `${row.timeFrom} – ${row.timeTo}`,
        });
      }
    }

    // Przebieg.
    if (row.origMileage !== null && row.origMileage !== row.mileage) {
      korekty.push({
        label: 'Przebieg',
        from: `${row.origMileage} km`,
        to: `${row.mileage} km`,
      });
    }

    // Korekta godzin (hours-adjustment).
    if (
      row.origHoursAdjusted !== null &&
      row.origHoursAdjusted !== (row.hoursAdjustedValue ?? 0)
    ) {
      korekty.push({
        label: 'Korekta godzin',
        from: `${row.origHoursAdjusted} h`,
        to: `${row.hoursAdjustedValue ?? 0} h`,
      });
    }

    // Dopłata — orig submit-time payment vs the currently-applied km-calc.
    if (
      row.origPaymentEur !== null &&
      round2(row.origPaymentEur) !== round2(row.paymentEur)
    ) {
      korekty.push({
        label: 'Dopłata',
        from: `${row.origPaymentEur.toFixed(2)} EUR`,
        to: `${row.paymentEur.toFixed(2)} EUR`,
      });
    }

    return korekty;
  }

  /**
   * Resolves the carrier's display name (user.name with login fallback) for
   * the Maksim confirmation email. Falls back to the carrier ID slice if the FK
   * chain is broken — defensive only; should never happen in practice.
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

    // REWORK 2026-07-30 — when the carrier has picked an outing we still run
    // the SAME gates submit will (ownership, `zjechal`, not-already-claimed,
    // guarantee), so a blocker surfaces before the carrier finishes typing; the
    // numbers priced are the carrier's own period/times/mileage. VEHICLE,
    // TRAILER and DRIVER stay derived from the outing. When `delegationId` is
    // absent (the existing-claim / verifier inspection path reaching this method
    // directly), we fall back to a caller-supplied `vehicleId` + dates —
    // ownership re-checked defence-in-depth.
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
    // Times come from the persisted claim (the preview body no longer carries
    // `timeFrom`/`timeTo`); pass the loaded row so the live math keeps the
    // claim's fractional-boundary window for mileage/date/hours edits.
    return this._runPreviewCalc(dto, null, allowMileageOverride, claim);
  }

  /**
   * Pure math entry point for both preview routes. No role checks, no
   * ownership checks — callers are responsible for gating access before
   * invoking this helper. Mirrors the calc + envelope built historically
   * inside `previewKmCalc` so behaviour is byte-identical for the carrier.
   *
   * `ctx` (the delegation-derived context) drives the carrier new-claim path:
   * the period, the TIMES, the vehicle backing the mileage sum, and the
   * read-only vehicle/trailer/driver `delegationContext` all come from the
   * outing. When `ctx` is null, the existing-claim path runs off the body's
   * `dateStart`/`dateEnd` (+ optional `vehicleId` for the mileage sum); its
   * `timeFrom`/`timeTo` come from a VERIFIER-supplied `dto.timeFrom`/`timeTo`
   * (live-recalc of an unsaved pracownik time edit — gated by
   * `allowMileageOverride`, the same verifier gate as the mileage override),
   * falling back to `existingClaim`'s persisted times.
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
    ctx: DelegationContext | null = null,
    allowMileageOverride = false,
    existingClaim: ClaimRow | null = null,
  ): Promise<PreviewClaimResponse> {
    // Period is ALWAYS caller-supplied now (REWORK 2026-07-30): the carrier
    // types it on the new-claim path, the verifier edits it on the inspection
    // path. A half-filled form yields nulls and prices to zero — no throw.
    const dateStart = isoDateToMidnightUtc(dto.dateStart ?? '');
    const dateEnd = isoDateToMidnightUtc(dto.dateEnd ?? '');
    const dateStartIso = dateStart ? toIsoDateOnly(dateStart) : (dto.dateStart ?? '');
    const dateEndIso = dateEnd ? toIsoDateOnly(dateEnd) : (dto.dateEnd ?? '');

    // Times, three cases:
    //  • ctx (carrier new-claim path): the times the carrier just typed. They
    //    are what submit will persist, so the live preview must price them.
    //  • VERIFIER existing-claim path (`allowMileageOverride` — the SAME gate that
    //    honours the mileage override, i.e. `pracownik`/`admin`): honour a
    //    caller-supplied `dto.timeFrom/timeTo` so the ClaimModal live-recalcs an
    //    UNSAVED time edit, falling back to the persisted claim's times.
    //  • `przewoznik` reklamacja inspection (override NOT allowed): the persisted
    //    claim's times — a decided claim's facts are not re-typed here.
    const timeFrom = ctx
      ? (dto.timeFrom ?? null)
      : allowMileageOverride
        ? (dto.timeFrom ?? existingClaim?.timeFrom ?? null)
        : (existingClaim?.timeFrom ?? null);
    const timeTo = ctx
      ? (dto.timeTo ?? null)
      : allowMileageOverride
        ? (dto.timeTo ?? existingClaim?.timeTo ?? null)
        : (existingClaim?.timeTo ?? null);

    const calc = await this.kmCalc.calc({
      dateStart: dateStartIso,
      dateEnd: dateEndIso,
      timeFrom,
      timeTo,
      hoursAdjusted: dto.hoursAdjusted ?? 0,
    });

    // Mileage resolution (REWORK 2026-07-30 — the daily-km board is no longer
    // the source of a claim's mileage, only the verifier's reference):
    //  • carrier new-claim path (`ctx`): the mileage the carrier just typed —
    //    exactly what submit will persist. Absent mid-form ⇒ 0.
    //  • VERIFIER inspection path (`allowMileageOverride`): a supplied
    //    `dto.mileage` REPLACES the persisted one so the ClaimModal tracks a km
    //    edit before the PATCH commits — mirroring `_recalcClaim`.
    //  • any other existing-claim read (`przewoznik` reklamacja inspection):
    //    the claim's own persisted mileage.
    //  • bare-vehicle path (no ctx, no claim — legacy/diagnostic): fall back to
    //    the daily-km sum, the only number available there.
    const mileage = ctx
      ? (dto.mileage ?? 0)
      : allowMileageOverride && dto.mileage !== undefined
        ? dto.mileage
        : existingClaim
          ? existingClaim.mileage
          : dateStart && dateEnd && dto.vehicleId
            ? await this._resolveMileage(dto.vehicleId, dateStart, dateEnd)
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
        // Credited fraction of the boundary days (RAW, pre `hoursAdjusted`) so
        // the carrier new-claim / verifier live preview can render "ile z
        // pierwszego / ostatniego dnia zaliczono" without re-deriving the walk.
        firstDay: calc.firstDay,
        lastDay: calc.lastDay,
      },
      // Echoed only on the carrier new-claim path. The period/time window are
      // now the carrier's own input (REWORK 2026-07-30) — echoing them keeps the
      // response self-describing (what was priced) and lets the form assert it
      // is showing numbers for the values it sent. The vehicle/trailer/driver
      // block still comes from the outing: that part IS derived.
      ...(ctx
        ? {
            dateStart: dateStartIso,
            dateEnd: dateEndIso,
            ...(timeFrom ? { timeFrom } : {}),
            ...(timeTo ? { timeTo } : {}),
            delegationContext: this._buildDelegationContext(ctx.delegation),
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

  /**
   * `POST /claims/:nrZgl/reklamacja` — the carrier disputes a DECIDED wniosek
   * (docs/13-api-design.md#claims, docs/01-overview.md §5).
   *
   * REWORK 2026-07-31 — the reklamacja is AMOUNT + REASON only (no data
   * amendment). Gate order, first failure wins:
   *
   *   1. 404 — no such wniosek;
   *   2. 403 — not the carrier's own wniosek;
   *   3. 409 `REKLAMACJA_ALREADY_SUBMITTED` — one reklamacja per wniosek, ever;
   *   4. 422 `REKLAMACJA_CLAIM_NOT_DECIDED` — status ∉ {ZAAKCEPTOWANO, ODRZUCONO};
   *   5. 422 `REKLAMACJA_WINDOW_EXPIRED`   — past 48 h from `statusChangedAt`;
   *   6. 422 `REKLAMACJA_NO_DELTA`         — nothing left unpaid to claim;
   *   7. 422 `REKLAMACJA_AMOUNT_EXCEEDS_CAP` — kwota > cap (STRICT, cents).
   *
   * Steps 3-6 are decided by `getReklamacjaEligibility` from
   * `@magguarantee/shared` — the SAME predicate the carrier UI evaluates, so the
   * sheet never offers a ceiling the api then refuses (that drift is exactly what
   * this rework removes; the ceiling formula now lives ONLY in
   * `domain/reklamacja-rules.ts`).
   *
   * Persistence runs on the AMBIENT `@Audit('submitReklamacja')` transaction
   * (`setBefore` + `updateWithin(prisma.tx)`) so the row write and the audit row
   * commit atomically — mirror of `update()`. Emails are fire-and-forget AFTER
   * the tx commits.
   */
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

    // ONE `Date` instance for both `statusChangedAt` and `reklamacjaSubmittedAt`
    // — and the same clock the eligibility window is measured against.
    const now = new Date();
    const eligibility = getReklamacjaEligibility(
      {
        status: claim.status,
        origPaymentEur: claim.origPaymentEur,
        paymentEur: claim.paymentEur,
        amountApproved: claim.amountApproved,
        reklamacjaSubmitted: claim.reklamacjaSubmitted,
        statusChangedAt: claim.statusChangedAt,
      },
      now,
    );
    this._assertReklamacjaEligible(claim, eligibility);
    this._assertReklamacjaWithinCap(dto.kwotaReklamacji, eligibility.maxAmount);

    AuditContext.setBefore(this._snapshotForAudit(claim));
    const txLike = this.prisma.tx as unknown as TransactionLike;
    const updated = await this.claims.updateWithin(txLike, claim.id, {
      reklamacjaSubmitted: true,
      reklamacjaText: dto.tresc,
      reklamacjaAmount: dto.kwotaReklamacji,
      // Carrier's filing stamp. Deliberately NOT derivable from
      // `statusChangedAt`: the decision re-stamps that when it rolls the status
      // back to `statusBeforeReklamacja`.
      reklamacjaSubmittedAt: now,
      status: 'REKLAMACJA',
      statusChangedAt: now,
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

    void this._notifyReklamacjaSubmitted(updated, eligibility.maxAmount).catch(
      (err) => {
        this.logger.error({
          msg: 'claims.reklamacja.notify_failed',
          nrZgl: updated.nrZgl,
          error: err instanceof Error ? err.message : String(err),
        });
      },
    );

    return this.toDto(updated);
  }

  /**
   * Translates a blocked `getReklamacjaEligibility` verdict into the documented
   * HTTP error (docs/13-api-design.md — `POST /claims/:nrZgl/reklamacja`). Every
   * throw carries the stable machine code BOTH top-level (for the in-process
   * unit tests reading `getResponse().code`) and under `extensions` (the only
   * place the global `ProblemDetailsFilter` forwards to the wire, which is what
   * the web keys on) — the established `_assertDelegationReturned` shape.
   *
   * ONE service-side refinement over the shared precedence: a claim that already
   * carries a reklamacja reports the 409 one-shot conflict even when its status
   * is not a decided one (i.e. the reklamacja is still PENDING in `REKLAMACJA`,
   * where the shared helper reports `NOT_DECIDED`). «Already submitted» is the
   * actionable truth for a carrier double-submitting from two tabs; the UI never
   * reaches this path because it hides the CTA on `reklamacjaSubmitted`.
   *
   * Pure guard — no IO.
   */
  private _assertReklamacjaEligible(
    claim: ClaimRow,
    eligibility: ReklamacjaEligibility,
  ): void {
    if (eligibility.canFile) return;

    if (
      eligibility.blockedReason === 'ALREADY_SUBMITTED' ||
      claim.reklamacjaSubmitted
    ) {
      throw new ConflictException({
        code: REKLAMACJA_ALREADY_SUBMITTED,
        message: 'Reklamacja została już złożona dla tego wniosku.',
        extensions: { code: REKLAMACJA_ALREADY_SUBMITTED },
      });
    }

    switch (eligibility.blockedReason) {
      case 'NOT_DECIDED':
        throw new UnprocessableEntityException({
          code: REKLAMACJA_CLAIM_NOT_DECIDED,
          message:
            'Reklamację można złożyć tylko dla wniosku zaakceptowanego lub odrzuconego.',
          extensions: { code: REKLAMACJA_CLAIM_NOT_DECIDED },
        });
      case 'WINDOW_EXPIRED':
        throw new UnprocessableEntityException({
          code: REKLAMACJA_WINDOW_EXPIRED,
          message:
            'Czas na złożenie reklamacji minął. Reklamację można złożyć ' +
            `maksymalnie ${REKLAMACJA_WINDOW_HOURS} godzin od rozpatrzenia wniosku.`,
          extensions: {
            code: REKLAMACJA_WINDOW_EXPIRED,
            ...(eligibility.deadlineAt
              ? { deadlineAt: eligibility.deadlineAt.toISOString() }
              : {}),
          },
        });
      case 'NO_DELTA':
        throw new UnprocessableEntityException({
          code: REKLAMACJA_NO_DELTA,
          message:
            'Brak kwoty do reklamacji — wypłacona kwota odpowiada kwocie wnioskowanej.',
          extensions: { code: REKLAMACJA_NO_DELTA },
        });
      default:
        // Defensive: `canFile === false` always carries a reason. Never reached.
        throw new UnprocessableEntityException({
          code: REKLAMACJA_CLAIM_NOT_DECIDED,
          message: 'Reklamacji nie można złożyć dla tego wniosku.',
          extensions: { code: REKLAMACJA_CLAIM_NOT_DECIDED },
        });
    }
  }

  /**
   * Ceiling gate — STRICT at cent precision (the legacy `+1 €` tolerance is
   * gone). The comparison itself lives in `@magguarantee/shared`
   * (`isWithinReklamacjaCap`) so the api and the carrier form agree to the cent.
   * Positivity is Zod's job (`SubmitReklamacjaSchema.kwotaReklamacji > 0`).
   *
   * The 422 carries the ceiling in the message AND, machine-readably, in
   * `extensions.maxAmount` so the form can re-render its hint without parsing
   * Polish prose. Pure guard — no IO.
   */
  private _assertReklamacjaWithinCap(
    kwota: number,
    maxAmount: number,
  ): void {
    if (isWithinReklamacjaCap(kwota, maxAmount)) return;
    throw new UnprocessableEntityException({
      code: REKLAMACJA_AMOUNT_EXCEEDS_CAP,
      message:
        `Kwota reklamacji (${kwota.toFixed(2)} €) przekracza maksimum ` +
        `(${maxAmount.toFixed(2)} €).`,
      extensions: {
        code: REKLAMACJA_AMOUNT_EXCEEDS_CAP,
        maxAmount: round2(maxAmount),
      },
    });
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
    const dto = this.toDto(row);
    return {
      ...dto,
      verifierMileage: await this._resolveVerifierMileage(user, row),
    };
  }

  /**
   * Σ daily-km over the WERYFIKATOR's actual window — the reference figure the
   * ClaimModal shows beside the carrier's declared mileage (REWORK 2026-07-30).
   *
   * Deliberately narrow:
   *  - verifier roles only (a carrier must not be handed the other system's
   *    number — the two disagree by design and it is not what it is paid on);
   *  - detail only (one aggregate per opened claim, never per list row);
   *  - `null` unless the outing carries BOTH actual datetimes, so a partial
   *    window never produces a misleading half-sum.
   */
  private async _resolveVerifierMileage(
    user: AuthUser,
    row: ClaimRow,
  ): Promise<number | null> {
    if (user.role === 'przewoznik') return null;
    const from = row.delegationActualDepartureAt;
    const to = row.delegationActualReturnAt;
    if (!from || !to || !row.vehicleId) return null;
    return this._resolveMileage(
      row.vehicleId,
      startOfUtcDay(from),
      startOfUtcDay(to),
    );
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
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      verifiedById: row.verifiedById,
      verifiedBy: row.verifiedBy,
      comment: row.comment,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate ? toDateString(row.orderDate) : null,
      amountApproved: row.amountApproved,
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      reklamacjaText: row.reklamacjaText,
      reklamacjaResponse: row.reklamacjaResponse,
      reklamacjaAmount: row.reklamacjaAmount,
      // Reklamacja OUTCOME + its audit stamps. `reklamacjaResolution === null`
      // means "never filed" OR "pending" — the web disambiguates with
      // `reklamacjaSubmitted` / `status === 'REKLAMACJA'`, never by guessing from
      // the (rolled-back) status.
      reklamacjaResolution: row.reklamacjaResolution,
      reklamacjaOrderNumber: row.reklamacjaOrderNumber,
      reklamacjaSubmittedAt: row.reklamacjaSubmittedAt
        ? row.reklamacjaSubmittedAt.toISOString()
        : null,
      reklamacjaDecidedAt: row.reklamacjaDecidedAt
        ? row.reklamacjaDecidedAt.toISOString()
        : null,
      statusBeforeReklamacja: row.statusBeforeReklamacja,
      origDateStart: row.origDateStart
        ? row.origDateStart.toISOString()
        : null,
      origDateEnd: row.origDateEnd ? row.origDateEnd.toISOString() : null,
      origMileage: row.origMileage,
      // Immutable submit-time payment snapshot — Decimal(12,2) already narrowed
      // to `number | null` by the repository's `decimalToNumber`.
      origPaymentEur: row.origPaymentEur,
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
      // Maksim authorization gate — surfaced so the web renders the block /
      // "wgraj potwierdzenie" CTA without re-deriving from paymentEur.
      maksimGateRequired: row.maksimGateRequired,
      maksimGateNotifiedAt: row.maksimGateNotifiedAt
        ? row.maksimGateNotifiedAt.toISOString()
        : null,
      maksimGateClearedAt: row.maksimGateClearedAt
        ? row.maksimGateClearedAt.toISOString()
        : null,
      attachments: row.attachments.map((a) => ({
        id: a.id,
        category: a.category,
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
      // Departure side of the same pair (REWORK 2026-07-30) — the declared
      // departure is the floor the api enforces on the carrier's `dateStart`;
      // the actual one is the weryfikator's figure the ClaimModal shows beside
      // the carrier's declaration.
      delegationDepartureAt: row.delegationDepartureAt
        ? row.delegationDepartureAt.toISOString()
        : null,
      delegationActualDepartureAt: row.delegationActualDepartureAt
        ? row.delegationActualDepartureAt.toISOString()
        : null,
      // Verifier-only, detail-only — `getOne` fills it in for verifier roles.
      verifierMileage: null,
      // Linked-outing lifecycle status — surfaced so the pracownik ClaimModal
      // renders the read-only "w trasie" banner and the FE in-transit gate keys
      // off the SAME field the API gates on. `null` when no linked outing.
      delegationStatus: row.delegationStatus,
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
      // The immutable submit-time figure — the ONLY honest answer to "how much
      // did the carrier ask for", since `paymentEur` above is rewritten by every
      // verifier correction and delegation recalc.
      origPaymentEur: row.origPaymentEur,
      amountApproved: row.amountApproved,
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      // Outcome chip on the employee table (docs/14 §6.5.15) — `null` +
      // `reklamacjaSubmitted` ⇒ «Reklamacja w toku».
      reklamacjaResolution: row.reklamacjaResolution,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ── Internals ───────────────────────────────────────────

  // ── update() helpers (Phase 4) ──────────────────────────

  /**
   * Loads the claim, RESOLVES the wire-only synthetic literals into the
   * effective `ClaimStatus`, validates the transition + per-target required
   * fields, and returns both. Throws 404 on missing claim, 422 on illegal
   * transition (via state machine) / on a `REKLAMACJA_*` target without a pending
   * reklamacja, 400 on cross-field invariant violation (missing required fields
   * per docs/01-overview.md#weryfikacja-wniosku).
   *
   * Order matters:
   *   1. 404 — the claim must exist;
   *   2. 422 `REKLAMACJA_NOT_PENDING` — a `REKLAMACJA_*` target on a claim that
   *      is NOT in `REKLAMACJA`. This MUST precede the state-machine check:
   *      `NA_WERYFIKACJI → ZAAKCEPTOWANO` is a legal edge, so without this guard
   *      a synthetic reklamacja-accept on a fresh claim would sail through as a
   *      fresh accept — while skipping the recalc, the compensation-due guard and
   *      the Maksim gate (all exempt on reklamacja branches) and writing a bogus
   *      `reklamacjaResolution`;
   *   3. state machine on the RESOLVED target;
   *   4. per-branch required fields.
   */
  private async _validateClaimUpdate(
    nrZgl: string,
    dto: UpdateClaimDto,
  ): Promise<{ existing: ClaimRow; target: ClaimStatus }> {
    const existing = await this.claims.findByNrZgl(nrZgl);
    if (!existing) {
      throw new NotFoundException('Wniosek nie znaleziony');
    }

    this._assertReklamacjaPending(existing, dto);
    const targetStatus = resolveUpdateTarget(dto.targetStatus, existing);

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

    // Reklamacja-accept needs the «Nr zlecenia» the dopłata is paid under (DB
    // CHECK `claim_reklamacja_resolution_complete` enforces the same invariant;
    // the amount is NOT sent anymore — it is the carrier's frozen
    // `reklamacjaAmount`). Reklamacja-reject needs only the rejection comment
    // (already required by the Zod schema). Re-checked here so the service stays
    // correct when called from tests / non-HTTP paths that bypass the pipe.
    if (
      dto.targetStatus === 'REKLAMACJA_ZAAKCEPTOWANO' &&
      (!dto.reklamacjaOrderNumber || dto.reklamacjaOrderNumber.trim() === '')
    ) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message:
          'Numer zlecenia jest wymagany przy uznaniu reklamacji.',
      });
    }

    return { existing, target: targetStatus };
  }

  /**
   * Guards the synthetic `REKLAMACJA_*` PATCH targets: they are only meaningful
   * while a reklamacja is PENDING, i.e. `status === 'REKLAMACJA'` (a pending
   * reklamacja is defined by the STATUS, not by `reklamacjaResolution IS NULL` —
   * NULL also means "never filed"). No-op for the plain decision targets.
   *
   * 422 `REKLAMACJA_NOT_PENDING`, machine code both top-level and under
   * `extensions` (the `_assertDelegationReturned` shape). Pure guard — no IO.
   */
  private _assertReklamacjaPending(
    existing: ClaimRow,
    dto: UpdateClaimDto,
  ): void {
    if (!isReklamacjaTarget(dto.targetStatus)) return;
    if (existing.status === 'REKLAMACJA') return;
    throw new UnprocessableEntityException({
      code: REKLAMACJA_NOT_PENDING,
      message: 'Ten wniosek nie ma reklamacji oczekującej na rozpatrzenie.',
      extensions: { code: REKLAMACJA_NOT_PENDING },
    });
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
    dto: UpdateClaimDto | VerifyClaimDto,
  ): Promise<RecalcOutputs | null> {
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
      // Credited fraction of the period's first/last calendar day (RAW, pre
      // `hoursAdjusted`) — surfaced so the "Miesiąc" block can show exactly how
      // much of each boundary day was counted without re-deriving the walk.
      firstDay: calc.firstDay,
      lastDay: calc.lastDay,
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
   * Scope: the FRESH accept (`targetStatus === 'ZAAKCEPTOWANO'`) ONLY.
   *
   * `REKLAMACJA_ZAAKCEPTOWANO` is EXEMPT (REWORK 2026-07-31, docs/14 §6.5.15 D):
   * an uznana reklamacja pays the carrier's FIXED `reklamacjaAmount` — set at
   * submit and already capped by `origPaymentEur − alreadyPaid` — which is
   * independent of the km-calc. A wniosek REJECTED precisely because the calc
   * showed no under-run (`kmDifference <= 0`) can still legitimately have its
   * reklamacja uznana, and the km-calc numbers are frozen on that branch anyway
   * (no recalc runs). Gating it would make the outcome unreachable.
   *
   * `ODRZUCONO` / `REKLAMACJA_ODRZUCONO` (and any other transition) are likewise
   * NOT gated — a "no under-run" claim can always be rejected.
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
    if (dto.targetStatus !== 'ZAAKCEPTOWANO') return;

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
   * Applies the verifier's correction fields + optional recalc outputs onto a
   * mutable `UpdateClaimData` patch. Shared by BOTH the decision PATCH
   * (`_buildUpdatePatch`) and the verification checkpoint (`verifyClaim`) so the
   * field-by-field persist rules live in exactly one place (both call sites MUST
   * pass the SAME `existing` row they loaded, so the two paths get byte-identical
   * value-based behaviour):
   *
   *  - date edits set `periodAdjustedByVerifier=true` + reset `autoRecalcState`
   *    to `'none'` ONLY when the supplied `dateStart`/`dateEnd` actually DIFFERS
   *    (by UTC calendar day) from the value already on `existing`. The verify
   *    form always re-sends the current (prefilled) dates, so mere PRESENCE must
   *    NOT latch the flag — that would gate out the late-`zjechał`
   *    `recalcFromDelegation` (which requires `periodAdjustedByVerifier===false`)
   *    on every no-op re-verify. When neither boundary actually moved, both the
   *    flag and `autoRecalcState` are left untouched,
   *  - a `hoursAdjusted` correction writes ONLY `hoursAdjustedValue` (the
   *    immutable carrier snapshot `origHoursAdjusted` is never touched),
   *  - when the math re-ran (`recalc != null`) the km-calc outputs are written,
   *    so a stale `paymentEur` never leaks into the kwota-Maksima email or the
   *    reklamacja amount cap.
   *
   * Pure mutation — no IO, no throws.
   */
  private _applyCorrectionsToPatch(
    patch: UpdateClaimData,
    corrections: ExtractedCorrections,
    recalc: RecalcOutputs | null,
    existing: ClaimRow,
  ): void {
    const parsedStart = corrections.dateStart
      ? isoDateToMidnightUtc(corrections.dateStart)
      : null;
    const parsedEnd = corrections.dateEnd
      ? isoDateToMidnightUtc(corrections.dateEnd)
      : null;
    // Writing an identical value is a harmless no-op — only the FLAG guard below
    // is value-based. `patch.dateStart`/`dateEnd` are still assigned from any
    // supplied (parseable) date so the recalc outputs stay consistent.
    if (parsedStart) patch.dateStart = parsedStart;
    if (parsedEnd) patch.dateEnd = parsedEnd;
    // A human edited the PERIOD (`dateStart`/`dateEnd`) — mark it so a later
    // delegation `zjechal` auto-recalc no longer overwrites the correction, and
    // reset `autoRecalcState` to `none` (the flagged attention is now handled).
    // VALUE-based: only when a parsed boundary actually differs from the stored
    // day. A verify that re-sends the prefilled (unchanged) dates leaves BOTH
    // `periodAdjustedByVerifier` and `autoRecalcState` untouched.
    const startChanged =
      parsedStart !== null && !sameUtcDay(parsedStart, existing.dateStart);
    const endChanged =
      parsedEnd !== null && !sameUtcDay(parsedEnd, existing.dateEnd);
    if (startChanged || endChanged) {
      patch.periodAdjustedByVerifier = true;
      patch.autoRecalcState = 'none';
    }
    if (corrections.timeFrom) patch.timeFrom = corrections.timeFrom;
    if (corrections.timeTo) patch.timeTo = corrections.timeTo;
    if (corrections.mileage !== undefined) patch.mileage = corrections.mileage;
    if (corrections.hoursAdjusted !== undefined) {
      // Drives ONLY `hoursAdjustedValue` — `origHoursAdjusted` is the immutable
      // carrier snapshot, never written here. Prisma coerces `number` →
      // `Decimal(5,2)`; the DTO range is bounded by `HoursAdjustedSchema`.
      patch.hoursAdjustedValue = corrections.hoursAdjusted;
    }

    // km-calc outputs — only when the math actually re-ran.
    if (recalc) {
      patch.drivenDays = recalc.drivenDays;
      patch.kmPerDay = recalc.kmPerDay;
      patch.kmGuaranteed = recalc.kmGuaranteed;
      patch.kmDifference = recalc.kmDifference;
      patch.paymentEur = recalc.paymentEur;
      patch.ratePerKmEffective = recalc.ratePerKmEffective;
      patch.breakdown = recalc.breakdown;
    }
  }

  /**
   * Composes the actual `UpdateClaimData` patch from the validated DTO, the
   * RESOLVED target status and the optional recalc output. Pure function — no IO,
   * no throws. Tested indirectly via the update() spec.
   *
   * `target` is supplied by the caller (resolved in `_validateClaimUpdate`) — the
   * reklamacja branches resolve it to `statusBeforeReklamacja`, so this method
   * must not re-derive it.
   */
  private _buildUpdatePatch(
    existing: ClaimRow,
    dto: UpdateClaimDto,
    recalc: RecalcOutputs | null,
    user: AuthUser,
    target: ClaimStatus,
  ): UpdateClaimData {
    const patch: UpdateClaimData = {};
    // ⚠️ ONE `Date` instance for the whole patch. On a reklamacja decision
    // `statusChangedAt` and `reklamacjaDecidedAt` MUST be byte-identical — the
    // weekly report tells a reklamacja-driven status rollback apart from a fresh
    // decision by that exact equality (see
    // `WeeklyReportRepository.windowStats`).
    const now = new Date();

    // Status & workflow.
    patch.status = target;
    patch.statusChangedAt = now;
    // `decidedById` records who decided the WNIOSEK. A reklamacja decision must
    // NOT overwrite it — that actor goes to `reklamacjaDecidedById` below, so the
    // original decision stays attributable (and the ClaimModal keeps showing the
    // right person next to the wniosek decision).
    if (!isReklamacjaTarget(dto.targetStatus)) patch.decidedById = user.sub;

    // Correction fields + recalc outputs — the SAME logic the verification
    // checkpoint (`verifyClaim`) applies. Extracted into `_applyCorrectionsToPatch`
    // so both paths stay byte-identical (no duplicated field-by-field rules).
    const corrections = extractCorrectionFields(dto);
    this._applyCorrectionsToPatch(patch, corrections, recalc, existing);

    // Decision payload per discriminator branch.
    switch (dto.targetStatus) {
      case 'ZAAKCEPTOWANO':
        patch.orderNumber = dto.orderNumber;
        patch.orderDate = isoDateToMidnightUtc(dto.orderDate);
        patch.amountApproved = dto.amountApproved;
        if (dto.comment !== undefined) patch.comment = dto.comment ?? null;
        break;
      case 'ODRZUCONO':
        patch.comment = dto.comment;
        break;
      // ── Reklamacja resolutions (REWORK 2026-07-31) ──────────
      // BOTH outcomes roll `status` back to `statusBeforeReklamacja` (already in
      // `target`); the outcome itself lives ONLY in `reklamacjaResolution`.
      // Deliberately NOT touched here: `amountApproved`, `orderNumber`,
      // `orderDate`, `paymentEur`, `comment` and `decidedById` — the wniosek's own
      // decision and payout stay exactly as they were, which is also what keeps
      // the DB CHECK `claim_accepted_payment_complete` trivially satisfied on the
      // `ODRZUCONO → REKLAMACJA → uznana` path (the pre-rework code violated it
      // there by flipping the status to ZAAKCEPTOWANO without a payout).
      case 'REKLAMACJA_ZAAKCEPTOWANO':
        patch.reklamacjaResolution = 'UZNANA';
        // «Nr zlecenia» the dopłata is paid under. Independent of the wniosek's
        // own `orderNumber` (the UI merely prefills from it).
        patch.reklamacjaOrderNumber = dto.reklamacjaOrderNumber;
        patch.reklamacjaDecidedAt = now;
        patch.reklamacjaDecidedById = user.sub;
        // Optional staff note. The PAID amount is the carrier's frozen
        // `reklamacjaAmount` — staff no longer set one.
        if (dto.comment !== undefined) {
          patch.reklamacjaResponse = dto.comment ?? null;
        }
        break;
      case 'REKLAMACJA_ODRZUCONO':
        patch.reklamacjaResolution = 'ODRZUCONA';
        // Required by the schema — this IS the rejection justification.
        patch.reklamacjaResponse = dto.comment;
        patch.reklamacjaDecidedAt = now;
        patch.reklamacjaDecidedById = user.sub;
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
    target: ClaimStatus,
  ): Partial<UpdateClaimData> {
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
      // Verification checkpoint — captured so the before/after diff shows the
      // «Zapisz weryfikację» stamp (and the auto-recalc reset to null).
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      verifiedById: row.verifiedById,
      // Maksim authorization gate — captured so the History diff shows the
      // arm/notify/clear transitions (and the auto-recalc lockstep reset).
      maksimGateRequired: row.maksimGateRequired,
      maksimGateNotifiedAt: row.maksimGateNotifiedAt?.toISOString() ?? null,
      maksimGateClearedAt: row.maksimGateClearedAt?.toISOString() ?? null,
      maksimGateClearedById: row.maksimGateClearedById,
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
      amountApproved: row.amountApproved,
      // Reklamacja — the WHOLE block, so the History diff shows the carrier's
      // filing (text / kwota / submittedAt / status snapshot) and the staff
      // resolution (UZNANA|ODRZUCONA / nr zlecenia / response / who + when) as
      // two legible steps. `reklamacjaResolution` is the ONLY place the outcome
      // lives — the status rolls back, so the diff of `status` alone would read
      // as "nothing happened".
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      reklamacjaText: row.reklamacjaText,
      reklamacjaResponse: row.reklamacjaResponse,
      reklamacjaAmount: row.reklamacjaAmount,
      reklamacjaResolution: row.reklamacjaResolution,
      reklamacjaOrderNumber: row.reklamacjaOrderNumber,
      reklamacjaSubmittedAt: row.reklamacjaSubmittedAt?.toISOString() ?? null,
      reklamacjaDecidedAt: row.reklamacjaDecidedAt?.toISOString() ?? null,
      reklamacjaDecidedById: row.reklamacjaDecidedById,
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

  /**
   * Reklamacja FILED — two emails (docs/16-jobs-and-integrations.md §Email-шаблоны):
   *
   *  - `reklamacja-internal-submitted` → EVERY active `admin` + `pracownik` (the
   *    staff who can actually act on it). Recipients come from
   *    `_collectClaimRecipients().openerEmails`, which is exactly that query
   *    (`role in [admin,pracownik] AND active AND deletedAt: null`), already
   *    email-validated and lower-cased. The old `_collectReklamacjaRecipients`
   *    took only the FIRST admin (`findFirst`) — a plain bug: on a team of three
   *    admins two never learned about the reklamacja.
   *  - `reklamacja-carrier-submitted` → the carrier, as a receipt.
   *
   * `maxAmount` is the ceiling the eligibility helper computed for this claim —
   * passed through so the internal email can show «wnioskowana / wypłacona /
   * maksimum» without the template re-deriving the formula.
   *
   * Fire-and-forget AFTER the audit tx committed, so every read goes through
   * `this.prisma.client` (root), never `prisma.tx` — see
   * `_collectClaimRecipients`.
   */
  private async _notifyReklamacjaSubmitted(
    row: ClaimRow,
    maxAmount: number,
  ): Promise<void> {
    if (!this.mailService) {
      this.logger.warn({
        msg: 'claims.reklamacja.no_mail_service',
        nrZgl: row.nrZgl,
      });
      return;
    }
    const targets = await this._collectClaimRecipients(row);
    const internal = [...targets.openerEmails];
    if (!targets.carrierEmail && internal.length === 0) {
      this.logger.warn({
        msg: 'claims.reklamacja.no_recipients',
        nrZgl: row.nrZgl,
      });
      return;
    }

    const appUrl = this._appUrl();
    const carrierName = await this._resolveCarrierDisplayName(row.carrierId);
    const nz = encodeURIComponent(row.nrZgl);
    const kwota = (row.reklamacjaAmount ?? 0).toFixed(2);
    const tresc = row.reklamacjaText ?? '';
    const warn = (msg: string) => (err: unknown) =>
      this.logger.warn({
        msg,
        nrZgl: row.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });

    for (const email of internal) {
      void this.mailService
        .enqueueReklamacjaInternalSubmitted(email, {
          nrZgl: row.nrZgl,
          carrierName,
          vehiclePlate: row.vehiclePlateSnapshot,
          kwota,
          // Context for the decision: what was asked, what was paid, what is
          // still claimable. `origPaymentEur` is the ONLY honest "requested"
          // figure (`paymentEur` is rewritten by every verifier correction).
          wnioskowana: (row.origPaymentEur ?? row.paymentEur).toFixed(2),
          wyplacona:
            row.statusBeforeReklamacja === 'ZAAKCEPTOWANO'
              ? (row.amountApproved ?? 0).toFixed(2)
              : '0.00',
          maksimum: maxAmount.toFixed(2),
          tresc,
          // Employee list deeplink — same `?nrZgl=` pattern the other internal
          // claim mails use to open the ClaimModal on arrival.
          deeplink: `${appUrl}/employee/claims?nrZgl=${nz}`,
        })
        .catch(warn('reklamacja internal enqueue failed'));
    }

    if (targets.carrierEmail) {
      void this.mailService
        .enqueueReklamacjaCarrierSubmitted(targets.carrierEmail, {
          nrZgl: row.nrZgl,
          kwota,
          tresc,
          deeplink: `${appUrl}/carrier/claims/${nz}`,
        })
        .catch(warn('reklamacja carrier receipt enqueue failed'));
    }

    this.logger.log({
      msg: 'claims.reklamacja.notify',
      nrZgl: row.nrZgl,
      carrier: targets.carrierEmail ? maskEmail(targets.carrierEmail) : null,
      internal: internal.map((r) => maskEmail(r)),
    });
  }

  /**
   * Reklamacja DECIDED — one email, to the carrier only
   * (`reklamacja-carrier-decision`). Internal staff took the decision, so they
   * are deliberately not re-notified (mirrors the reklamacja UI: the outcome is
   * visible on the claim the moment it is saved).
   *
   * The tone/content branch on `row.reklamacjaResolution`, NEVER on `row.status`
   * — the status rolled back to the ORIGINAL wniosek verdict and says nothing
   * about the reklamacja. When the resolution is somehow absent we log and skip
   * rather than sending a mail that cannot state an outcome.
   */
  private async _applyReklamacjaDecisionEmail(row: ClaimRow): Promise<void> {
    if (!row.reklamacjaResolution) {
      this.logger.warn({
        msg: 'claims.reklamacja.decision_without_resolution',
        nrZgl: row.nrZgl,
      });
      return;
    }
    if (!this.mailService) {
      this.logger.warn({
        msg: 'claims.reklamacja.no_mail_service',
        nrZgl: row.nrZgl,
      });
      return;
    }
    const targets = await this._collectClaimRecipients(row);
    if (!targets.carrierEmail) {
      this.logger.warn({
        msg: 'claims.reklamacja.decision_no_carrier_email',
        nrZgl: row.nrZgl,
      });
      return;
    }

    const appUrl = this._appUrl();
    const nz = encodeURIComponent(row.nrZgl);
    await this.mailService
      .enqueueReklamacjaCarrierDecision(targets.carrierEmail, {
        nrZgl: row.nrZgl,
        resolution: row.reklamacjaResolution,
        vehiclePlate: row.vehiclePlateSnapshot,
        // Paid figure on UZNANA = the carrier's own frozen kwota.
        kwota: (row.reklamacjaAmount ?? 0).toFixed(2),
        orderNumber: row.reklamacjaOrderNumber ?? undefined,
        response: row.reklamacjaResponse ?? undefined,
        deeplink: `${appUrl}/carrier/claims/${nz}`,
      })
      .catch((err) => {
        this.logger.warn({
          msg: 'reklamacja decision enqueue failed',
          nrZgl: row.nrZgl,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    this.logger.log({
      msg: 'claims.reklamacja.decision_notify',
      nrZgl: row.nrZgl,
      resolution: row.reklamacjaResolution,
      carrier: maskEmail(targets.carrierEmail),
    });
  }

  /** Configured public app URL without a trailing slash (deeplink base). */
  private _appUrl(): string {
    return (
      this.configService?.get('APP_URL', { infer: true }) ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
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
 * Format a UTC-midnight date as `dd.MM.yyyy` for the «Korekty weryfikatora»
 * email diff (Polish date convention). Pure — reads the UTC components so the
 * output matches the stored calendar day regardless of the server timezone.
 */
function formatDdMmYyyy(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
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

/** True for the two wire-only reklamacja-resolution literals. */
function isReklamacjaTarget(
  target: UpdateClaimDto['targetStatus'],
): target is 'REKLAMACJA_ZAAKCEPTOWANO' | 'REKLAMACJA_ODRZUCONO' {
  return (
    target === 'REKLAMACJA_ZAAKCEPTOWANO' ||
    target === 'REKLAMACJA_ODRZUCONO'
  );
}

/**
 * Resolve a wire `targetStatus` into the `ClaimStatus` to persist.
 *
 * REWORK 2026-07-31 (variant A) — the synthetic `REKLAMACJA_*` literals no
 * longer collapse to a FIXED `ZAAKCEPTOWANO` / `ODRZUCONO`. BOTH outcomes return
 * the claim to `statusBeforeReklamacja` (stamped by `submitReklamacja`), because
 * the reklamacja disputes the wniosek's MONEY, not its verdict: an uznana
 * reklamacja on a rejected wniosek leaves the wniosek rejected and pays the
 * reklamacja under its own `reklamacjaOrderNumber`. The verdict of the
 * reklamacja itself lives in `reklamacjaResolution` — never inferred from the
 * resulting status.
 *
 * Defensive fallback when `statusBeforeReklamacja` is somehow NULL (hand-patched
 * / pre-rework row): infer from the payout — `amountApproved != null` means the
 * wniosek had been accepted, otherwise it was rejected. Both fallbacks are legal
 * edges out of `REKLAMACJA`, so `assertLegalTransition` still passes.
 *
 * Real `ClaimStatus` literals pass through unchanged. Pure function.
 */
function resolveUpdateTarget(
  target: UpdateClaimDto['targetStatus'],
  existing: ClaimRow,
): ClaimStatus {
  if (!isReklamacjaTarget(target)) return target;
  return (
    existing.statusBeforeReklamacja ??
    (existing.amountApproved !== null ? 'ZAAKCEPTOWANO' : 'ODRZUCONO')
  );
}

/**
 * The verifier-correction carrier — the common optional-field shape that the
 * decision PATCH (`UpdateClaimDto`, a discriminated union) and the verification
 * checkpoint (`VerifyClaimDto`, a flat object) BOTH expose. Both `verifyClaim`
 * and `_recalcClaim`/`_buildUpdatePatch` accept this shape so the shared
 * `extractCorrectionFields` property-sniff is honestly typed rather than a
 * blind `as` cast. Every field is optional — an empty object is legal (the
 * "confirmed as-is" checkpoint case).
 */
type CorrectionCarrier = Partial<{
  dateStart: string;
  dateEnd: string;
  timeFrom: string;
  timeTo: string;
  mileage: number;
  hoursAdjusted: number;
}>;

/** Extracted correction fields + whether any of them affects km-calc math. */
interface ExtractedCorrections extends CorrectionCarrier {
  touchesMath: boolean;
}

/**
 * km-calc outputs re-derived when a verifier touches a math-affecting field —
 * the return shape shared by `_recalcClaim` (decision PATCH) and the
 * verification checkpoint. Persisted verbatim onto the claim row.
 */
interface RecalcOutputs {
  drivenDays: number;
  kmGuaranteed: number;
  kmDifference: number;
  paymentEur: number;
  ratePerKmEffective: number;
  kmPerDay: number;
  breakdown: KmCalcBreakdown;
  mileage: number;
}

/**
 * Extract the verifier-correction fields from the DTO and indicate whether
 * any of them affects the km-calc math (true → caller MUST re-run the
 * calc engine; false → existing kmGuaranteed/paymentEur stay).
 *
 * Accepts BOTH the decision PATCH (`UpdateClaimDto` — a discriminated union
 * whose optional correction fields live only on some branches) and the
 * verification checkpoint (`VerifyClaimDto` — a flat object). The union member
 * without correction fields (`ODRZUCONO`, comment-only) shares no keys with the
 * `CorrectionCarrier` shape, so we widen to the union type here and do the
 * property-presence sniff internally. Branches / bodies that don't carry
 * correction fields (e.g. `REKLAMACJA_ODRZUCONO`, or an empty checkpoint body)
 * return `touchesMath: false` and empty correction slots.
 */
function extractCorrectionFields(
  dto: UpdateClaimDto | VerifyClaimDto,
): ExtractedCorrections {
  // The union has no single shape carrying every correction field, so read
  // them off the widened `CorrectionCarrier` view (property-presence sniff).
  const r = dto as CorrectionCarrier;
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
