// Per-country identity-document plausibility tests (soft UI hint helper only).
//
// Mirrors the eu-postal-codes test convention. Three concerns:
//   1. Self-consistency — every country's documented `example` is plausible
//      against its own rule (length range + optional lenient regex).
//   2. A few hand-picked plausible / implausible cases for a couple of countries.
//   3. Passthrough edge cases — empty raw, unknown country.
//
// `isPlausibleIdDocument` is SOFT-WARNING ONLY and is NOT wired into any Zod
// schema. The check is deliberately lenient (must pass multiple document types).

import { describe, expect, it } from 'vitest';

import {
  EU_ID_DOCUMENT_RULES,
  EU_VAT_COUNTRY_CODES,
  isPlausibleIdDocument,
} from '../src/constants';

describe('isPlausibleIdDocument — each country example is plausible against its own rule', () => {
  for (const code of EU_VAT_COUNTRY_CODES) {
    const rule = EU_ID_DOCUMENT_RULES[code];
    it(`${code}: accepts the documented example "${rule.example}"`, () => {
      expect(isPlausibleIdDocument(code, rule.example)).toBe(true);
    });
  }
});

describe('isPlausibleIdDocument — plausible cases (a couple of countries)', () => {
  it('PL: accepts both dowód-osobisty and passport shapes (lenient regex)', () => {
    expect(isPlausibleIdDocument('PL', 'ABA123456')).toBe(true); // 3 letters + 6 digits
    expect(isPlausibleIdDocument('PL', 'AB1234567')).toBe(true); // passport: 2 letters + 7 digits
    expect(isPlausibleIdDocument('PL', '  ABA123456  ')).toBe(true); // surrounding whitespace trimmed
    expect(isPlausibleIdDocument('PL', 'aba123456')).toBe(true); // case-insensitive
  });

  it('DE: accepts varied alphanumeric document numbers (loose shape)', () => {
    expect(isPlausibleIdDocument('DE', 'L01X00T47')).toBe(true);
    expect(isPlausibleIdDocument('DE', 'T220001293')).toBe(true);
  });

  it('passes a country whose rule has no regex (length-range only)', () => {
    // AT omits regex entirely — any 7–10 char string is plausible.
    expect(isPlausibleIdDocument('AT', 'P1234567')).toBe(true);
    expect(isPlausibleIdDocument('AT', 'AB-123/45')).toBe(true);
  });
});

describe('isPlausibleIdDocument — implausible cases (clearly wrong length/shape)', () => {
  it('PL: rejects far-too-short and far-too-long values', () => {
    expect(isPlausibleIdDocument('PL', 'AB12')).toBe(false); // too short
    expect(isPlausibleIdDocument('PL', 'ABA1234567890')).toBe(false); // too long
  });

  it('PL: rejects a shape that clearly fails the lenient regex within range', () => {
    expect(isPlausibleIdDocument('PL', '123456789')).toBe(false); // all digits, no letters
  });

  it('DE: rejects out-of-range lengths', () => {
    expect(isPlausibleIdDocument('DE', 'L01X0')).toBe(false); // too short
    expect(isPlausibleIdDocument('DE', 'L01X00T47XYZ')).toBe(false); // too long
  });
});

describe('isPlausibleIdDocument — passthrough edge cases (never warn)', () => {
  it('returns true for an empty / whitespace-only raw value', () => {
    expect(isPlausibleIdDocument('PL', '')).toBe(true);
    expect(isPlausibleIdDocument('DE', '   ')).toBe(true);
    expect(isPlausibleIdDocument('', '')).toBe(true);
  });

  it('returns true for an unknown country code (defensive)', () => {
    expect(isPlausibleIdDocument('GR', 'AB123456')).toBe(true); // Greece is `EL`
    expect(isPlausibleIdDocument('US', '123-45-6789')).toBe(true);
    expect(isPlausibleIdDocument('', 'ABA123456')).toBe(true);
  });
});
