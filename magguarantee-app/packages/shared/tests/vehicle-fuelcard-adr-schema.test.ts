// Tests for the HARD `fuelCard=true ⇒ adr=true` cross-field rule wired into
// CreateVehicleSchema + UpdateVehicleSchema via `vehicleFuelCardAdrRefine`.
//
// A vehicle carrying a fuel card MUST also have the ADR flag (save-blocking).
// The Zod refine issues on `path: ['fuelCard']` with the message
// 'Karta paliwowa wymaga zaznaczenia ADR' — kept in lockstep with the service.
//
// Per the schema file's own note, on UPDATE the refine only fires when BOTH
// fields are present in the payload; the authoritative post-patch check lives
// in `VehiclesService`. These cases pin the SCHEMA-level behavior.
//
// UNRELATED to the derived, soft `fuelCardBlocked` badge (porozumienie scan).

import { describe, expect, it } from 'vitest';

import {
  CreateVehicleSchema,
  UpdateVehicleSchema,
} from '../src/schemas/vehicles';

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

describe('CreateVehicleSchema — fuelCard ⇒ adr', () => {
  it('rejects fuelCard=true with adr=false', () => {
    const result = CreateVehicleSchema.safeParse(
      baseCreate({ fuelCard: true, adr: false, ...FUEL_CARD_DETAILS }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'fuelCard',
      );
      expect(issue?.message).toBe('Karta paliwowa wymaga zaznaczenia ADR');
    }
  });

  it('rejects fuelCard=true with adr omitted (defaults to false-effective)', () => {
    const result = CreateVehicleSchema.safeParse(
      baseCreate({ fuelCard: true, ...FUEL_CARD_DETAILS }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts fuelCard=true with adr=true + adrClasses', () => {
    const result = CreateVehicleSchema.safeParse(
      baseCreate({
        fuelCard: true,
        adr: true,
        adrClasses: ['3'],
        ...FUEL_CARD_DETAILS,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts fuelCard=false with adr=false', () => {
    const result = CreateVehicleSchema.safeParse(
      baseCreate({ fuelCard: false, adr: false }),
    );
    expect(result.success).toBe(true);
  });
});

describe('UpdateVehicleSchema — fuelCard ⇒ adr (both fields present)', () => {
  it('rejects fuelCard=true + adr=false in the same PATCH', () => {
    const result = UpdateVehicleSchema.safeParse({
      fuelCard: true,
      adr: false,
      ...FUEL_CARD_DETAILS,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'fuelCard',
      );
      expect(issue?.message).toBe('Karta paliwowa wymaga zaznaczenia ADR');
    }
  });

  it('accepts fuelCard=true + adr=true in the same PATCH', () => {
    const result = UpdateVehicleSchema.safeParse({
      fuelCard: true,
      adr: true,
      adrClasses: ['3'],
      ...FUEL_CARD_DETAILS,
    });
    expect(result.success).toBe(true);
  });

  it('PARSES a partial PATCH with only fuelCard=true (adr absent — service is the gate)', () => {
    // The UPDATE guard requires BOTH fields present (`adr === false`), mirroring
    // the gb/it/fr `!== undefined` convention. A partial PATCH `{fuelCard:true}`
    // on a vehicle whose stored `adr=true` must NOT be false-rejected at the
    // Zod layer — the service's post-patch effective-state check is the
    // authoritative gate and covers the stored-adr edge exactly.
    const result = UpdateVehicleSchema.safeParse({
      fuelCard: true,
      ...FUEL_CARD_DETAILS,
    });
    expect(result.success).toBe(true);
  });

  it('PARSES a partial PATCH with only adr=false (fuelCard absent — service is the gate)', () => {
    // Symmetric: turning ADR off without touching fuelCard defers to the
    // service, which sees the stored fuelCard and 422s if it is true.
    const result = UpdateVehicleSchema.safeParse({ adr: false, adrClasses: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a PATCH that does NOT touch fuelCard (rule inert)', () => {
    // Neither fuelCard nor adr in the payload → guard no-ops; the service
    // still asserts the effective post-patch state.
    const result = UpdateVehicleSchema.safeParse({ plateNumber: 'WA9999' });
    expect(result.success).toBe(true);
  });
});
