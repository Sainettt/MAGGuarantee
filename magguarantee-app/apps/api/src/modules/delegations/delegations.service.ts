import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import {
  CARRIER_NOT_READY_CODE,
  type CancelDelegationDto,
  type DelegationDto,
  type DelegationEligibilityResponse,
  type DelegationFilters,
  type MarkReturnedDto,
  type SubmitDelegationDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierReadinessService } from '../carriers/carrier-readiness.service';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import { assertLegalDelegationTransition } from './delegation-state-machine';
import {
  DelegationsRepository,
  type DelegationListFilters,
  type DelegationRow,
} from './delegations.repository';

/**
 * Active-board status floor for the eksport/weryfikator default list view
 * (history toggle OFF). Kept as a module constant so the allow-list isn't a
 * magic array inline in `_scopeListFilters`.
 */
const ACTIVE_DELEGATION_STATUSES = ['zgloszony', 'w_trasie'] as const;

/**
 * Delegations service.
 *
 * Phase 3 — carrier-driven flow: register a delegation (`zgloszony`) and cancel
 * one's own `zgloszony` rows (carrier-only; unchanged in Phase 7).
 *
 * Phase 7 — weryfikator/admin-driven status lifecycle:
 *   - `markInTransit` (`zgloszony → w_trasie`);
 *   - `markReturned`  (`w_trasie → zjechal`, mirrors `actualReturnAt` into
 *     `Vehicle.lastDroveAt` atomically).
 * Both transitions go through the delegation state machine (illegal source
 * status → 409) and never touch the cancel path. The eksport/weryfikator list
 * also gains an active-board default with an `includeHistory` widen toggle.
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

    // Ownership: carriers may only cancel their own delegations. Other roles
    // are out of scope in Phase 3 (weryfikator handles them in Phase 7).
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

  // ── Weryfikator transitions (Phase 7) ───────────────────

  /**
   * `zgloszony → w_trasie`. Role-gated to `weryfikator | admin` at the
   * controller (`@Roles`). The state machine rejects any other source status
   * with 409 before any write. Stamps `verifiedBy/At` from the caller + clock.
   *
   * Atomicity: the controller carries `@Audit('delegation.markInTransit')`, so
   * the `AuditInterceptor` has already opened a `prisma.$transaction` and the
   * repository's `update` (via `prisma.tx`) plus the audit-row write commit
   * together. No explicit `prisma.$transaction` is needed for this single-row
   * change.
   */
  async markInTransit(user: AuthUser, id: string): Promise<DelegationDto> {
    const row = await this._requireDelegation(id);
    assertLegalDelegationTransition(row.status, 'w_trasie');
    const updated = await this.delegations.update(row.id, {
      status: 'w_trasie',
      verifiedById: user.sub,
      verifiedAt: new Date(),
    });
    return this.toDto(updated);
  }

  /**
   * `w_trasie → zjechal`. Role-gated to `weryfikator | admin`. Requires the
   * real return DAY (`actualReturnAt`, date-only). In ONE transaction it:
   *   1. flips the delegation to `zjechal`, stamps `actualReturnAt` +
   *      `verifiedBy/At`;
   *   2. mirrors `actualReturnAt` into `Vehicle.lastDroveAt` — the fleet
   *      "this truck is back" signal (legacy `Code.gs:4100`).
   *
   * Both writes go through `prisma.tx`, so they enrol in the SAME
   * interceptor-opened audit transaction (`@Audit('delegation.markReturned')`)
   * and commit atomically with the audit row. This atomic `lastDroveAt` update
   * is the key Phase 7 deliverable.
   */
  async markReturned(
    user: AuthUser,
    id: string,
    dto: MarkReturnedDto,
  ): Promise<DelegationDto> {
    const row = await this._requireDelegation(id);
    assertLegalDelegationTransition(row.status, 'zjechal');
    // Date-only (`YYYY-MM-DD`) → UTC midnight, exactly as `plannedReturnAt` is
    // parsed on submit. Matches the `@db.Date`-style round-trip for both the
    // delegation column and the mirrored `vehicle.lastDroveAt`.
    const actualReturnAt = new Date(dto.actualReturnAt);
    const updated = await this.delegations.update(row.id, {
      status: 'zjechal',
      actualReturnAt,
      verifiedById: user.sub,
      verifiedAt: new Date(),
    });
    // Same ambient transaction (`prisma.tx`): the fleet signal commits with the
    // status flip and the audit row, or all three roll back together.
    await this.vehicles.update(row.vehicleId, { lastDroveAt: actualReturnAt });
    return this.toDto(updated);
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
   *  - `dyspozytor` → row.vehicle.dispatcherId must equal `user.sub`.
   *  - admin/opiekun/eksport/weryfikator → unrestricted (all-access roles).
   *  - any other role never reaches here (controller `@Roles` excludes them,
   *    notably `pracownik` — quirk #13).
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
      if (row.vehicle?.dispatcherId !== user.sub) {
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
   * Loads a delegation by id or throws 404. Shared by the verifier transitions
   * so the not-found message stays consistent with the rest of the surface.
   */
  private async _requireDelegation(id: string): Promise<DelegationRow> {
    const row = await this.delegations.findById(id);
    if (!row) throw new NotFoundException('Delegacja nie znaleziona');
    return row;
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
    // clean `DelegationListFilters` shape (no `includeHistory`), so every
    // downstream branch is structurally safe.
    const { includeHistory, ...rest } = filters;

    // All-access, no status floor: admin/opiekun see every delegation in every
    // status, always (docs/03-roles.md). The `includeHistory` toggle is NOT
    // consulted here — these roles never get the active-board restriction, so
    // their lists keep returning `zjechal`/`anulowany` rows unconditionally.
    // `planista` was REMOVED from this branch in Phase 6.4 (it had silently
    // leaked the full delegation list to planners) and is scoped below.
    if (user.role === 'admin' || user.role === 'opiekun') {
      return rest;
    }
    // Eksport + weryfikator (Phase 7) — all-access by carrier/vehicle/owner
    // (no ownership scope), but with an ACTIVE-BOARD status floor by default.
    // This is the ONLY place the `statusIn` allow-list is injected, so the
    // restriction cannot leak to any other role's list:
    //   - `includeHistory` OFF (default) and no explicit `status` → restrict to
    //     `{zgloszony, w_trasie}` via `statusIn`.
    //   - `includeHistory` ON → widen to all statuses (no `statusIn`).
    //   - an explicit `status` filter ALWAYS narrows further (the repo prefers
    //     `status` over `statusIn`), so e.g. `status=zjechal` still works even
    //     with history off.
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
      return { ...rest, carrierId: carrier.id };
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
      // Phase 6.2 — dyspozytor sees ONLY delegations of vehicles they dispatch
      // (docs/03-roles.md#dyspozytor). Server identity wins: a client-supplied
      // `carrierId` / `vehicleId` is dropped so the dyspozytor cannot pivot
      // outside their dispatched fleet (same posture as the przewoznik scope).
      const { carrierId: _carrierId, vehicleId: _vehicleId, ...dysRest } = rest;
      return { ...dysRest, dispatcherId: user.sub };
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
