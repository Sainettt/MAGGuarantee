import { Injectable } from '@nestjs/common';

import type { DelegationStatus } from '@magguarantee/shared';

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
   * `plannerId` / `dispatcherId` are carried for the Phase 6.4 `getOne`
   * ownership checks (planista/dyspozytor by-id read scope). They are NOT
   * surfaced in the wire DTO — `DelegationsService.toDto` emits only
   * `{ id, plateNumber }` for the vehicle mini-reference.
   */
  vehicle: {
    id: string;
    plateNumber: string;
    plannerId: string | null;
    dispatcherId: string | null;
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
  actualReturnAt: Date | null;

  reportedById: string | null;
  reportedBy: { id: string; login: string; name: string | null } | null;
  reportedAt: Date;
  verifiedById: string | null;
  verifiedBy: { id: string; login: string; name: string | null } | null;
  verifiedAt: Date | null;

  notes: string | null;

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
  carrierId?: string;
  vehicleId?: string;
  driverId?: string;
  /**
   * Phase 6.2 dyspozytor auto-scope — restrict to delegations whose vehicle is
   * dispatched by this user (`Delegation.vehicle.dispatcherId === dispatcherId`).
   * Server-identity driven (never client-supplied); the service sets it from
   * the JWT `sub`. Translated to a relation filter `vehicle: { dispatcherId }`
   * (the `@@index([vehicleId, status])` plus the `Vehicle.dispatcherId` index
   * keep this narrow). Composes with the scalar filters above.
   */
  dispatcherId?: string;
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

  async list(filters: DelegationListFilters): Promise<DelegationRow[]> {
    const where: Record<string, unknown> = {};
    // Explicit single `status` wins over the server-injected `statusIn` floor:
    // an explicit filter is always honoured (and narrows to exactly one status,
    // archived or not). Only when no explicit `status` is present does the
    // active-board allow-list apply — and that is set solely by the
    // eksport/weryfikator scope branch in the service.
    if (filters.status) {
      where.status = filters.status;
    } else if (filters.statusIn && filters.statusIn.length > 0) {
      where.status = { in: filters.statusIn };
    }
    if (filters.carrierId) where.carrierId = filters.carrierId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.driverId) where.driverId = filters.driverId;
    // Dyspozytor / planista auto-scope — relation filters so the FK indexes on
    // `Vehicle.dispatcherId` / `Vehicle.plannerId` narrow the join instead of a
    // client-side pass. If both are set (not currently sent together — the
    // service injects exactly one) they AND under the same `vehicle` relation.
    if (filters.dispatcherId || filters.plannerId) {
      where.vehicle = {
        ...(filters.dispatcherId ? { dispatcherId: filters.dispatcherId } : {}),
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
        actualReturnAt: data.actualReturnAt,
        verifiedById: data.verifiedById,
        verifiedAt: data.verifiedAt,
      },
      include: this.includeShape(),
    });
    return this.flatten(row);
  }

  // ── helpers ──────────────────────────────────────────────

  private includeShape() {
    return {
      // `plannerId` / `dispatcherId` feed the Phase 6.4 `getOne` ownership
      // checks (planista/dyspozytor); they are stripped at the DTO boundary.
      vehicle: {
        select: {
          id: true,
          plateNumber: true,
          plannerId: true,
          dispatcherId: true,
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
    } as const;
  }

  private flatten(row: DelegationPrismaShape): DelegationRow {
    return {
      id: row.id,
      vehicleId: row.vehicleId,
      vehicle: row.vehicle ?? null,
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
      actualReturnAt: row.actualReturnAt,
      reportedById: row.reportedById,
      reportedBy: row.reportedBy ?? null,
      reportedAt: row.reportedAt,
      verifiedById: row.verifiedById,
      verifiedBy: row.verifiedBy ?? null,
      verifiedAt: row.verifiedAt,
      notes: row.notes,
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
    plannerId: string | null;
    dispatcherId: string | null;
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
  actualReturnAt: Date | null;
  reportedById: string | null;
  reportedBy?: { id: string; login: string; name: string | null } | null;
  reportedAt: Date;
  verifiedById: string | null;
  verifiedBy?: { id: string; login: string; name: string | null } | null;
  verifiedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
