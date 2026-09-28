// Which planner-transfer refusal an api error is (docs/13 «Vehicle planner
// transfers» → error codes; docs/14 §17.3 / §17.5.5 «Ответы API → UI»).
//
// The web localises by `extensions.code`, never by the Polish `detail`. Each
// kind maps onto ONE place in the UI:
//   * `generic`       → toast, the dialog stays open for a retry (network / 5xx);
//   * `reasonInvalid` → <FormMessage> under the «Powód» field;
//   * anything else   → the inline `role="alert"` slot of the OPEN dialog.

import {
  PLANNER_TRANSFER_ALREADY_PENDING,
  PLANNER_TRANSFER_CANCEL_NOT_AUTHOR,
  PLANNER_TRANSFER_DECIDER_IS_REQUESTER,
  PLANNER_TRANSFER_DECIDER_IS_TARGET,
  PLANNER_TRANSFER_NOT_DECIDER,
  PLANNER_TRANSFER_NOT_PENDING,
  PLANNER_TRANSFER_NO_CURRENT_PLANNER,
  PLANNER_TRANSFER_PLANNER_CHANGED,
  PLANNER_TRANSFER_REASON_INVALID,
  PLANNER_TRANSFER_REQUEST_FORBIDDEN,
  PLANNER_TRANSFER_TARGET_INVALID,
  PLANNER_TRANSFER_VEHICLE_INACTIVE,
} from '@magguarantee/shared';

import { ApiResponseError } from '@/lib/api/client';
import { classifyApiError } from '@/lib/api/errors';
import { problemCode } from '@/lib/api/problemCode';

/** Filing a request (`POST /vehicles/:id/planner-transfers`). */
export type RequestErrorKind =
  /** 409 — the vehicle already has a pending request (U4). */
  | 'alreadyPending'
  /** 422 on `reason` — shown under the field. */
  | 'reasonInvalid'
  /** 422 — the target is inactive / not a planista / the current one (U2). */
  | 'targetInvalid'
  /** 422 — the vehicle is switched off. */
  | 'vehicleInactive'
  /** 403 / 404 / no current planista — this caller cannot file for this vehicle. */
  | 'notAllowed'
  /** Network, 5xx, anything unexpected — toast + retry. */
  | 'generic';

export function requestErrorKind(err: unknown): RequestErrorKind {
  switch (problemCode(err)) {
    case PLANNER_TRANSFER_ALREADY_PENDING:
      return 'alreadyPending';
    case PLANNER_TRANSFER_REASON_INVALID:
      return 'reasonInvalid';
    case PLANNER_TRANSFER_TARGET_INVALID:
      return 'targetInvalid';
    case PLANNER_TRANSFER_VEHICLE_INACTIVE:
      return 'vehicleInactive';
    case PLANNER_TRANSFER_NO_CURRENT_PLANNER:
    case PLANNER_TRANSFER_REQUEST_FORBIDDEN:
      return 'notAllowed';
    default:
      break;
  }
  if (err instanceof ApiResponseError) {
    if (err.status === 409) return 'alreadyPending';
    if (err.status === 403 || err.status === 404) return 'notAllowed';
  }
  return 'generic';
}

/** Approving / rejecting (`POST /planner-transfers/:id/approve|reject`). */
export type DecisionErrorKind =
  /** 409 — already decided / cancelled, or the vehicle's planista changed (U6). */
  | 'stale'
  /** 422 — the target planista is no longer an active planista. */
  | 'targetInactive'
  /** 422 — the vehicle is switched off. */
  | 'vehicleInactive'
  /** 422 on `reason` (rejection) — shown under the field. */
  | 'reasonInvalid'
  /** 403 — not a decider for this row (R3 / R4 / U10). */
  | 'forbidden'
  | 'generic';

export function decisionErrorKind(err: unknown): DecisionErrorKind {
  switch (problemCode(err)) {
    case PLANNER_TRANSFER_NOT_PENDING:
    case PLANNER_TRANSFER_PLANNER_CHANGED:
      return 'stale';
    case PLANNER_TRANSFER_TARGET_INVALID:
      return 'targetInactive';
    case PLANNER_TRANSFER_VEHICLE_INACTIVE:
      return 'vehicleInactive';
    case PLANNER_TRANSFER_REASON_INVALID:
      return 'reasonInvalid';
    case PLANNER_TRANSFER_NOT_DECIDER:
    case PLANNER_TRANSFER_DECIDER_IS_REQUESTER:
    case PLANNER_TRANSFER_DECIDER_IS_TARGET:
      return 'forbidden';
    default:
      break;
  }
  if (err instanceof ApiResponseError) {
    // A row that vanished (404) is as stale as a decided one.
    if (err.status === 409 || err.status === 404) return 'stale';
    if (err.status === 403) return 'forbidden';
  }
  return 'generic';
}

/** Cancelling one's own request (`POST /planner-transfers/:id/cancel`). */
export type CancelErrorKind = 'notPending' | 'generic';

export function cancelErrorKind(err: unknown): CancelErrorKind {
  const code = problemCode(err);
  if (code === PLANNER_TRANSFER_NOT_PENDING) return 'notPending';
  if (code === PLANNER_TRANSFER_CANCEL_NOT_AUTHOR) return 'generic';
  if (err instanceof ApiResponseError && (err.status === 409 || err.status === 404)) {
    return 'notPending';
  }
  return 'generic';
}

/**
 * `GET /vehicles/:id/planner-history` answered 403 — the viewer is outside U11
 * (przewoźnik, dyspozytor, the previous planista…). The history section is then
 * omitted silently; any other failure gets an error line + retry.
 */
export function isHistoryForbidden(err: unknown): boolean {
  return classifyApiError(err) === 'forbidden';
}
