// Row → wire DTO mapping of the planner transfer surface (docs/29,
// packages/shared/src/schemas/planner-transfers.ts). Pure functions.

import type {
  PlannerAssignmentDto,
  PlannerTransferDto,
  PlannerTransferPersonDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { PlannerAssignmentRow } from '../vehicles/vehicle-planner-assignments.repository';
import type {
  PlannerTransferPersonRow,
  PlannerTransferRow,
} from '../vehicles/vehicle-planner-transfers.repository';
import { decisionRefusal } from './planner-transfer.rules';

function person(p: PlannerTransferPersonRow): PlannerTransferPersonDto {
  return { id: p.id, login: p.login, name: p.name, role: p.role, lider: p.lider };
}

/**
 * Maps one request for `viewer`. The three `viewer*` flags are computed with
 * the same rule the mutations enforce (`decisionRefusal`), so a button the UI
 * shows is a call the server accepts.
 */
export function toPlannerTransferDto(
  row: PlannerTransferRow,
  viewer: Pick<AuthUser, 'sub' | 'role' | 'lider'>,
): PlannerTransferDto {
  const pending = row.status === 'pending';
  const refusal = decisionRefusal(viewer, row);
  return {
    id: row.id,
    status: row.status,
    vehicle: {
      id: row.vehicle.id,
      plateNumber: row.vehicle.plateNumber,
      sideNumber: row.vehicle.sideNumber,
      active: row.vehicle.active,
      carrier: row.vehicle.carrier,
    },
    fromPlanner: { ...person(row.fromPlanner), leader: row.fromPlanner.leader },
    toPlanner: person(row.toPlanner),
    requestedBy: person(row.requestedBy),
    decidedBy: row.decidedBy ? person(row.decidedBy) : null,
    reason: row.reason,
    decisionComment: row.decisionComment,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    viewerCanDecide: pending && refusal === null,
    viewerBlockedReason:
      pending && (refusal === 'requester' || refusal === 'target') ? refusal : null,
    viewerCanCancel: pending && row.requestedById === viewer.sub,
  };
}

/** Maps one row of the vehicle's planista journal. */
export function toPlannerAssignmentDto(row: PlannerAssignmentRow): PlannerAssignmentDto {
  return {
    id: row.id,
    planner: person(row.planner),
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo ? row.validTo.toISOString() : null,
    source: row.source,
    actor: row.actor ? person(row.actor) : null,
    transfer: row.transfer
      ? {
          id: row.transfer.id,
          requestedBy: person(row.transfer.requestedBy),
          decidedBy: row.transfer.decidedBy ? person(row.transfer.decidedBy) : null,
          reason: row.transfer.reason,
          decisionComment: row.transfer.decisionComment,
          decidedAt: row.transfer.decidedAt ? row.transfer.decidedAt.toISOString() : null,
          createdAt: row.transfer.createdAt.toISOString(),
        }
      : null,
  };
}
