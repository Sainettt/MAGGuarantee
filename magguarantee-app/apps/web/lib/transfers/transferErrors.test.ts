import { describe, expect, it } from 'vitest';

import { ApiResponseError } from '@/lib/api/client';

import {
  cancelErrorKind,
  decisionErrorKind,
  isHistoryForbidden,
  requestErrorKind,
} from './transferErrors';

function problem(status: number, code?: string): ApiResponseError {
  return new ApiResponseError(status, 'detail', {
    detail: 'detail',
    ...(code ? { extensions: { code } } : {}),
  });
}

describe('requestErrorKind (§17.3)', () => {
  it.each([
    [409, 'PLANNER_TRANSFER_ALREADY_PENDING', 'alreadyPending'],
    [422, 'PLANNER_TRANSFER_REASON_INVALID', 'reasonInvalid'],
    [422, 'PLANNER_TRANSFER_TARGET_INVALID', 'targetInvalid'],
    [422, 'PLANNER_TRANSFER_VEHICLE_INACTIVE', 'vehicleInactive'],
    [422, 'PLANNER_TRANSFER_NO_CURRENT_PLANNER', 'notAllowed'],
    [403, 'PLANNER_TRANSFER_REQUEST_FORBIDDEN', 'notAllowed'],
  ])('%i %s → %s', (status, code, kind) => {
    expect(requestErrorKind(problem(status, code))).toBe(kind);
  });

  it('falls back on the status when the code is missing', () => {
    expect(requestErrorKind(problem(409))).toBe('alreadyPending');
    expect(requestErrorKind(problem(403))).toBe('notAllowed');
    expect(requestErrorKind(problem(404))).toBe('notAllowed');
  });

  it('network / 5xx / 400 / unknown → generic (toast + retry)', () => {
    expect(requestErrorKind(new TypeError('Failed to fetch'))).toBe('generic');
    expect(requestErrorKind(problem(500))).toBe('generic');
    expect(requestErrorKind(problem(400))).toBe('generic');
    expect(requestErrorKind(new Error('boom'))).toBe('generic');
  });
});

describe('decisionErrorKind (§17.5.5)', () => {
  it.each([
    [409, 'PLANNER_TRANSFER_NOT_PENDING', 'stale'],
    [409, 'PLANNER_TRANSFER_PLANNER_CHANGED', 'stale'],
    [422, 'PLANNER_TRANSFER_TARGET_INVALID', 'targetInactive'],
    [422, 'PLANNER_TRANSFER_VEHICLE_INACTIVE', 'vehicleInactive'],
    [422, 'PLANNER_TRANSFER_REASON_INVALID', 'reasonInvalid'],
    [403, 'PLANNER_TRANSFER_NOT_DECIDER', 'forbidden'],
    [403, 'PLANNER_TRANSFER_DECIDER_IS_REQUESTER', 'forbidden'],
    [403, 'PLANNER_TRANSFER_DECIDER_IS_TARGET', 'forbidden'],
  ])('%i %s → %s', (status, code, kind) => {
    expect(decisionErrorKind(problem(status, code))).toBe(kind);
  });

  it('a vanished row (404) or an un-coded 409 is stale; un-coded 403 forbidden', () => {
    expect(decisionErrorKind(problem(404))).toBe('stale');
    expect(decisionErrorKind(problem(409))).toBe('stale');
    expect(decisionErrorKind(problem(403))).toBe('forbidden');
  });

  it('network / 5xx → generic', () => {
    expect(decisionErrorKind(new TypeError('fetch failed'))).toBe('generic');
    expect(decisionErrorKind(problem(503))).toBe('generic');
  });
});

describe('cancelErrorKind (§17.5.6)', () => {
  it('already decided → notPending; the rest → generic', () => {
    expect(cancelErrorKind(problem(409, 'PLANNER_TRANSFER_NOT_PENDING'))).toBe('notPending');
    expect(cancelErrorKind(problem(409))).toBe('notPending');
    expect(cancelErrorKind(problem(403, 'PLANNER_TRANSFER_CANCEL_NOT_AUTHOR'))).toBe('generic');
    expect(cancelErrorKind(new TypeError('Failed to fetch'))).toBe('generic');
  });
});

describe('isHistoryForbidden (§17.6.1)', () => {
  it('only a 403 hides the section silently', () => {
    expect(isHistoryForbidden(problem(403))).toBe(true);
    expect(isHistoryForbidden(problem(500))).toBe(false);
    expect(isHistoryForbidden(new TypeError('Failed to fetch'))).toBe(false);
  });
});
