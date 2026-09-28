// `VehicleEditFormSchema` — the web vehicle EDIT form's resolver (docs/29 R1,
// docs/14 §17.2.2). It must validate like the create body (same cross-field
// rules) while never requiring — and never emitting — `plannerId`, because a
// PATCH that carries it is refused with 422.

import { describe, expect, it } from 'vitest';

import {
  CreateVehicleSchema,
  VehicleEditFormSchema,
} from '../src/schemas/vehicles';

/** A complete edit-form value set (min-2-of-{gb,it,fr} satisfied), no plannerId. */
function baseEdit(overrides: Record<string, unknown> = {}) {
  return {
    carrierId: '11111111-1111-1111-1111-111111111111',
    plateNumber: 'WA0001',
    certificateL: true,
    type: 'STD',
    dispatchTeamId: '33333333-3333-3333-3333-333333333333',
    gb: true,
    it: true,
    fr: false,
    rateDe: 0.5,
    rateUe: 0.5,
    rateExport: 0.5,
    rateImport: 0.5,
    ...overrides,
  };
}

describe('VehicleEditFormSchema', () => {
  it('accepts a complete vehicle without plannerId', () => {
    const r = VehicleEditFormSchema.safeParse(baseEdit());
    expect(r.success).toBe(true);
  });

  it('create still requires plannerId (R7) — the two schemas differ only there', () => {
    expect(CreateVehicleSchema.safeParse(baseEdit()).success).toBe(false);
  });

  it.each([
    '22222222-2222-2222-2222-222222222222',
    '',
    undefined,
  ])('drops a stray plannerId=%j instead of failing the form', (plannerId) => {
    const r = VehicleEditFormSchema.safeParse(baseEdit({ plannerId }));
    expect(r.success).toBe(true);
    if (r.success) expect('plannerId' in r.data).toBe(false);
  });

  it('keeps the create cross-field rules (min 2 of gb/it/fr on path gb)', () => {
    const r = VehicleEditFormSchema.safeParse(baseEdit({ it: false }));
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('gb');
    }
  });

  it('keeps the HARD fuelCard ⇒ agreement rule', () => {
    const r = VehicleEditFormSchema.safeParse(
      baseEdit({
        fuelCard: true,
        agreement: false,
        fuelCardNumber: '1234567890123456',
        fuelCardExpiry: '2030-01-01',
        fuelCardPin: '1234',
      }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join('.'))).toContain('fuelCard');
    }
  });
});
