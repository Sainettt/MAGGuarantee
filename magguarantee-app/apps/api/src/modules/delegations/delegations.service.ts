import {
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

import {
  CARRIER_NOT_READY_CODE,
  DEPARTURE_IN_PAST_CODE,
  DEPARTURE_PAST_GRACE_MS,
  type CancelDelegationDto,
  type DelegationDto,
  type DelegationEligibilityResponse,
  type DelegationFilters,
  type DelegationStatus,
  type MarkInTransitDto,
  type MarkReadyDto,
  type MarkReturnedDto,
  type SubmitDelegationDto,
} from '@magguarantee/shared';

import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { ClaimsService } from '../claims/claims.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { ChatNotifierService } from '../integrations/chat/chat-notifier.service';
import { TrailersRepository } from '../trailers/trailers.repository';
import {
  NO_TEAM_SENTINEL,
  VehiclesRepository,
} from '../vehicles/vehicles.repository';
import {
  assertLegalDelegationTransition,
  CANCELLABLE_DELEGATION_STATUSES,
} from './delegation-state-machine';
import {
  DelegationsRepository,
  type DelegationListFilters,
  type DelegationRow,
} from './delegations.repository';

/**
 * Active-board status floor for the eksport default list view (history toggle
 * OFF). Kept as a module constant so the allow-list isn't a magic array inline
 * in `_scopeListFilters`.
 */
// Phase 7 REWORK (2026-06-20 #4) — `gotowy` joined the active board (it is the
// eksport-owned step between `zgloszony` and `w_trasie`).
const ACTIVE_DELEGATION_STATUSES = ['zgloszony', 'gotowy', 'w_trasie'] as const;

/**
 * Delegations service.
 *
 * Phase 3 — carrier-driven flow: register a delegation (`zgloszony`) and cancel
 * one's own `zgloszony` rows (carrier-only).
 *
 * Phase 7 rework (2026-06-10 #2) — the weryfikator no longer drives delegation
 * status; that role manages per-vehicle route status in the vehicles module.
 * The former `markInTransit` / `markReturned` transitions were removed. The
 * only remaining special-role behaviour here is the `eksport` read-only board:
 * an active-status floor (`{zgloszony, w_trasie}`) by default, widened to all
 * statuses via the `includeHistory` toggle.
 */
@Injectable()
export class DelegationsService {
  private readonly logger = new Logger(DelegationsService.name);

  constructor(
    private readonly delegations: DelegationsRepository,
    private readonly carriers: CarriersRepository,
    private readonly vehicles: VehiclesRepository,
    private readonly drivers: DriversRepository,
    private readonly trailers: TrailersRepository,
    private readonly readiness: CarrierReadinessService,
    private readonly chat: ChatNotifierService,
    // Phase 7 REWORK (2026-06-20 #4) — the `returned()` transition calls the
    // claims auto-recalc inside the `@Audit`-opened ambient transaction.
    // `@Optional()` + `forwardRef` so the circular DelegationsModule↔ClaimsModule
    // wiring resolves and the existing positional service-test fakes (which omit
    // the arg) keep compiling.
    @Optional()
    @Inject(forwardRef(() => ClaimsService))
    private readonly claimsService?: ClaimsService,
    // Phase 9 follow-up — outgoing email on new wyjazd / ready. All optional so
    // the existing positional service-test fakes keep compiling; notifications
    // no-op when any is absent.
    @Optional() private readonly mailService?: MailService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly configService?: ConfigService<Env, true>,
  ) {}

  // ── Submit ──────────────────────────────────────────────

  async add(user: AuthUser, dto: SubmitDelegationDto): Promise<DelegationDto> {
    const carrier = await this._requireCarrierProfile(user);
    // Hard readiness gate — BEFORE any persistence. A carrier may only
    // register a delegation when their fleet is complete (active vehicle +
    // trailer + driver) and, if they operate any ADR vehicle, an ADR document
    // is on file. The carrier gets a GENERIC, machine-readable 422 — no
    // breakdown of which item is missing (the detail lives only on the
    // opiekun side per the product decision). See `CarrierReadinessService`.
    await this._assertCarrierReady(carrier.id);

    const vehicle = await this._requireOwnedVehicle(carrier.id, dto.vehicleId);
    // Trailer + driver are required post-migration; ownership checks
    // become unconditional.
    await this._requireOwnedTrailer(carrier.id, dto.trailerId);
    const driverSnapshot = await this._snapshotDriver(carrier.id, dto.driverId);

    // CREATE-time invariant — at most ONE active (non-terminal) delegation per
    // vehicle. Block (409) when this machine is already on / awaiting a trip
    // (status ∈ {zgloszony, gotowy, w_trasie}). Terminal (`zjechal`/`anulowany`)
    // and soft-deleted outings never block. Enforced ONLY here at create: since
    // create maintains "≤1 active per vehicle", the invariant holds by
    // induction across the status transitions. See docs/04-data-model.md.
    await this._assertVehicleNotOnActiveTrip(vehicle.id);

    // A carrier may NOT register a wyjazd with a `departureAt` in the past
    // (full-timestamp granularity, minus a small grace window — see
    // `DEPARTURE_PAST_GRACE_MS`). Bypassable via the `ALLOW_PAST_DEPARTURE` env
    // flag for dev/test/e2e. See the method doc.
    this._assertDepartureNotInPast(dto.departureAt);

    const row = await this.delegations.create({
      carrierId: carrier.id,
      vehicleId: vehicle.id,
      trailerId: dto.trailerId,
      driverId: dto.driverId,
      driverNameSnapshot: driverSnapshot.name,
      driverPhoneSnapshot: driverSnapshot.phone,
      departureAt: new Date(dto.departureAt),
      departureCountry: dto.departureCountry,
      departurePostalCode: dto.departurePostalCode,
      // `plannedReturnAt` is `YYYY-MM-DD` (date-only). `new Date("YYYY-MM-DD")`
      // parses as UTC midnight, which matches Prisma's `@db.Date` round-trip.
      plannedReturnAt: new Date(dto.plannedReturnAt),
      returnCountry: dto.returnCountry,
      returnPostalCode: dto.returnPostalCode,
      notes: dto.comment ?? null,
      reportedById: user.sub,
    });

    // Side-effect: post the wyjazd to the standing Google Chat space. This is
    // a fire-and-forget enqueue — the actual webhook POST happens off the
    // request path in the `chat-notify-wyjazd` processor. It must NEVER break
    // or delay `add()`, so any failure here is swallowed (warn-only). The
    // notifier itself also catches internally; the try/catch is belt-and-
    // suspenders per docs/16-jobs-and-integrations.md#google-chat-notifications.
    try {
      await this.chat.notifyWyjazd(row.id);
    } catch (err) {
      this.logger.warn({
        msg: 'chat wyjazd notification enqueue failed (non-fatal)',
        delegationId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // New-wyjazd email — carrier (confirmation) + opiekun (heads-up).
    // Fire-and-log, off the request path; never breaks add().
    void this._notifyWyjazd('announced', row);

    return this.toDto(row);
  }

  /**
   * Outgoing wyjazd email. `announced` → carrier + opiekun; `ready` → carrier
   * only. Fire-and-log: a mail hiccup must never break a status transition.
   * Reads emails via `this.prisma.client` (root client) since this runs in a
   * fire-and-forget continuation, possibly after an ambient `@Audit` tx
   * committed. No-op when MailService / Prisma are not wired (unit tests).
   */
  private async _notifyWyjazd(
    kind: 'announced' | 'ready',
    row: DelegationRow,
  ): Promise<void> {
    if (!this.mailService || !this.prisma) return;
    try {
      const carrier = await this.prisma.client.carrier.findFirst({
        where: { id: row.carrierId },
        select: {
          user: { select: { email: true, name: true, login: true } },
          opiekun: { select: { email: true } },
        },
      });
      const carrierEmail = carrier?.user.email ?? null;
      const carrierName =
        carrier?.user.name || carrier?.user.login || 'Przewoźnik';
      const plateNumber = row.vehicle?.plateNumber ?? '—';
      const driverName =
        row.driverNameSnapshot ??
        (row.driver
          ? `${row.driver.firstName} ${row.driver.lastName}`
          : '—');
      const departure = this._fmtDeparture(row);
      const warn = (err: unknown) =>
        this.logger.warn({
          msg: 'wyjazd email enqueue failed',
          delegationId: row.id,
          error: err instanceof Error ? err.message : String(err),
        });

      if (kind === 'announced') {
        const plannedReturn = this._fmtPlannedReturn(row);
        if (carrierEmail) {
          void this.mailService
            .enqueueDelegationAnnounced(carrierEmail, {
              forCarrier: true,
              carrierName,
              plateNumber,
              driverName,
              departure,
              plannedReturn,
            })
            .catch(warn);
        }
        if (carrier?.opiekun?.email) {
          void this.mailService
            .enqueueDelegationAnnounced(carrier.opiekun.email, {
              forCarrier: false,
              carrierName,
              plateNumber,
              driverName,
              departure,
              plannedReturn,
            })
            .catch(warn);
        }
      } else if (carrierEmail) {
        void this.mailService
          .enqueueDelegationReady(carrierEmail, {
            carrierName,
            plateNumber,
            departure,
          })
          .catch(warn);
      }
    } catch (err) {
      this.logger.warn({
        msg: 'wyjazd notification failed',
        delegationId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Departure formatted in Europe/Warsaw (real local departure time). */
  private _fmtDeparture(row: DelegationRow): string {
    const dt = new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Warsaw',
    }).format(row.departureAt);
    return `${dt} · ${row.departureCountry} ${row.departurePostalCode}`;
  }

  /**
   * Planned return formatted as date-only in UTC. `plannedReturnAt` is stored
   * as UTC midnight (`@db.Date`); formatting in UTC avoids the local-timezone
   * shift that would otherwise show the previous/next day.
   */
  private _fmtPlannedReturn(row: DelegationRow): string {
    const d = new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(row.plannedReturnAt);
    return `${d} · ${row.returnCountry} ${row.returnPostalCode}`;
  }

  // ── Cancel ──────────────────────────────────────────────

  async cancel(
    user: AuthUser,
    id: string,
    dto: CancelDelegationDto,
  ): Promise<DelegationDto> {
    const row = await this.delegations.findById(id);
    if (!row) throw new NotFoundException('Delegacja nie znaleziona');

    // Phase 7 REWORK (2026-06-20 #4) — admin may anulate ANY active outing
    // (`zgloszony | gotowy | w_trasie`), closing the "rejs sorvался после
    // zlecenia" hole. The carrier branch below is UNCHANGED (own + `zgloszony`).
    if (user.role === 'admin') {
      if (!CANCELLABLE_DELEGATION_STATUSES.includes(row.status)) {
        throw new ConflictException(
          'Można anulować tylko aktywny wyjazd (zgłoszony / gotowy / w trasie).',
        );
      }
      const updated = await this.delegations.update(row.id, {
        status: 'anulowany',
        notes: dto.reason
          ? appendCancellationNote(row.notes, dto.reason)
          : row.notes,
      });
      return this.toDto(updated);
    }

    // Ownership: carriers may only cancel their own delegations. Other roles
    // are out of scope (weryfikator never cancels — docs/20 §0″).
    if (user.role !== 'przewoznik') {
      throw new ForbiddenException(
        'Tylko przewoźnik może anulować zgłoszoną delegację w tej fazie',
      );
    }
    const carrier = await this._requireCarrierProfile(user);
    if (row.carrierId !== carrier.id) {
      throw new ForbiddenException('Brak uprawnień do tej delegacji');
    }

    // Status gate — carrier may only cancel `zgloszony` rows. Mirrors
    // docs/13-api-design.md#delegations.
    if (row.status !== 'zgloszony') {
      throw new ConflictException(
        'Można anulować tylko delegację w statusie „zgłoszony".',
      );
    }

    const updated = await this.delegations.update(row.id, {
      status: 'anulowany',
      notes: dto.reason
        ? appendCancellationNote(row.notes, dto.reason)
        : row.notes,
    });
    return this.toDto(updated);
  }

  // ── Status transitions (Phase 7 REWORK 2026-06-20 #4) ────

  /**
   * `POST /delegations/:id/ready` — eksport|admin.
   *
   * Default: `zgloszony → gotowy` (clean flip after a SpedTrans zlecenie). With
   * `rollback: true`: `gotowy → zgloszony` (allowed ONLY while not yet
   * `w_trasie` — the state machine forbids the rollback edge from any other
   * status). The state machine validates the edge and 422s an illegal one
   * (e.g. a rollback after the outing has already left). An optional `note`
   * is appended to the outing notes for the audit trail.
   */
  async markReady(
    user: AuthUser,
    id: string,
    dto: MarkReadyDto,
  ): Promise<DelegationDto> {
    const row = await this.delegations.findById(id);
    if (!row) throw new NotFoundException('Delegacja nie znaleziona');

    const target: DelegationStatus = dto.rollback ? 'zgloszony' : 'gotowy';
    assertLegalDelegationTransition(row.status, target);

    const updated = await this.delegations.update(row.id, {
      status: target,
      notes: dto.note ? appendNote(row.notes, dto.note) : row.notes,
      // Stamp the eksport who readied the load — forward flip only. Surfaced in
      // the modal as the "zweryfikowany" actor (see schema / docs).
      ...(dto.rollback ? {} : { readyById: user.sub, readyAt: new Date() }),
    });
    // Notify the carrier the vehicle is ready (forward flip only; fire-and-log).
    if (!dto.rollback) void this._notifyWyjazd('ready', updated);
    return this.toDto(updated);
  }

  /**
   * `POST /delegations/:id/in-transit` — weryfikator|admin. `gotowy → w_trasie`.
   * Stamps `verifiedBy/At`. The state machine forbids skipping `gotowy`
   * (admin is on `@Roles` but still goes through the gate — no forcing).
   */
  async markInTransit(
    user: AuthUser,
    id: string,
    dto: MarkInTransitDto,
  ): Promise<DelegationDto> {
    const row = await this.delegations.findById(id);
    if (!row) throw new NotFoundException('Delegacja nie znaleziona');

    assertLegalDelegationTransition(row.status, 'w_trasie');

    const updated = await this.delegations.update(row.id, {
      status: 'w_trasie',
      verifiedById: user.sub,
      verifiedAt: new Date(),
      notes: dto.note ? appendNote(row.notes, dto.note) : row.notes,
    });
    // FUTURE (no email yet): once the weryfikator captures an actual departure
    // date here, send a "pojazd w trasie od <data>" email to the carrier /
    // opiekun. Hook would be `void this._notifyWyjazd('in-transit', updated)`.
    return this.toDto(updated);
  }

  /**
   * `POST /delegations/:id/returned` — weryfikator|admin. `w_trasie → zjechal`.
   *
   * `actualReturnAt` is **date-only**. In ONE `prisma.$transaction`:
   *   1. set `actualReturnAt` + `verifiedBy/At` + status,
   *   2. advance `Vehicle.lastDroveAt = max(lastDroveAt, actualReturnAt)`
   *      (never moved backwards by an out-of-order edit),
   *   3. auto-recalc the linked wniosek (no-op when none / when the period was
   *      human-adjusted / when the claim is already decided) — see
   *      `ClaimsService.recalcFromDelegation`.
   */
  async markReturned(
    user: AuthUser,
    id: string,
    dto: MarkReturnedDto,
  ): Promise<DelegationDto> {
    const row = await this.delegations.findById(id);
    if (!row) throw new NotFoundException('Delegacja nie znaleziona');

    assertLegalDelegationTransition(row.status, 'zjechal');

    // `actualReturnAt` is date-only (`YYYY-MM-DD`) — parse to UTC midnight to
    // match the `plannedReturnAt` / `@db.Date` round-trip.
    const actualReturnAt = isoDateOnlyToMidnightUtc(dto.actualReturnAt);
    if (!actualReturnAt) {
      throw new UnprocessableEntityException('Nieprawidłowa data zjazdu');
    }

    // All writes below enrol in the SAME transaction. `POST /:id/returned`
    // carries `@Audit('delegation.markReturned')`, so the `AuditInterceptor`
    // already opened a `prisma.$transaction` and every repository call routes
    // through `prisma.tx` (the ambient handle) — the status update, the
    // `Vehicle.lastDroveAt` bump, the claim auto-recalc, and the audit row all
    // commit together or roll back together. Mirrors `VehicleDailyKmService`.
    const updated = await this.delegations.update(row.id, {
      status: 'zjechal',
      actualReturnAt,
      verifiedById: user.sub,
      verifiedAt: new Date(),
      notes: dto.note ? appendNote(row.notes, dto.note) : row.notes,
    });

    // Fleet readiness signal: `max(lastDroveAt, actualReturnAt)` — never moved
    // backwards by an out-of-order edit (same invariant as the daily-km bump).
    const current = await this._currentLastDroveAt(row.vehicleId);
    if (!current || actualReturnAt.getTime() > current.getTime()) {
      await this.vehicles.update(row.vehicleId, { lastDroveAt: actualReturnAt });
    }

    // Auto-recalc the linked wniosek in the SAME transaction. No-op when no
    // claim is linked, when the claim is already decided, or when a human
    // adjusted the period (the gate lives inside `recalcFromDelegation`).
    if (this.claimsService) {
      await this.claimsService.recalcFromDelegation(row.id, actualReturnAt);
    }

    return this.toDto(updated);
  }

  /**
   * Reads the vehicle's current `lastDroveAt` through the ambient tx so the
   * max-comparison sees uncommitted in-transaction state. Returns `null` when
   * the vehicle is missing (defensive — the FK guarantees it exists).
   */
  private async _currentLastDroveAt(vehicleId: string): Promise<Date | null> {
    const v = await this.vehicles.findById(vehicleId);
    return v?.lastDroveAt ?? null;
  }

  // ── Eligibility ─────────────────────────────────────────

  /**
   * Carrier-portal eligibility flag for the new-delegation form. Returns a
   * single boolean — `canCreate` (= `readiness.ready`) — with NO breakdown,
   * per the product decision: the carrier learns only whether they can
   * proceed, not which item is missing. Derived from the same readiness
   * computation that hard-blocks `add()`. The carrier id is resolved from the
   * auth user (same path as `add()`).
   */
  async eligibility(user: AuthUser): Promise<DelegationEligibilityResponse> {
    const carrier = await this._requireCarrierProfile(user);
    const readiness = await this.readiness.forCarrier(carrier.id);
    return { canCreate: readiness.ready };
  }

  // ── Read ────────────────────────────────────────────────

  async list(
    user: AuthUser,
    filters: DelegationFilters,
  ): Promise<{ items: DelegationDto[]; nextCursor: string | null }> {
    const effective = await this._scopeListFilters(user, filters);
    const rows = await this.delegations.list(effective);
    const hasNext = rows.length > effective.limit;
    const page = hasNext ? rows.slice(0, effective.limit) : rows;
    return {
      items: page.map((r) => this.toDto(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getOne(user: AuthUser, id: string): Promise<DelegationDto> {
    const row = await this.delegations.findById(id);
    if (!row) throw new NotFoundException('Delegacja nie znaleziona');
    await this._assertCanReadOne(user, row);
    return this.toDto(row);
  }

  /**
   * Defence-in-depth by-id read scope (Phase 6.4). The list path is already
   * scoped per-role in `_scopeListFilters`, but `getOne` previously only
   * ownership-gated `przewoznik` — leaving a by-id read hole where a planista
   * or dyspozytor could read ANY delegation by guessing/learning its id. We now
   * mirror the list scope on the single-resource read:
   *  - `przewoznik` → row.carrierId must equal the caller's carrier.
   *  - `planista`   → row.vehicle.plannerId must equal `user.sub`.
   *  - `dyspozytor` → row.vehicle.dispatchTeamId must equal the dyspozytor's
   *    `teamId` (Phase 11 — team scope; a dyspozytor with no team matches
   *    nothing → 403).
   *  - admin/opiekun/eksport → unrestricted (all-access roles).
   *  - any other role never reaches here (controller `@Roles` excludes them,
   *    notably `pracownik` — quirk #13 — and `weryfikator`, dropped in the
   *    Phase 7 rework 2026-06-10 #2).
   */
  private async _assertCanReadOne(
    user: AuthUser,
    row: DelegationRow,
  ): Promise<void> {
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (row.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tej delegacji');
      }
      return;
    }
    if (user.role === 'planista') {
      if (row.vehicle?.plannerId !== user.sub) {
        throw new ForbiddenException('Brak uprawnień do tej delegacji');
      }
      return;
    }
    if (user.role === 'dyspozytor') {
      // Phase 11 — team scope. No team (or vehicle on a different team) → 403.
      if (!user.teamId || row.vehicle?.dispatchTeamId !== user.teamId) {
        throw new ForbiddenException('Brak uprawnień do tej delegacji');
      }
    }
  }

  // ── Mappers ─────────────────────────────────────────────

  toDto(row: DelegationRow): DelegationDto {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      vehicle: row.vehicle,
      trailerId: row.trailerId,
      trailer: row.trailer,
      driverId: row.driverId,
      driver: row.driver,
      carrierId: row.carrierId,
      carrier: row.carrier,
      driverNameSnapshot: row.driverNameSnapshot,
      driverPhoneSnapshot: row.driverPhoneSnapshot,
      departureAt: row.departureAt.toISOString(),
      departureCountry: row.departureCountry,
      departurePostalCode: row.departurePostalCode,
      // Date-only (`YYYY-MM-DD`) — strip the time portion of the UTC midnight
      // Prisma returns for a `@db.Date` column to keep the wire shape stable.
      plannedReturnAt: row.plannedReturnAt.toISOString().slice(0, 10),
      returnCountry: row.returnCountry,
      returnPostalCode: row.returnPostalCode,
      status: row.status,
      actualReturnAt: row.actualReturnAt
        ? row.actualReturnAt.toISOString()
        : null,
      reportedById: row.reportedById,
      reportedBy: row.reportedBy,
      reportedAt: row.reportedAt.toISOString(),
      verifiedById: row.verifiedById,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      readyById: row.readyById,
      readyBy: row.readyBy,
      readyAt: row.readyAt ? row.readyAt.toISOString() : null,
      notes: row.notes,
      claimId: row.claimId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ── Internals ───────────────────────────────────────────

  /**
   * Throws a generic 422 with a STABLE machine-readable `code` when the
   * carrier is not ready to register a delegation. The frontend matches on
   * `extensions.code === 'CARRIER_NOT_READY'` (the established machine-field
   * convention — same `extensions` bag the claims vehicle-cooldown 422 uses)
   * and renders a "skontaktuj się ze swoim opiekunem" banner. We deliberately
   * leak NO detail about which item is missing.
   */
  private async _assertCarrierReady(carrierId: string): Promise<void> {
    const readiness = await this.readiness.forCarrier(carrierId);
    if (readiness.ready) return;
    throw new UnprocessableEntityException({
      message:
        'Nie można zarejestrować wyjazdu — skontaktuj się ze swoim opiekunem.',
      extensions: { code: CARRIER_NOT_READY_CODE },
    });
  }

  /**
   * Rejects (422) a delegation whose `departureAt` is in the PAST. "Past" is
   * full-TIMESTAMP granularity with a small grace window: reject only when
   * `new Date(departureAt).getTime() < Date.now() - DEPARTURE_PAST_GRACE_MS`
   * (no date-only rounding, no timezone math — both sides are absolute
   * instants). The grace (a few minutes) absorbs form fill-in time so a carrier
   * who picks "now" and submits shortly after is not rejected; the same
   * `DEPARTURE_PAST_GRACE_MS` constant drives the web pre-check + `min` hint, so
   * the window can't drift. Throws the same `extensions.code` envelope shape as
   * `_assertCarrierReady`; the frontend pattern-matches on `DEPARTURE_IN_PAST`
   * to surface an inline field error on `departureAt`.
   *
   * BYPASS — do NOT "fix" this into fail-closed:
   *  - When `configService` is ABSENT (undefined) we bypass (return without
   *    checking). In production `ConfigService` is ALWAYS wired by the global
   *    `ConfigModule`, so an absent config only happens in pure unit-test fakes
   *    that omit the positional arg — and those fakes use fixed PAST fixture
   *    dates (e.g. `delegations.service.add.spec.ts` → '2026-06-01'). Enforcing
   *    when config is absent would break that suite. Absent config = bypass.
   *  - When config is present AND `ALLOW_PAST_DEPARTURE` is true → bypass
   *    (dev/test/e2e override to allow backdated departures).
   *  - Otherwise → enforce.
   */
  private _assertDepartureNotInPast(departureAt: string): void {
    // Bypass in pure unit context (no ConfigService wired) — see method doc.
    if (!this.configService) return;
    if (this.configService.get('ALLOW_PAST_DEPARTURE', { infer: true })) return;
    if (new Date(departureAt).getTime() < Date.now() - DEPARTURE_PAST_GRACE_MS) {
      throw new UnprocessableEntityException({
        message: 'Nie można zarejestrować wyjazdu z datą w przeszłości.',
        extensions: { code: DEPARTURE_IN_PAST_CODE },
      });
    }
  }

  private async _requireCarrierProfile(
    user: AuthUser,
  ): Promise<{ id: string }> {
    if (user.role !== 'przewoznik') {
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
   * CREATE-time guard for the "≤1 active delegation per vehicle" invariant.
   * Throws 409 Conflict naming the conflicting outing (its departure date +
   * human PL status label) when the vehicle already holds a non-terminal,
   * non-deleted delegation. No-op when the vehicle is free. The blocking set is
   * the module constant `ACTIVE_DELEGATION_STATUSES`. Tone mirrors the cancel
   * path's ConflictException messages.
   */
  private async _assertVehicleNotOnActiveTrip(vehicleId: string): Promise<void> {
    const conflict = await this.delegations.findActiveByVehicle(
      vehicleId,
      ACTIVE_DELEGATION_STATUSES,
    );
    if (!conflict) return;
    const departure = new Intl.DateTimeFormat('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Warsaw',
    }).format(conflict.departureAt);
    throw new ConflictException(
      `Ta maszyna jest już przypisana do aktywnego wyjazdu (z dnia ${departure}, ` +
        `status: ${delegationStatusLabelPl(conflict.status)}). ` +
        'Zakończ lub anuluj tamten wyjazd przed utworzeniem nowego.',
    );
  }

  private async _requireOwnedVehicle(
    carrierId: string,
    vehicleId: string,
  ): Promise<{ id: string; plateNumber: string }> {
    const v = await this.vehicles.findById(vehicleId);
    if (!v || v.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowy pojazd');
    }
    if (!v.active) {
      throw new UnprocessableEntityException('Pojazd jest nieaktywny');
    }
    return { id: v.id, plateNumber: v.plateNumber };
  }

  private async _requireOwnedTrailer(
    carrierId: string,
    trailerId: string,
  ): Promise<void> {
    const t = await this.trailers.findById(trailerId);
    if (!t || t.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowa naczepa');
    }
  }

  private async _snapshotDriver(
    carrierId: string,
    driverId: string,
  ): Promise<{ name: string; phone: string }> {
    const d = await this.drivers.findById(driverId);
    if (!d || d.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowy kierowca');
    }
    if (!d.active) {
      throw new UnprocessableEntityException('Kierowca jest nieaktywny');
    }
    return {
      name: `${d.firstName} ${d.lastName}`.trim(),
      phone: d.phone,
    };
  }

  private async _scopeListFilters(
    user: AuthUser,
    filters: DelegationFilters,
  ): Promise<DelegationListFilters> {
    // `includeHistory` is a Phase 7 eksport/weryfikator-only toggle. Strip it
    // up-front so it can NEVER flow into any other role's repo filters — only
    // the eksport/weryfikator branch below re-reads it. `rest` is already a
    // clean `DelegationListFilters` shape (no `includeHistory` / `claimable`),
    // so every downstream branch is structurally safe. `claimable` is a
    // carrier-only picker flag, re-injected (as `claimableOnly`) ONLY in the
    // przewoznik branch below.
    const { includeHistory, claimable, ...rest } = filters;

    // All-access, no status floor: admin/opiekun see every delegation in every
    // status, always (docs/03-roles.md). The `includeHistory` toggle is NOT
    // consulted here — these roles never get the active-board restriction, so
    // their lists keep returning `zjechal`/`anulowany` rows unconditionally.
    // `planista` was REMOVED from this branch in Phase 6.4 (it had silently
    // leaked the full delegation list to planners) and is scoped below.
    if (user.role === 'admin' || user.role === 'opiekun') {
      return rest;
    }
    // Eksport (Phase 7) — all-access by carrier/vehicle/owner (no ownership
    // scope), but with an ACTIVE-BOARD status floor by default. This is the
    // ONLY place the `statusIn` allow-list is injected, so the restriction
    // cannot leak to any other role's list:
    //   - `includeHistory` OFF (default) and no explicit `status` → restrict to
    //     `{zgloszony, w_trasie}` via `statusIn`.
    //   - `includeHistory` ON → widen to all statuses (no `statusIn`).
    //   - an explicit `status` filter ALWAYS narrows further (the repo prefers
    //     `status` over `statusIn`), so e.g. `status=zjechal` still works even
    //     with history off.
    // `weryfikator` is BACK on this branch (Phase 7 REWORK 2026-06-20 #4) —
    // it manages the outing lifecycle again, so it sees the SAME active board as
    // eksport (active-status floor by default, widened by `includeHistory`). The
    // km-board (`VehicleDailyKm`) it keeps is unrelated to this list.
    if (user.role === 'eksport' || user.role === 'weryfikator') {
      if (includeHistory || rest.status) {
        return rest;
      }
      return { ...rest, statusIn: [...ACTIVE_DELEGATION_STATUSES] };
    }
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (rest.carrierId && rest.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tego przewoźnika');
      }
      // Phase 7 REWORK (2026-06-20 #4) — «claimable wyjazdy» picker: outings in
      // {`w_trasie`, `zjechal`} with no claim yet. The repo applies the fixed
      // status floor + `claim is null` predicate; the carrier pin still wins.
      return {
        ...rest,
        carrierId: carrier.id,
        ...(claimable ? { claimableOnly: true } : {}),
      };
    }
    if (user.role === 'planista') {
      // Phase 6.4 — planista sees ONLY delegations of vehicles they plan
      // (`Vehicle.plannerId === user.sub`). Mirrors the dyspozytor scope
      // exactly: server identity wins, so a client-supplied `carrierId` /
      // `vehicleId` is stripped to stop the planista pivoting outside their
      // planned fleet.
      const { carrierId: _carrierId, vehicleId: _vehicleId, ...planRest } =
        rest;
      return { ...planRest, plannerId: user.sub };
    }
    if (user.role === 'dyspozytor') {
      // Phase 11 — dyspozytor sees ONLY delegations of vehicles on THEIR team
      // (docs/03-roles.md#dyspozytor). Server identity wins: a client-supplied
      // `carrierId` / `vehicleId` is dropped so the dyspozytor cannot pivot
      // outside their team's fleet (same posture as the przewoznik scope). A
      // dyspozytor with NO team passes the sentinel → 0 rows (never "all").
      const { carrierId: _carrierId, vehicleId: _vehicleId, ...dysRest } = rest;
      return {
        ...dysRest,
        dispatchTeamId: user.teamId ?? NO_TEAM_SENTINEL,
      };
    }
    throw new ForbiddenException('Brak uprawnień');
  }
}

// ─── Pure helpers ────────────────────────────────────────

/**
 * Human PL label for a delegation status, used in user-facing conflict
 * messages (the "≤1 active per vehicle" 409). Mirrors the wording already used
 * inline on the cancel path ("zgłoszony / gotowy / w trasie"). Falls back to
 * the raw status for completeness — the active set only ever yields the first
 * three, so the terminal labels are belt-and-suspenders.
 */
const DELEGATION_STATUS_LABEL_PL: Record<DelegationStatus, string> = {
  zgloszony: 'zgłoszony',
  gotowy: 'gotowy',
  w_trasie: 'w trasie',
  zjechal: 'zjechał',
  anulowany: 'anulowany',
};

function delegationStatusLabelPl(status: DelegationStatus): string {
  return DELEGATION_STATUS_LABEL_PL[status] ?? status;
}

function appendCancellationNote(
  existing: string | null,
  reason: string,
): string {
  const ts = new Date().toISOString();
  const entry = `[ANULOWANO ${ts}] ${reason}`;
  return existing ? `${existing}\n${entry}` : entry;
}

/**
 * Appends a free-form transition note (Phase 7 status changes) to the outing
 * notes with a timestamp, preserving prior notes. Mirrors
 * `appendCancellationNote` without the `[ANULOWANO]` tag.
 */
function appendNote(existing: string | null, note: string): string {
  const ts = new Date().toISOString();
  const entry = `[${ts}] ${note}`;
  return existing ? `${existing}\n${entry}` : entry;
}

/**
 * Parse a date-only `YYYY-MM-DD` to UTC midnight (matches the `@db.Date`
 * round-trip Prisma performs for `plannedReturnAt` / `actualReturnAt`).
 * Returns `null` on malformed input.
 */
function isoDateOnlyToMidnightUtc(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
