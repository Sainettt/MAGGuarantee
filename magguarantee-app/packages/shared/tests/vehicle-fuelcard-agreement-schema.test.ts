// Tests for the HARD `fuelCard=true ⇒ agreement=true` cross-field rule wired
// into CreateVehicleSchema + UpdateVehicleSchema via
// `vehicleFuelCardAgreementRefine`.
//
// A vehicle carrying a fuel card MUST also have the porozumienie FLAG
// (save-blocking). The Zod refine issues on `path: ['fuelCard']` with the
// message 'Karta paliwowa wymaga zaznaczenia porozumienia' — kept in lockstep
// with the service. `agreement` is nullable — NULL is treated as false.
//
// Per the schema file's own note, on UPDATE the guard only fires when BOTH
// fields are present in the payload; the authoritative post-patch check lives
// in `VehiclesService`. These cases pin the SCHEMA-level behavior.
//
// This is the HARD gate on the FLAG only. It is UNRELATED to the derived, SOFT
// `fuelCardBlocked` badge (missing porozumienie SCAN) — that stays untouched.

import { describe, expect, it } from 'vitest';

import {
  CreateVehicleSchema,
  UpdateVehicleSchema,
} from '../src/schemas/vehicles';

const MESSAGE = 'Karta paliwowa wymaga zaznaczenia porozumienia';

/** A complete, otherwise-valid create payload (min-2-of-{gb,it,fr} satisfied). */
function baseCreate(overrides: Record<string, unknown> = {}) {
  return {
    carrierId: '11111111-1111-1111-1111-111111111111',
    plateNumber: 'WA0001',
    certificateL: true,
    type: 'STD',
    plannerId: '22222222-2222-2222-2222-222222222222',
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

const FUEL_CARD_DETAILS = {
  fuelCardNumber: '1234567890123456',
  fuelCardExpiry: '2030-01-01',
  fuelCardPin: '1234',
};

describe('CreateVehicleSchema — fuelCard ⇒ agreement', () => {
  it('rejects fuelCard=true with agreement=false', () => {
    const result = CreateVehicleSchema.safeParse(
      baseCreate({ fuelCard: true, agreement: false, ...FUEL_CARD_DETAILS }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'fuelCard',
      );
      expect(issue?.message).toBe(MESSAGE);
    }
  });

  it('rejects fuelCard=true with agreement omitted (absent counts as false)', () => {
    const result = CreateVehicleSchema.safeParse(
      baseCreate({ fuelCard: true, ...FUEL_CARD_DETAILS }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts fuelCard=true with agreement=true', () => {
    const result = CreateVehicleSchema.safeParse(
      baseCreate({
        fuelCard: true,
        agreement: true,
        ...FUEL_CARD_DETAILS,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts fuelCard=false with agreement=false (no card, no porozumienie needed)', () => {
    const result = CreateVehicleSchema.safeParse(
      baseCreate({ fuelCard: false, agreement: false }),
    );
    expect(result.success).toBe(true);
  });
});

describe('UpdateVehicleSchema — fuelCard ⇒ agreement (both fields present)', () => {
  it('rejects fuelCard=true + agreement=false in the same PATCH', () => {
    const result = UpdateVehicleSchema.safeParse({
      fuelCard: true,
      agreement: false,
      ...FUEL_CARD_DETAILS,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'fuelCard',
      );
      expect(issue?.message).toBe(MESSAGE);
    }
  });

  it('rejects fuelCard=true + agreement=null (clearing the flag) in the same PATCH', () => {
    // `agreement` is nullable — explicit null in the payload means "clear to
    // false", so it is BOTH-present and trips the guard.
    const result = UpdateVehicleSchema.safeParse({
      fuelCard: true,
      agreement: null,
      ...FUEL_CARD_DETAILS,
    });
    expect(result.success).toBe(false);
  });

  it('accepts fuelCard=true + agreement=true in the same PATCH', () => {
    const result = UpdateVehicleSchema.safeParse({
      fuelCard: true,
      agreement: true,
      ...FUEL_CARD_DETAILS,
    });
    expect(result.success).toBe(true);
  });

  it('PARSES a partial PATCH with only fuelCard=true (agreement absent — service is the gate)', () => {
    // The UPDATE guard requires BOTH fields present, mirroring the gb/it/fr
    // `!== undefined` convention. A partial PATCH `{fuelCard:true}` on a vehicle
    // whose stored `agreement=true` must NOT be false-rejected at the Zod layer
    // — the service's post-patch effective-state check is the authoritative
    // gate and covers the stored-agreement edge exactly.
    const result = UpdateVehicleSchema.safeParse({
      fuelCard: true,
      ...FUEL_CARD_DETAILS,
    });
    expect(result.success).toBe(true);
  });

  it('PARSES a partial PATCH with only agreement=false (fuelCard absent — service is the gate)', () => {
    // Symmetric: turning the porozumienie flag off without touching fuelCard
    // defers to the service, which sees the stored fuelCard and 422s if true.
    const result = UpdateVehicleSchema.safeParse({ agreement: false });
    expect(result.success).toBe(true);
  });

  it('accepts a PATCH that does NOT touch fuelCard (rule inert)', () => {
    // Neither fuelCard nor agreement in the payload → guard no-ops; the service
    // still asserts the effective post-patch state.
    const result = UpdateVehicleSchema.safeParse({ plateNumber: 'WA9999' });
    expect(result.success).toBe(true);
  });
});
