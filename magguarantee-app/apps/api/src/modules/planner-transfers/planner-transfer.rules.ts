// Pure authorization rules of the vehicle planner transfer (docs/29 §3.1).
//
// Deciding is a RESOURCE-level check, not a guard: the route permission
// `vehicles.planner_transfer.decide` (docs/25 §3 B2) only lets an admin or a
// planista-lider reach the handler, and only the request row can say whether
// this planista is the lider of ITS `fromPlanner` (no `LiderGuard` — the
// permission cannot express "of this transfer", docs/29 §7 p.2). Kept pure so
// the decision matrix is tested without a database, and shared by the mutation
// (403) and the DTO's viewer flags so the UI and the server can never disagree.

import type { DelegationStatus } from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';

/**
 * Audit action names of the four mutations (docs/13 «Audit на уровне API»):
 * `plannerTransfer.request` / `.approve` / `.reject` / `.cancel`, target type
 * `VehiclePlannerTransfer`, target key = the request id.
 */
export const PLANNER_TRANSFER_AUDIT_ACTIONS = {
  request: 'plannerTransfer.request',
  approve: 'plannerTransfer.approve',
  reject: 'plannerTransfer.reject',
  cancel: 'plannerTransfer.cancel',
} as const;

/** `audit_log.target_type` of the four mutations. */
export const PLANNER_TRANSFER_AUDIT_TARGET = 'VehiclePlannerTransfer';

/**
 * R6 — trips that have not left yet follow the vehicle to the new planista on
 * approval. `w_trasie` is finished by the previous planista; `zjechal` /
 * `anulowany` stay with the planista of their period.
 */
export const TRANSFERABLE_DELEGATION_STATUSES = [
  'zgloszony',
  'gotowy',
] as const satisfies readonly DelegationStatus[];

/** The fields of a request the decision rule reads. */
export interface DecisionSubject {
  requestedById: string;
  toPlannerId: string;
  fromPlanner: { liderId: string | null };
}

/**
 * Why `viewer` may NOT decide the request, or `null` when he may:
 *  - `not_decider` — neither an admin nor the lider of `fromPlanner` (R3).
 *    "Lider" means `role = planista` AND `lider = true` NOW (U10 — `user.lider`
 *    is read from the database on every request, not from the JWT) AND
 *    `fromPlanner.liderId = viewer`. The lider of the TARGET planista, or of
 *    anyone else, is not a decider.
 *  - `requester` — a decider who filed the request himself (R4, absolute).
 *    Since 2026-10-23 an admin may file (U1 reversed), so this hits an admin
 *    too: his own request is decided by ANOTHER admin or by the lider of
 *    `fromPlanner`. With a single admin and no eligible lider only the author
 *    can close it — by cancelling (accepted dead end, docs/29 R4).
 *  - `target` — a lider who would receive the vehicle; an admin decides then
 *    (R4). An admin is never the target (he is not a planista).
 */
export function decisionRefusal(
  viewer: Pick<AuthUser, 'sub' | 'role' | 'lider'>,
  subject: DecisionSubject,
): 'not_decider' | 'requester' | 'target' | null {
  // scope: resource-level — "lider of THIS request's fromPlanner"
  // (fromPlanner.liderId), keyed on role + lider, deliberately not on
  // `permissions`: the route's `vehicles.planner_transfer.decide` only lets
  // deciders reach it (docs/25 §0, docs/29 §3.1).
  const isAuthority =
    viewer.role === 'admin' ||
    (viewer.role === 'planista' &&
      viewer.lider === true &&
      subject.fromPlanner.liderId === viewer.sub);
  if (!isAuthority) return 'not_decider';
  if (viewer.sub === subject.requestedById) return 'requester';
  if (viewer.sub === subject.toPlannerId) return 'target';
  return null;
}
