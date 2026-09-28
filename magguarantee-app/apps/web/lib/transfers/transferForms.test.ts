import { describe, expect, it } from 'vitest';

import {
  PLANNER_TRANSFER_REASON_MAX,
  approveFormSchema,
  rejectFormSchema,
  requestFormSchema,
} from './transferForms';

const MSGS = {
  vehicleRequired: 'vehicle',
  targetRequired: 'target',
  reasonRequired: 'reason-min',
  reasonTooLong: 'reason-max',
};
const TARGET = '00000000-0000-4000-8000-000000000001';

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : (result.error?.issues ?? []).map((i) => i.message);
}

describe('requestFormSchema (§17.3)', () => {
  it('first entry: the vehicle is fixed, only target + reason are required', () => {
    const s = requestFormSchema(MSGS, false);
    expect(s.safeParse({ vehicleId: '', toPlannerId: TARGET, reason: 'Zmiana' }).success).toBe(true);
  });

  it('second entry: the vehicle must be picked', () => {
    const s = requestFormSchema(MSGS, true);
    expect(messages(s.safeParse({ vehicleId: '', toPlannerId: TARGET, reason: 'Zmiana' }))).toEqual([
      'vehicle',
    ]);
  });

  it('target required', () => {
    const s = requestFormSchema(MSGS, false);
    expect(messages(s.safeParse({ vehicleId: '', toPlannerId: '', reason: 'Zmiana' }))).toEqual([
      'target',
    ]);
  });

  it.each(['', '  ', 'ab', '  ab  '])('reason %j is too short after trimming', (reason) => {
    const s = requestFormSchema(MSGS, false);
    expect(messages(s.safeParse({ vehicleId: '', toPlannerId: TARGET, reason }))).toEqual([
      'reason-min',
    ]);
  });

  it('reason longer than the shared max is refused', () => {
    const s = requestFormSchema(MSGS, false);
    const reason = 'x'.repeat(PLANNER_TRANSFER_REASON_MAX + 1);
    expect(messages(s.safeParse({ vehicleId: '', toPlannerId: TARGET, reason }))).toEqual([
      'reason-max',
    ]);
  });
});

describe('rejectFormSchema (§17.5.5)', () => {
  it('requires a 3+ char reason', () => {
    const s = rejectFormSchema(MSGS);
    expect(s.safeParse({ reason: 'Nie' }).success).toBe(true);
    expect(messages(s.safeParse({ reason: 'no' }))).toEqual(['reason-min']);
  });
});

describe('approveFormSchema (§17.5.5)', () => {
  it('the comment is optional but capped', () => {
    const s = approveFormSchema({ commentTooLong: 'long' });
    expect(s.safeParse({ comment: '' }).success).toBe(true);
    expect(messages(s.safeParse({ comment: 'x'.repeat(501) }))).toEqual(['long']);
  });
});
