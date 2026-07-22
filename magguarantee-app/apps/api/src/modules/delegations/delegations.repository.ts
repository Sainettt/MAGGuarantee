import { Injectable } from '@nestjs/common';

import type {
  DelegationStatus,
  VehicleDispatchTeamDto,
} from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Flat row shape returned by the delegations repository.
 *
 * Post-`20260518113943_delegation_required_fields_and_date_only` the
 * following columns are NOT NULL:
 *   - `trailerId`, `driverId`
 *   - `departureCountry`, `departurePostalCode`
 *   - `plannedReturnAt` (date-only), `returnCountry`, `returnPostalCode`
 *
 * `actualReturnAt` stays nullable — it is only set on transition to
 * `zjechal`. The legacy `delegation_returned_complete` CHECK has been
 * dropped; api enforces the `actualReturnAt`/status pairing.
 */
export interface DelegationRow {
  id: string;
  vehicleId: string;
  /**
   * `plannerId` / `dispatchTeamId` are carried for the Phase 6.4 `getOne`
   * ownership checks (planista/dyspozytor by-id read scope). Phase 11 swapped
   * the single `dispatcherId` for the team FK `dispatchTeamId`. Those two are
   * NOT surfaced in the wire DTO — they are stripped at the DTO boundary.
   *
   * Phase 11 Шаг D (additive) — `dispatchTeam` is resolved LIVE from
   * `Vehicle.dispatchTeam` (NOT a snapshot) and IS surfaced on the vehicle
   * mini-reference in the wire DTO. Same shape the VehicleDto/VehicleListItem
   * already emit (`VehicleDispatchTeamDto`). Identity only — NON-SENSITIVE.
   * `null` when the vehicle is not assigned to any team.
   *
   * The four km-guarantee rates (`rateDe`/`rateUe`/`rateExport`/`rateImport`,
   * EUR/km) are ALSO surfaced on the mini to power the modal's «Stawki» block.
   * Unlike the identity fields these are SENSITIVE — the service scrubs all
   * four to `null` for the `dyspozytor` role at the DTO boundary
   * (`DelegationsService.toDto`, see docs/14-design-system.md §6.4.2 / §6.15).
   */
  vehicle: {
    id: string;
    plateNumber: string;
    // "Porozumienie" (`Vehicle.agreement`, `Boolean?`) — carried to the claims
    // guarantee gate + the wire VehicleMini. `null`/`false` ⇒ not guaranteed.
    agreement: boolean | null;
    // Negotiated km-guarantee rates (EUR/km), Decimal→number at the mapper.
    // SENSITIVE — nulled for `dyspozytor` in `DelegationsService.toDto`.
    rateDe: number | null;
    rateUe: number | null;
    rateExport: number | null;
    rateImport: number | null;
    plannerId: string | null;
    dispatchTeamId: string | null;
    dispatchTeam: VehicleDispatchTeamDto | null;
    // Lead forwarder (`Vehicle.planner`, live) — surfaced on the wire vehicle
    // mini so the «ZESPÓŁ PROWADZĄCY» block shows the full crew (planista +
    // dispatchers + eksport). Identity only, NON-SENSITIVE.
    planner: { id: string; login: string; name: string | null } | null;
  } | null;
  trailerId: string;
  trailer: { id: string; plateNumber: string } | null;
  driverId: string;
  driver: { id: string; firstName: string; lastName: string } | null;
  carrierId: string;
  carrier: { id: string; login: string; name: string | null } | null;

  driverNameSnapshot: string | null;
  driverPhoneSnapshot: string | null;

  departureAt: Date;
  departureCountry: string;
  departurePostalCode: string;

  // Required at submit; `plannedReturnAt` is date-only (Prisma returns a
  // `Date` whose UTC midnight matches the stored `@db.Date` value).
  plannedReturnAt: Date;
  returnCountry: string;
  returnPostalCode: string;

  status: DelegationStatus;
  // Actual start of the guarantee period — the day the vehicle really started
  // driving, stamped by the weryfikator on `gotowy → w_trasie`. Date-only stored
  // as UTC midnight (same convention as `actualReturnAt`); `null` until the
  // outing goes `w_trasie`. Drives the linked wniosek's `dateStart`.
  actualDepartureAt: Date | null;
  actualReturnAt: Date | null;

  reportedById: string | null;
  reportedBy: { id: string; login: string; name: string | null } | null;
  reportedAt: Date;
  verifiedById: string | null;
  verifiedBy: { id: string; login: string; name: string | null } | null;
  verifiedAt: Date | null;
  readyById: string | null;
  readyBy: { id: string; login: string; name: string | null } | null;
  readyAt: Date | null;
  // "Nr zlecenia ze spedu" — SpedTrans order number, set on the forward
  // `gotowy` flip, cleared on rollback. `null` until readied.
  spedOrderNumber: string | null;

  notes: string | null;

  /**
   * Phase 7 REWORK (2026-06-20 #4) — the linked wniosek, if any (`@unique` FK on
   * the Claim side). `null` when no claim has been filed against this outing.
   * Used to (a) drive the carrier «claimable wyjazdy» picker and (b) let the
   * UI surface the link. Only the id is carried — the full claim is fetched
   * separately when needed.
   */
  claimId: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface DelegationListFilters {
  status?: DelegationStatus;
  /**
   * Phase 7 — server-injected status allow-list (the "active board" floor for
   * eksport/weryfikator: `['zgloszony', 'w_trasie']`). NEVER client-supplied —
   * `DelegationsService._scopeListFilters` sets it only for those two roles
   * when their `includeHistory` toggle is OFF. It is the ONLY mechanism that
   * restricts which statuses appear, and it is scoped to that one branch so it
   * cannot leak to carrier/planista/dyspozytor/admin/opiekun lists.
   *
   * Precedence: an explicit `status` filter WINS over `statusIn` (the service
   * never sends both, and the repo prefers `status` if both ever arrive) so an
   * explicit `status=zjechal` still resolves to exactly that status — "explicit
   * status always narrows further", per the slice contract.
   */
  statusIn?: DelegationStatus[];
  /**
   * Phase 7 REWORK (2026-06-20 #4) — carrier «claimable wyjazdy» picker. When
   * `true`, restricts to outings that can back a NEW wniosek: status ∈
   * {`w_trasie`, `zjechal`} AND no claim linked yet (`claim is null`). Composes
   * with `carrierId` (the scope branch always pins the carrier). Server-side
   * only — translated to a `status IN (...) AND claim is null` predicate here.
   */
  claimableOnly?: boolean;
  carrierId?: string;
  vehicleId?: string;
  driverId?: string;
  /**
   * Phase 11 dyspozytor auto-scope — restrict to delegations whose vehicle is
   * assigned to the dyspozytor's TEAM
   * (`Delegation.vehicle.dispatchTeamId === dispatchTeamId`). Server-identity
   * driven (never client-supplied); the service sets it from the JWT `teamId`.
   * Translated to a relation filter `vehicle: { dispatchTeamId }` (the
   * `Vehicle.dispatchTeamId` index keeps the join narrow). A dyspozytor with NO
   * team passes the NO_TEAM_SENTINEL → 0 rows. Composes with the scalar filters
   * above. (Was `dispatcherId` pre-Phase 11.)
   */
  dispatchTeamId?: string;
  /**
   * Phase 6.4 planista auto-scope — restrict to delegations whose vehicle is
   * planned by this user (`Delegation.vehicle.plannerId === plannerId`).
   * Server-identity driven (never client-supplied); the service sets it from
   * the JWT `sub`. Translated to a relation filter `vehicle: { plannerId }`
   * (the `Vehicle.plannerId` FK index narrows the join). Mirrors `dispatcherId`
   * exactly; if both are ever set they AND under the same `vehicle` relation.
   */
  plannerId?: string;
  /** ISO datetime — match delegations whose `departureAt` ≥ from. */
  from?: string;
  /** ISO datetime — match delegations whose `departureAt` ≤ to. */
  to?: string;
  q?: string;
  cursor?: string;
  limit: number;
}

export interface CreateDelegationData {
  carrierId: string;
  vehicleId: string;
  /** REQUIRED post-migration. */
  trailerId: string;
  /** REQUIRED post-migration. */
  driverId: string;
  driverNameSnapshot: string | null;
  driverPhoneSnapshot: string | null;
  departureAt: Date;
  /** REQUIRED post-migration. */
  departureCountry: string;
  departurePostalCode: string;
  /** REQUIRED post-migration — date-only. */
  plannedReturnAt: Date;
  returnCountry: string;
  returnPostalCode: string;
  notes: string | null;
  reportedById: string | null;
}

export interface UpdateDelegationData {
  status?: DelegationStatus;
  notes?: string | null;
  /**
   * Actual start of the guarantee period — stamped by the weryfikator on the
   * `gotowy → w_trasie` transition (`markInTransit`). Date-only at UTC midnight.
   */
  actualDepartureAt?: Date | null;
  actualReturnAt?: Date | null;
  /**
   * `verifiedBy/At` stamp who advanced an outing's status and when. The
   * weryfikator-driven delegation transitions that used to set these were
   * removed in the Phase 7 rework (2026-06-10 #2) — the columns remain on the
   * model and in this update shape for completeness, but the only delegation
   * mutation today is the carrier cancel path, which leaves them undefined.
   */
  verifiedById?: string | null;
  verifiedAt?: Date | null;
  /** Eksport who marked the outing `gotowy` (stamped in markReady). */
  readyById?: string | null;
  readyAt?: Date | null;
  /**
   * "Nr zlecenia ze spedu" — SpedTrans order number captured on the forward
   * `zgloszony → gotowy` flip (`markReady`). Set to the supplied value on the
   * flip; cleared (`null`) on rollback. Sibling of `readyBy*`.
   */
  spedOrderNumber?: string | null;
}

@Injectable()
export class DelegationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<DelegationRow | null> {
    const row = await this.prisma.tx.delegation.findFirst({
      where: { id },
      include: this.includeShape(),
    });
    return row ? this.flatten(row) : null;
  }

  /**
   * CREATE-time invariant lookup — returns the conflicting NON-DELETED outing
   * that holds this vehicle in an ACTIVE (non-terminal) status, or `null` when
   * the vehicle is free. Used by `DelegationsService.add` to enforce
   * "≤1 active delegation per vehicle" (docs/04-data-model.md — Delegation
   * status lifecycle invariant).
   *
   * IMPORTANT: unlike `findById` / `list`, this query EXPLICITLY excludes
   * soft-deleted rows (`deletedAt: null`) — a soft-deleted outing must never
   * block a new one. The active set is supplied by the service (the module
   * constant `ACTIVE_DELEGATION_STATUSES`: `{zgloszony, gotowy, w_trasie}`);
   * terminal statuses (`zjechal`, `anulowany`) are outside it and never block.
   * Ordered by `departureAt asc` so the earliest active outing is named first.
   */
  async findActiveByVehicle(
    vehicleId: string,
    activeStatuses: readonly DelegationStatus[],
  ): Promise<DelegationRow | null> {
    const row = await this.prisma.tx.delegation.findFirst({
      where: {
        vehicleId,
        status: { in: [...activeStatuses] },
        deletedAt: null,
      },
      include: this.includeShape(),
      orderBy: { departureAt: 'asc' },
    });
    return row ? this.flatten(row) : null;
  }

  async list(filters: DelegationListFilters): Promise<DelegationRow[]> {
    const where: Record<string, unknown> = {};
    // Explicit single `status` wins over the server-injected `statusIn` floor:
    // an explicit filter is always honoured (and narrows to exactly one status,
    // archived or not). Only when no explicit `status` is present does the
    // active-board allow-list apply — and that is set solely by the
    // eksport/weryfikator scope branch in the service.
    if (filters.status) {
      where.status = filters.status;
    } else if (filters.claimableOnly) {
      // «Claimable» = active-and-returnable AND not yet claimed. The status
      // floor is fixed here (not client-supplied) and `claim is null` excludes
      // outings that already back a wniosek (the `@unique` FK means at most one).
      where.status = { in: ['w_trasie', 'zjechal'] };
      where.claim = { is: null };
    } else if (filters.statusIn && filters.statusIn.length > 0) {
      where.status = { in: filters.statusIn };
    }
    if (filters.carrierId) where.carrierId = filters.carrierId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.driverId) where.driverId = filters.driverId;
    // Dyspozytor / planista auto-scope — relation filters so the FK indexes on
    // `Vehicle.dispatchTeamId` / `Vehicle.plannerId` narrow the join instead of
    // a client-side pass. If both are set (not currently sent together — the
    // service injects exactly one) they AND under the same `vehicle` relation.
    if (filters.dispatchTeamId || filters.plannerId) {
      where.vehicle = {
        ...(filters.dispatchTeamId
          ? { dispatchTeamId: filters.dispatchTeamId }
          : {}),
        ...(filters.plannerId ? { plannerId: filters.plannerId } : {}),
      };
    }
    if (filters.from || filters.to) {
      const range: Record<string, Date> = {};
      if (filters.from) range.gte = new Date(filters.from);
      if (filters.to) range.lte = new Date(filters.to);
      where.departureAt = range;
    }
    if (filters.q) {
      const q = filters.q;
      where.OR = [
        { departureCountry: { contains: q, mode: 'insensitive' } },
        { returnCountry: { contains: q, mode: 'insensitive' } },
        { driverNameSnapshot: { contains: q, mode: 'insensitive' } },
        { vehicle: { plateNumber: { contains: q, mode: 'insensitive' } } },
        { vehicle: { sideNumber: { contains: q, mode: 'insensitive' } } },
        { carrier: { user: { name: { contains: q, mode: 'insensitive' } } } },
        { carrier: { user: { login: { contains: q, mode: 'insensitive' } } } },
      ];
    }
    const rows = await this.prisma.tx.delegation.findMany({
      where,
      include: this.includeShape(),
      orderBy: { createdAt: 'desc' },
      take: filters.limit + 1,
      ...(filters.cursor
        ? { skip: 1, cursor: { id: filters.cursor } }
        : {}),
    });
    return rows.map((r) => this.flatten(r));
  }

  async create(data: CreateDelegationData): Promise<DelegationRow> {
    const row = await this.prisma.tx.delegation.create({
      data: {
        carrierId: data.carrierId,
        vehicleId: data.vehicleId,
        trailerId: data.trailerId,
        driverId: data.driverId,
        driverNameSnapshot: data.driverNameSnapshot,
        driverPhoneSnapshot: data.driverPhoneSnapshot,
        departureAt: data.departureAt,
        departureCountry: data.departureCountry,
        departurePostalCode: data.departurePostalCode,
        plannedReturnAt: data.plannedReturnAt,
        returnCountry: data.returnCountry,
        returnPostalCode: data.returnPostalCode,
        notes: data.notes,
        reportedById: data.reportedById,
        status: 'zgloszony',
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  async update(id: string, data: UpdateDelegationData): Promise<DelegationRow> {
    // `undefined` fields are omitted by Prisma (no-op), so passing the whole
    // shape is safe — the cancel path sends only status/notes; the Phase 7
    // transitions add verifiedBy/At (+ actualReturnAt for `returned`).
    const row = await this.prisma.tx.delegation.update({
      where: { id },
      data: {
        status: data.status,
        notes: data.notes,
        actualDepartureAt: data.actualDepartureAt,
        actualReturnAt: data.actualReturnAt,
        verifiedById: data.verifiedById,
        verifiedAt: data.verifiedAt,
        readyById: data.readyById,
        readyAt: data.readyAt,
        spedOrderNumber: data.spedOrderNumber,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      // `plannerId` / `dispatchTeamId` feed the Phase 6.4/11 `getOne` ownership
      // checks (planista/dyspozytor); they are stripped at the DTO boundary.
      // Phase 11 Шаг D — `dispatchTeam` (live, with its dispatcher roster) IS
      // surfaced on the vehicle mini. The four km-guarantee rates are selected
      // too (they feed the modal's «Stawki» block); they are SENSITIVE and get
      // scrubbed to `null` for `dyspozytor` in `DelegationsService.toDto`.
      vehicle: {
        select: {
          id: true,
          plateNumber: true,
          // "Porozumienie" — drives the claims guarantee gate + the picker's
          // "(bez gwarancji)" marker. NON-SENSITIVE (not a rate).
          agreement: true,
          // Negotiated km-guarantee rates (EUR/km, Prisma `Decimal?`) → the
          // «Stawki» block. SENSITIVE — role-scrubbed at the DTO boundary.
          rateDe: true,
          rateUe: true,
          rateExport: true,
          rateImport: true,
          plannerId: true,
          dispatchTeamId: true,
          dispatchTeam: {
            select: {
              id: true,
              code: true,
              name: true,
              active: true,
              dispatchers: {
                select: { id: true, name: true, login: true },
                orderBy: { login: 'asc' as const },
              },
            },
          },
          // Lead forwarder — identity only (same mini as reportedBy/readyBy).
          planner: { select: { id: true, login: true, name: true } },
        },
      },
      trailer: { select: { id: true, plateNumber: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
      carrier: {
        select: {
          id: true,
          user: { select: { login: true, name: true } },
        },
      },
      reportedBy: { select: { id: true, login: true, name: true } },
      verifiedBy: { select: { id: true, login: true, name: true } },
      readyBy: { select: { id: true, login: true, name: true } },
      // Phase 7 REWORK (2026-06-20 #4) — the linked wniosek (id only). `@unique`
      // FK on the Claim side, so this is at most one row.
      claim: { select: { id: true } },
    } as const;
  }

  private flatten(row: DelegationPrismaShape): DelegationRow {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      vehicle: row.vehicle
        ? {
            id: row.vehicle.id,
            plateNumber: row.vehicle.plateNumber,
            agreement: row.vehicle.agreement,
            // Decimal→number (same helper the vehicles repo uses). `null`
            // preserved; scrubbed for `dyspozytor` later in `toDto`.
            rateDe: decimalToNumber(row.vehicle.rateDe),
            rateUe: decimalToNumber(row.vehicle.rateUe),
            rateExport: decimalToNumber(row.vehicle.rateExport),
            rateImport: decimalToNumber(row.vehicle.rateImport),
            plannerId: row.vehicle.plannerId,
            dispatchTeamId: row.vehicle.dispatchTeamId,
            // Phase 11 Шаг D — live dispatch team, normalised to the shared
            // `VehicleDispatchTeamDto` shape (same map the vehicles repo runs).
            dispatchTeam: row.vehicle.dispatchTeam
              ? {
                  id: row.vehicle.dispatchTeam.id,
                  code: row.vehicle.dispatchTeam.code,
                  name: row.vehicle.dispatchTeam.name,
                  active: row.vehicle.dispatchTeam.active,
                  dispatchers: (
                    row.vehicle.dispatchTeam.dispatchers ?? []
                  ).map((d) => ({
                    id: d.id,
                    name: d.name,
                    login: d.login,
                  })),
                }
              : null,
            planner: row.vehicle.planner ?? null,
          }
        : null,
      trailerId: row.trailerId,
      trailer: row.trailer ?? null,
      driverId: row.driverId,
      driver: row.driver ?? null,
      carrierId: row.carrierId,
      carrier: row.carrier
        ? {
            id: row.carrier.id,
            login: row.carrier.user.login,
            name: row.carrier.user.name,
          }
        : null,
      driverNameSnapshot: row.driverNameSnapshot,
      driverPhoneSnapshot: row.driverPhoneSnapshot,
      departureAt: row.departureAt,
      departureCountry: row.departureCountry,
      departurePostalCode: row.departurePostalCode,
      plannedReturnAt: row.plannedReturnAt,
      returnCountry: row.returnCountry,
      returnPostalCode: row.returnPostalCode,
      status: row.status,
      actualDepartureAt: row.actualDepartureAt,
      actualReturnAt: row.actualReturnAt,
      reportedById: row.reportedById,
      reportedBy: row.reportedBy ?? null,
      reportedAt: row.reportedAt,
      verifiedById: row.verifiedById,
      verifiedBy: row.verifiedBy ?? null,
      verifiedAt: row.verifiedAt,
      readyById: row.readyById,
      readyBy: row.readyBy ?? null,
      readyAt: row.readyAt,
      spedOrderNumber: row.spedOrderNumber,
      notes: row.notes,
      claimId: row.claim?.id ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt,
    };
  }
}

interface DelegationPrismaShape {
  id: string;
  vehicleId: string;
  vehicle?: {
    id: string;
    plateNumber: string;
    agreement: boolean | null;
    // Prisma returns `Decimal` for these (nullable). Typed the same way the
    // vehicles repo raw shape does so the shared `decimalToNumber` narrows it.
    rateDe: { toNumber(): number } | number | null;
    rateUe: { toNumber(): number } | number | null;
    rateExport: { toNumber(): number } | number | null;
    rateImport: { toNumber(): number } | number | null;
    plannerId: string | null;
    dispatchTeamId: string | null;
    dispatchTeam?: {
      id: string;
      code: string;
      name: string | null;
      active: boolean;
      dispatchers?: { id: string; name: string | null; login: string }[];
    } | null;
    planner?: { id: string; login: string; name: string | null } | null;
  } | null;
  trailerId: string;
  trailer?: { id: string; plateNumber: string } | null;
  driverId: string;
  driver?: { id: string; firstName: string; lastName: string } | null;
  carrierId: string;
  carrier?: {
    id: string;
    user: { login: string; name: string | null };
  } | null;
  driverNameSnapshot: string | null;
  driverPhoneSnapshot: string | null;
  departureAt: Date;
  departureCountry: string;
  departurePostalCode: string;
  plannedReturnAt: Date;
  returnCountry: string;
  returnPostalCode: string;
  status: DelegationStatus;
  actualDepartureAt: Date | null;
  actualReturnAt: Date | null;
  reportedById: string | null;
  reportedBy?: { id: string; login: string; name: string | null } | null;
  reportedAt: Date;
  verifiedById: string | null;
  verifiedBy?: { id: string; login: string; name: string | null } | null;
  verifiedAt: Date | null;
  readyById: string | null;
  readyBy?: { id: string; login: string; name: string | null } | null;
  readyAt: Date | null;
  spedOrderNumber: string | null;
  notes: string | null;
  claim?: { id: string } | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// Prisma `Decimal → number | null` normaliser. Byte-identical to the copy in
// `vehicles.repository.ts` / `trailers.repository.ts` — the codebase keeps one
// private helper per repository rather than a shared export, so this mirrors
// that established convention (NOT a divergent variant).
function decimalToNumber(
  v: { toNumber(): number } | number | null | undefined,
): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber(): number }).toNumber();
  }
  return null;
}
