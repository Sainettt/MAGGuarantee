// Wire contracts of the reklamacja rework (2026-07-31), Zod level:
//
//  • `SubmitReklamacjaSchema` — kwota must be STRICTLY positive;
//  • `UpdateClaimSchema` accept branch — `reklamacjaOrderNumber` REQUIRED, the
//    staff amount and every correction field REMOVED (`.strict()` rejects them);
//  • `UpdateClaimSchema` reject branch — `comment` still REQUIRED (it is the
//    justification persisted to `reklamacjaResponse`).

import { describe, expect, it } from 'vitest';

import {
  ReklamacjaResolutionSchema,
  SubmitReklamacjaSchema,
  UpdateClaimSchema,
} from '../src/schemas/claims';

describe('SubmitReklamacjaSchema', () => {
  it('accepts a positive kwota with a treść', () => {
    const parsed = SubmitReklamacjaSchema.safeParse({
      tresc: 'Za mało wypłacono.',
      kwotaReklamacji: 0.01,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects kwota 0 — a reklamacja asking for nothing is malformed', () => {
    const parsed = SubmitReklamacjaSchema.safeParse({
      tresc: 'Za mało wypłacono.',
      kwotaReklamacji: 0,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a negative kwota', () => {
    expect(
      SubmitReklamacjaSchema.safeParse({
        tresc: 'x',
        kwotaReklamacji: -5,
      }).success,
    ).toBe(false);
  });

  it('rejects an empty treść (the justification is mandatory)', () => {
    expect(
      SubmitReklamacjaSchema.safeParse({ tresc: '', kwotaReklamacji: 10 })
        .success,
    ).toBe(false);
  });

  it('is strict — no stray keys (e.g. a smuggled mileage correction)', () => {
    expect(
      SubmitReklamacjaSchema.safeParse({
        tresc: 'x',
        kwotaReklamacji: 10,
        mileage: 9_000,
      }).success,
    ).toBe(false);
  });
});

describe('UpdateClaimSchema — REKLAMACJA_ZAAKCEPTOWANO', () => {
  it('accepts { reklamacjaOrderNumber } with an optional comment', () => {
    const parsed = UpdateClaimSchema.safeParse({
      targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
      reklamacjaOrderNumber: 'ZL-2026-118',
      comment: 'Uznajemy różnicę.',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts it without a comment (an acceptance needs no justification)', () => {
    expect(
      UpdateClaimSchema.safeParse({
        targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
        reklamacjaOrderNumber: 'ZL-2026-118',
      }).success,
    ).toBe(true);
  });

  it('REJECTS a missing reklamacjaOrderNumber (DB CHECK mirror)', () => {
    const parsed = UpdateClaimSchema.safeParse({
      targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
      comment: 'Uznajemy.',
    });
    expect(parsed.success).toBe(false);
  });

  it('REJECTS an empty reklamacjaOrderNumber', () => {
    expect(
      UpdateClaimSchema.safeParse({
        targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
        reklamacjaOrderNumber: '',
      }).success,
    ).toBe(false);
  });

  it('REJECTS a staff-supplied reklamacjaAmount (the carrier kwota is what gets paid)', () => {
    expect(
      UpdateClaimSchema.safeParse({
        targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
        reklamacjaOrderNumber: 'ZL-1',
        reklamacjaAmount: 450,
      }).success,
    ).toBe(false);
  });

  it('REJECTS correction fields — a reklamacja no longer amends carrier data', () => {
    for (const extra of [
      { mileage: 9_000 },
      { dateStart: '2026-06-01' },
      { dateEnd: '2026-06-20' },
      { timeFrom: '08:00' },
      { timeTo: '18:00' },
      { hoursAdjusted: 12 },
    ]) {
      expect(
        UpdateClaimSchema.safeParse({
          targetStatus: 'REKLAMACJA_ZAAKCEPTOWANO',
          reklamacjaOrderNumber: 'ZL-1',
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
});

describe('UpdateClaimSchema — REKLAMACJA_ODRZUCONO', () => {
  it('accepts a comment (the rejection justification)', () => {
    expect(
      UpdateClaimSchema.safeParse({
        targetStatus: 'REKLAMACJA_ODRZUCONO',
        comment: 'Kwota zgodna z umową.',
      }).success,
    ).toBe(true);
  });

  it('REJECTS a missing comment', () => {
    expect(
      UpdateClaimSchema.safeParse({ targetStatus: 'REKLAMACJA_ODRZUCONO' })
        .success,
    ).toBe(false);
  });

  it('REJECTS correction fields', () => {
    expect(
      UpdateClaimSchema.safeParse({
        targetStatus: 'REKLAMACJA_ODRZUCONO',
        comment: 'Nie uznajemy.',
        mileage: 9_000,
      }).success,
    ).toBe(false);
  });
});

describe('ReklamacjaResolutionSchema', () => {
  it('is exactly the DB enum', () => {
    expect(ReklamacjaResolutionSchema.options).toEqual(['UZNANA', 'ODRZUCONA']);
  });

  it('rejects a ClaimStatus value (the outcome is NOT a status)', () => {
    expect(ReklamacjaResolutionSchema.safeParse('ZAAKCEPTOWANO').success).toBe(
      false,
    );
  });
});
