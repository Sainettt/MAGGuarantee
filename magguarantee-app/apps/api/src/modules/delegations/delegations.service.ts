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

import { ClaimsService } from '../claims/claims.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
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

    return this.toDto(row);
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
    void user;
    const row = await this.delegations.findById(id);
    if (!row) throw new NotFoundException('Delegacja nie znaleziona');

    const target: DelegationStatus = dto.rollback ? 'zgloszony' : 'gotowy';
    assertLegalDelegationTransition(row.status, target);

    const updated = await this.delegations.update(row.id, {
      status: target,
      notes: dto.note ? appendNote(row.notes, dto.note) : row.notes,
    });
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
