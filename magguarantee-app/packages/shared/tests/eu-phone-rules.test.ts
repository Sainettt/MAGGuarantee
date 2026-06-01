// Per-country phone plausibility tests (soft UI hint helper only).
//
// Mirrors the eu-postal-codes test convention. Three concerns:
//   1. Self-consistency — every country's documented `example` is plausible
//      against its own rule (guards against a typo in a min/max range).
//   2. A few hand-picked plausible / implausible cases for a couple of countries.
//   3. Passthrough edge cases — empty raw, unknown country.
//
// `isPlausiblePhone` is SOFT-WARNING ONLY and is NOT wired into any Zod schema.

import { describe, expect, it } from 'vitest';

import {
  EU_PHONE_RULES,
  EU_VAT_COUNTRY_CODES,
  isPlausiblePhone,
} from '../src/constants';

describe('isPlausiblePhone — each country example is plausible against its own rule', () => {
  for (const code of EU_VAT_COUNTRY_CODES) {
    const rule = EU_PHONE_RULES[code];
    it(`${code}: accepts the documented example "${rule.example}"`, () => {
      expect(isPlausiblePhone(code, rule.example)).toBe(true);
    });
  }
});

describe('isPlausiblePhone — plausible cases (a couple of countries)', () => {
  it('PL: accepts a 9-digit national number, with or without +48', () => {
    expect(isPlausiblePhone('PL', '512345678')).toBe(true);
    expect(isPlausiblePhone('PL', '+48 512 345 678')).toBe(true);
    expect(isPlausiblePhone('PL', '(48) 512-345-678')).toBe(true);
    expect(isPlausiblePhone('PL', '48512345678')).toBe(true);
  });

  it('DE: accepts both a short landline and a long mobile (wide range)', () => {
    expect(isPlausiblePhone('DE', '+49 30 123456')).toBe(true); // 6 national digits
    expect(isPlausiblePhone('DE', '+49 151 23456789')).toBe(true); // 11 national digits
  });
});

describe('isPlausiblePhone — implausible cases (clearly wrong length)', () => {
  it('PL: rejects far-too-few and far-too-many digits', () => {
    expect(isPlausiblePhone('PL', '1234')).toBe(false);
    expect(isPlausiblePhone('PL', '+48 1234')).toBe(false);
    expect(isPlausiblePhone('PL', '512345678901234')).toBe(false);
  });

  it('DE: rejects 4 digits and 20 digits (outside the 6–11 range)', () => {
    expect(isPlausiblePhone('DE', '+49 12')).toBe(false); // 2 national digits
    expect(isPlausiblePhone('DE', '+49 12345678901234567890')).toBe(false);
  });
});

describe('isPlausiblePhone — passthrough edge cases (never warn)', () => {
  it('returns true for an empty raw value', () => {
    expect(isPlausiblePhone('PL', '')).toBe(true);
    expect(isPlausiblePhone('DE', '')).toBe(true);
    expect(isPlausiblePhone('', '')).toBe(true);
  });

  it('returns true for an unknown country code (defensive)', () => {
    expect(isPlausiblePhone('GR', '+30 691 234 5678')).toBe(true); // Greece is `EL`
    expect(isPlausiblePhone('US', '+1 202 555 0143')).toBe(true);
    expect(isPlausiblePhone('', '512345678')).toBe(true);
  });

  it('returns true when the value strips down to no digits', () => {
    expect(isPlausiblePhone('PL', '+()- ')).toBe(true);
  });
});
