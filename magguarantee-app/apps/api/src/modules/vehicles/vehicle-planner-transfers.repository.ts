import { Injectable } from '@nestjs/common';

import type { PlannerTransferStatus, Prisma } from '@magguarantee/database';
import type { Role } from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/** A person on a transfer row — enough for `roleLabelKey(role, lider)`. */
export interface PlannerTransferPersonRow {
  id: string;
  login: string;
  name: string | null;
  role: Role;
  lider: boolean;
}

/**
 * `fromPlanner` also carries his leader link: `liderId` drives the decision
 * rule (R3 — the lider of the CURRENT planista decides), `leader` is the mini
 * the admin inbox shows (docs/14 §17.5.2).
 */
export interface PlannerTransferFromPlannerRow extends PlannerTransferPersonRow {
  liderId: string | null;
  leader: { id: string; login: string; name: string | null } | null;
}

/** One `VehiclePlannerTransfer` with everything the DTO and the rules need. */
export interface PlannerTransferRow {
  id: string;
  vehicleId: string;
  fromPlannerId: string;
  toPlannerId: string;
  requestedById: string;
  status: PlannerTransferStatus;
  reason: string;
  decisionComment: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  vehicle: {
    id: string;
    plateNumber: string;
    sideNumber: string | null;
    active: boolean;
    carrierId: string;
    carrier: { id: string; login: string; name: string | null } | null;
  };
  fromPlanner: PlannerTransferFromPlannerRow;
  toPlanner: PlannerTransferPersonRow;
  requestedBy: PlannerTransferPersonRow;
  decidedBy: PlannerTransferPersonRow | null;
}

/**
 * Filters of the transfer lists. All AND-composed; the service sets the scope
 * fields from the JWT, never from the client.
 */
export interface PlannerTransferListFilters {
  /** Lider inbox — requests whose `fromPlanner.liderId` is this user. */
  fromPlannerLiderId?: string;
  /** "My requests" — requests this user filed. */
  requestedById?: string;
  vehicleId?: string;
  statuses: readonly PlannerTransferStatus[];
  /**
   * `queue` — oldest first (the pending tab: whoever waited longest comes
   * first); `decided` — newest decision first. `id` breaks ties so the cursor
   * walk is stable.
   */
  order: 'queue' | 'decided';
  cursor?: string;
  limit: number;
}

/** The closing write of a request (approve / reject / cancel). */
export interface ClosePlannerTransferData {
  status: Exclude<PlannerTransferStatus, 'pending'>;
  decidedById: string;
  decidedAt: Date;
  decisionComment: string | null;
}

const PERSON_SELECT = {
  id: true,
  login: true,
  name: true,
  role: true,
  lider: true,
} as const;

const TRANSFER_INCLUDE = {
  vehicle: {
    select: {
      id: true,
      plateNumber: true,
      sideNumber: true,
      active: true,
      carrierId: true,
      carrier: {
        select: { id: true, user: { select: { login: true, name: true } } },
      },
    },
  },
  fromPlanner: {
    select: {
      ...PERSON_SELECT,
      liderId: true,
      liderUser: { select: { id: true, login: true, name: true } },
    },
  },
  toPlanner: { select: PERSON_SELECT },
  requestedBy: { select: PERSON_SELECT },
  decidedBy: { select: PERSON_SELECT },
} as const satisfies Prisma.VehiclePlannerTransferInclude;

type TransferPrismaRow = Prisma.VehiclePlannerTransferGetPayload<{
  include: typeof TRANSFER_INCLUDE;
}>;

/**
 * Data access for `VehiclePlannerTransfer` (docs/29). The table is
 * APPEND-ONLY: rows are created `pending` and closed exactly once (approve /
 * reject / cancel) — never deleted, never re-opened. Not a soft-delete model
 * (no `deletedAt`), so the Prisma extension leaves it alone.
 *
 * Every write goes through `prisma.tx`, i.e. the ambient `@Audit` transaction
 * when there is one — the approval's lock + writes + audit row commit together.
 * Closing writes are compare-and-set on `status = 'pending'`: a request that
 * was closed concurrently yields `0` and the service answers 409.
 */
@Injectable()
export class VehiclePlannerTransfersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PlannerTransferRow | null> {
    const row = await this.prisma.tx.vehiclePlannerTransfer.findFirst({
      where: { id },
      include: TRANSFER_INCLUDE,
    });
    return row ? flatten(row) : null;
  }

  /** The vehicle's `pending` request, if any (at most one — partial unique index). */
  async findPendingByVehicle(vehicleId: string): Promise<PlannerTransferRow | null> {
    const row = await this.prisma.tx.vehiclePlannerTransfer.findFirst({
      where: { vehicleId, status: 'pending' },
      include: TRANSFER_INCLUDE,
    });
    return row ? flatten(row) : null;
  }

  /**
   * Inserts a `pending` request. A second pending request for the same
   * vehicle violates `VehiclePlannerTransfer_pending_vehicle_key` → Prisma
   * P2002, which the service maps to 409 (the race the pre-check cannot see).
   */
  async create(data: {
    vehicleId: string;
    fromPlannerId: string;
    toPlannerId: string;
    requestedById: string;
    reason: string;
  }): Promise<PlannerTransferRow> {
    const row = await this.prisma.tx.vehiclePlannerTransfer.create({
      data: { ...data, status: 'pending' },
      include: TRANSFER_INCLUDE,
    });
    return flatten(row);
  }

  async list(filters: PlannerTransferListFilters): Promise<PlannerTransferRow[]> {
    const where: Prisma.VehiclePlannerTransferWhereInput = {
      status: { in: [...filters.statuses] },
    };
    if (filters.fromPlannerLiderId) {
      where.fromPlanner = { liderId: filters.fromPlannerLiderId };
    }
    if (filters.requestedById) where.requestedById = filters.requestedById;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    const orderBy: Prisma.VehiclePlannerTransferOrderByWithRelationInput[] =
      filters.order === 'queue'
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : [{ decidedAt: 'desc' }, { id: 'desc' }];
    const rows = await this.prisma.tx.vehiclePlannerTransfer.findMany({
      where,
      include: TRANSFER_INCLUDE,
      orderBy,
      take: filters.limit + 1,
      ...(filters.cursor ? { skip: 1, cursor: { id: filters.cursor } } : {}),
    });
    return rows.map(flatten);
  }

  /** Every request of one vehicle, any status, newest first (the journal). */
  async listByVehicle(vehicleId: string): Promise<PlannerTransferRow[]> {
    const rows = await this.prisma.tx.vehiclePlannerTransfer.findMany({
      where: { vehicleId },
      include: TRANSFER_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(flatten);
  }

  /**
   * Closes a `pending` request — compare-and-set on `status = 'pending'` (and
   * on the author when `onlyRequestedById` is given, for cancel). Returns the
   * number of rows closed: `0` means it was not pending any more (or not the
   * author's) and nothing was written. Always stamps `decidedAt` +
   * `decidedById` (CHECK `vehicle_planner_transfer_closed_has_decided_at`).
   */
  async closeIfPending(
    id: string,
    data: ClosePlannerTransferData,
    onlyRequestedById?: string,
  ): Promise<number> {
    const res = await this.prisma.tx.vehiclePlannerTransfer.updateMany({
      where: {
        id,
        status: 'pending',
        ...(onlyRequestedById ? { requestedById: onlyRequestedById } : {}),
      },
      data,
    });
    return res.count;
  }

  /**
   * Vehicle switched off / removed (docs/29 U6) → its `pending` request is
   * cancelled, closed by the user who switched it off. Returns how many rows
   * were closed (0 or 1).
   */
  async cancelPendingForVehicle(
    vehicleId: string,
    actorId: string | null,
    at: Date,
  ): Promise<number> {
    const res = await this.prisma.tx.vehiclePlannerTransfer.updateMany({
      where: { vehicleId, status: 'pending' },
      data: {
        status: 'cancelled',
        decidedAt: at,
        decidedById: actorId,
        decisionComment: null,
      },
    });
    return res.count;
  }
}

function person(p: TransferPrismaRow['toPlanner']): PlannerTransferPersonRow {
  return { id: p.id, login: p.login, name: p.name, role: p.role, lider: p.lider };
}

function flatten(row: TransferPrismaRow): PlannerTransferRow {
  const from = row.fromPlanner;
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    fromPlannerId: row.fromPlannerId,
    toPlannerId: row.toPlannerId,
    requestedById: row.requestedById,
    status: row.status,
    reason: row.reason,
    decisionComment: row.decisionComment,
    decidedById: row.decidedById,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    vehicle: {
      id: row.vehicle.id,
      plateNumber: row.vehicle.plateNumber,
      sideNumber: row.vehicle.sideNumber,
      active: row.vehicle.active,
      carrierId: row.vehicle.carrierId,
      carrier: row.vehicle.carrier
        ? {
            id: row.vehicle.carrier.id,
            login: row.vehicle.carrier.user.login,
            name: row.vehicle.carrier.user.name,
          }
        : null,
    },
    fromPlanner: {
      ...person(from),
      liderId: from.liderId,
      leader: from.liderUser
        ? { id: from.liderUser.id, login: from.liderUser.login, name: from.liderUser.name }
        : null,
    },
    toPlanner: person(row.toPlanner),
    requestedBy: person(row.requestedBy),
    decidedBy: row.decidedBy ? person(row.decidedBy) : null,
  };
}
