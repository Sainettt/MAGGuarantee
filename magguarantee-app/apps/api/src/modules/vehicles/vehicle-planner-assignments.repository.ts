import { Injectable } from '@nestjs/common';

import type { PlannerAssignmentSource, Prisma } from '@magguarantee/database';

import { PrismaService } from '../prisma/prisma.service';
import type { PlannerTransferPersonRow } from './vehicle-planner-transfers.repository';

/** One row of a vehicle's planista journal, with the people and the request behind it. */
export interface PlannerAssignmentRow {
  id: string;
  vehicleId: string;
  plannerId: string;
  validFrom: Date;
  validTo: Date | null;
  source: PlannerAssignmentSource;
  transferId: string | null;
  actorId: string | null;
  planner: PlannerTransferPersonRow;
  actor: PlannerTransferPersonRow | null;
  transfer: {
    id: string;
    reason: string;
    decisionComment: string | null;
    decidedAt: Date | null;
    createdAt: Date;
    requestedBy: PlannerTransferPersonRow;
    decidedBy: PlannerTransferPersonRow | null;
  } | null;
}

const PERSON_SELECT = {
  id: true,
  login: true,
  name: true,
  role: true,
  lider: true,
} as const;

const ASSIGNMENT_INCLUDE = {
  planner: { select: PERSON_SELECT },
  actor: { select: PERSON_SELECT },
  transfer: {
    select: {
      id: true,
      reason: true,
      decisionComment: true,
      decidedAt: true,
      createdAt: true,
      requestedBy: { select: PERSON_SELECT },
      decidedBy: { select: PERSON_SELECT },
    },
  },
} as const satisfies Prisma.VehiclePlannerAssignmentInclude;

type AssignmentPrismaRow = Prisma.VehiclePlannerAssignmentGetPayload<{
  include: typeof ASSIGNMENT_INCLUDE;
}>;

/**
 * Data access for `VehiclePlannerAssignment` — who was a vehicle's planista,
 * from when to when (docs/29 §2 p.4). APPEND-ONLY: the only UPDATE is closing
 * the open row (`validTo`). Invariant held together with `Vehicle.plannerId`
 * in one transaction: exactly one open row (`validTo IS NULL`, partial unique
 * index) whose `plannerId` equals the vehicle's current planista.
 *
 * The `create` row is written by `VehiclesRepository.create` as a nested
 * insert of the vehicle itself; this repository handles the `transfer` rows
 * and the reads.
 */
@Injectable()
export class VehiclePlannerAssignmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The journal of one vehicle, newest first. */
  async listByVehicle(vehicleId: string): Promise<PlannerAssignmentRow[]> {
    const rows = await this.prisma.tx.vehiclePlannerAssignment.findMany({
      where: { vehicleId },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(flatten);
  }

  /**
   * Closes the vehicle's open row at `at`. Returns the count (`1`, or `0` for
   * a legacy vehicle that never got a row — the new row is opened anyway).
   */
  async closeOpen(vehicleId: string, at: Date): Promise<number> {
    const res = await this.prisma.tx.vehiclePlannerAssignment.updateMany({
      where: { vehicleId, validTo: null },
      data: { validTo: at },
    });
    return res.count;
  }

  /**
   * Opens the row of an approved transfer: `source = transfer` with the
   * request linked (CHECK `vehicle_planner_assignment_transfer_link`),
   * `validFrom` = the SAME instant the previous row was closed at.
   */
  async openFromTransfer(data: {
    vehicleId: string;
    plannerId: string;
    validFrom: Date;
    transferId: string;
    actorId: string;
  }): Promise<void> {
    await this.prisma.tx.vehiclePlannerAssignment.create({
      data: { ...data, source: 'transfer', validTo: null },
    });
  }
}

function person(p: AssignmentPrismaRow['planner']): PlannerTransferPersonRow {
  return { id: p.id, login: p.login, name: p.name, role: p.role, lider: p.lider };
}

function flatten(row: AssignmentPrismaRow): PlannerAssignmentRow {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    plannerId: row.plannerId,
    validFrom: row.validFrom,
    validTo: row.validTo,
    source: row.source,
    transferId: row.transferId,
    actorId: row.actorId,
    planner: person(row.planner),
    actor: row.actor ? person(row.actor) : null,
    transfer: row.transfer
      ? {
          id: row.transfer.id,
          reason: row.transfer.reason,
          decisionComment: row.transfer.decisionComment,
          decidedAt: row.transfer.decidedAt,
          createdAt: row.transfer.createdAt,
          requestedBy: person(row.transfer.requestedBy),
          decidedBy: row.transfer.decidedBy ? person(row.transfer.decidedBy) : null,
        }
      : null,
  };
}
