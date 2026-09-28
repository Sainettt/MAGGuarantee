// docs/29 — wire contracts of the vehicle planner transfer, the PATCH /vehicles
// refusal of `plannerId`, and the user `liderId` link.
//
// Business-rule issues carry `params.code` (the api's ZodValidationPipe turns
// an all-business-rule failure into 422 + `extensions.code`, docs/13 «Формат
// ответов»); shape errors stay plain issues (400).

import { describe, expect, it } from 'vitest';
import type { ZodIssue } from 'zod';

import {
  ApprovePlannerTransferSchema,
  CreatePlannerTransferSchema,
  PLANNER_TRANSFER_REASON_INVALID,
  PlannerTransferListQuerySchema,
  RejectPlannerTransferSchema,
} from '../src/schemas/planner-transfers';
import {
  CreateUserRequestSchema,
  USER_LIDER_ID_INVALID,
  UpdateUserSchema,
  UserFiltersSchema,
} from '../src/schemas/users';
import {
  UpdateVehicleSchema,
  VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER,
} from '../src/schemas/vehicles';

const UUID = '7d0f5d0e-8f2a-4a8b-9c4e-2b1a3c4d5e6f';

function codes(issues: ZodIssue[]): unknown[] {
  return issues.map((i) => (i.code === 'custom' ? i.params?.code : i.code));
}

describe('UpdateVehicleSchema — plannerId (docs/29 R1)', () => {
  it.each([UUID, null, ''])('refuses plannerId=%j with the business code', (value) => {
    const r = UpdateVehicleSchema.safeParse({ notes: 'x', plannerId: value });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(codes(r.error.issues)).toEqual([VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER]);
      expect(r.error.issues[0]?.path).toEqual(['plannerId']);
    }
  });

  it('parses a body without it, and the output has no plannerId key', () => {
    const r = UpdateVehicleSchema.safeParse({ notes: 'x' });
    expect(r.success).toBe(true);
    if (r.success) expect('plannerId' in r.data).toBe(false);
  });
});

describe('CreatePlannerTransferSchema', () => {
  it('trims the reason and accepts 3..500 chars', () => {
    const r = CreatePlannerTransferSchema.safeParse({ toPlannerId: UUID, reason: '  Zmiana  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.reason).toBe('Zmiana');
  });

  it.each(['', '   ', 'ab', 'x'.repeat(501)])(
    'reason %j → business issue PLANNER_TRANSFER_REASON_INVALID',
    (reason) => {
      const r = CreatePlannerTransferSchema.safeParse({ toPlannerId: UUID, reason });
      expect(r.success).toBe(false);
      if (!r.success) expect(codes(r.error.issues)).toEqual([PLANNER_TRANSFER_REASON_INVALID]);
    },
  );

  it('a missing target is a shape error (400), not a business one', () => {
    const r = CreatePlannerTransferSchema.safeParse({ reason: 'Powód' });
    expect(r.success).toBe(false);
    if (!r.success) expect(codes(r.error.issues)).toContain('invalid_type');
  });

  it('is strict', () => {
    expect(
      CreatePlannerTransferSchema.safeParse({ toPlannerId: UUID, reason: 'Powód', fromPlannerId: UUID })
        .success,
    ).toBe(false);
  });
});

describe('Reject / Approve bodies', () => {
  it('reject requires a reason (U3)', () => {
    const r = RejectPlannerTransferSchema.safeParse({ reason: ' ' });
    expect(r.success).toBe(false);
    if (!r.success) expect(codes(r.error.issues)).toEqual([PLANNER_TRANSFER_REASON_INVALID]);
    expect(RejectPlannerTransferSchema.parse({ reason: ' Nie teraz ' })).toEqual({ reason: 'Nie teraz' });
  });

  it('approve comment is optional; blank means none', () => {
    expect(ApprovePlannerTransferSchema.parse({})).toEqual({ comment: undefined });
    expect(ApprovePlannerTransferSchema.parse({ comment: '   ' })).toEqual({ comment: undefined });
    expect(ApprovePlannerTransferSchema.parse({ comment: ' OK ' })).toEqual({ comment: 'OK' });
  });
});

describe('PlannerTransferListQuerySchema', () => {
  it('requires the scope and defaults status=pending, limit=50', () => {
    expect(PlannerTransferListQuerySchema.safeParse({}).success).toBe(false);
    expect(PlannerTransferListQuerySchema.parse({ scope: 'decide' })).toEqual({
      scope: 'decide',
      status: 'pending',
      limit: 50,
    });
  });

  it('accepts the `decided` bucket and a terminal status', () => {
    expect(PlannerTransferListQuerySchema.parse({ scope: 'mine', status: 'decided' }).status).toBe('decided');
    expect(PlannerTransferListQuerySchema.parse({ scope: 'mine', status: 'rejected' }).status).toBe('rejected');
  });
});

describe('users — liderId (docs/29 U9)', () => {
  const base = { login: 'nowy', email: 'nowy@magtrans.eu', name: 'Nowy' };

  it('create: a leader link on a non-planista is a business issue', () => {
    const r = CreateUserRequestSchema.safeParse({ ...base, role: 'opiekun', liderId: UUID });
    expect(r.success).toBe(false);
    if (!r.success) expect(codes(r.error.issues)).toEqual([USER_LIDER_ID_INVALID]);
  });

  it('create: accepted on a planista; "" / null read as "none"', () => {
    expect(CreateUserRequestSchema.safeParse({ ...base, role: 'planista', liderId: UUID }).success).toBe(true);
    expect(CreateUserRequestSchema.parse({ ...base, role: 'planista', liderId: '' }).liderId).toBeNull();
  });

  it('update: "" clears (null), omitted leaves alone, liderEmail is gone', () => {
    expect(UpdateUserSchema.parse({ liderId: '' })).toEqual({ liderId: null });
    expect(UpdateUserSchema.parse({})).toEqual({});
    expect(UpdateUserSchema.safeParse({ liderEmail: 'a@b.pl' }).success).toBe(false);
  });

  it('filters: ?liderId=<uuid>', () => {
    expect(UserFiltersSchema.parse({ liderId: UUID }).liderId).toBe(UUID);
  });
});
