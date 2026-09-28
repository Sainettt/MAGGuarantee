// Splits `GET /vehicles/:id/planner-history` into the three parts of the
// `<PlannerHistoryTimeline>` (docs/14 §17.6.2):
//
//   pending      — the open request, ALWAYS the first node of the spine;
//   assignments  — the journal, newest first (the current one has no `validTo`);
//   closed       — rejected / cancelled requests: the planista never changed
//                  through them, so they sit under the spine in a <details>.
//
// Approved requests are not listed separately — each one IS the `transfer`
// assignment row it opened (with its request inside `assignment.transfer`).

import type {
  PlannerAssignmentDto,
  PlannerTransferDto,
  VehiclePlannerHistoryDto,
} from '@magguarantee/shared';

export interface PlannerTimeline {
  pending: PlannerTransferDto | null;
  assignments: PlannerAssignmentDto[];
  closed: PlannerTransferDto[];
}

const byNewest = (a: string, b: string): number =>
  a < b ? 1 : a > b ? -1 : 0;

export function buildPlannerTimeline(
  history: VehiclePlannerHistoryDto,
): PlannerTimeline {
  const pending = history.transfers.find((t) => t.status === 'pending') ?? null;
  // The api already answers newest first; sorting again keeps the component
  // honest if that ever changes (ISO strings compare chronologically).
  const assignments = [...history.assignments].sort((a, b) =>
    byNewest(a.validFrom, b.validFrom),
  );
  const closed = history.transfers
    .filter((t) => t.status === 'rejected' || t.status === 'cancelled')
    .sort((a, b) =>
      byNewest(a.decidedAt ?? a.createdAt, b.decidedAt ?? b.createdAt),
    );
  return { pending, assignments, closed };
}

/** The pending request of a vehicle, if the history is loaded and has one. */
export function pendingTransferOf(
  history: VehiclePlannerHistoryDto | undefined,
): PlannerTransferDto | null {
  return history?.transfers.find((t) => t.status === 'pending') ?? null;
}
