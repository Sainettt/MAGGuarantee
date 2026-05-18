// Per-country postal-code validation tests.
//
// Covers the 27 EU countries from `EU_VAT_COUNTRY_CODES` (Greece is `EL`).
// Two parallel suites:
//   1. Positive — every country's documented `example` validates.
//   2. Negative — a deliberately-broken sample for every country fails.
// Plus a handful of edge cases (unknown code, empty string, case handling).

import { describe, expect, it } from 'vitest';

import {
  EU_POSTAL_CODES,
  EU_VAT_COUNTRY_CODES,
  isValidPostalCode,
} from '../src/constants';

describe('isValidPostalCode — positive examples for each EU country', () => {
  for (const code of EU_VAT_COUNTRY_CODES) {
    const rule = EU_POSTAL_CODES[code];
    it(`${code}: accepts the documented example "${rule.example}"`, () => {
      expect(isValidPostalCode(code, rule.example)).toBe(true);
    });
  }
});

describe('isValidPostalCode — rejects deliberately broken samples', () => {
  // One mangled value per country. Chosen to break the relevant constraint
  // (length, prefix, separator, allowed alphabet).
  const NEGATIVE: Record<(typeof EU_VAT_COUNTRY_CODES)[number], string> = {
    AT: '101',           // too short (4 digits required)
    BE: '10000',         // too long
    BG: 'AB12',          // letters not allowed
    CY: '10',            // too short
    CZ: '11000A',        // trailing letter
    DE: '1011',          // too short (5 required)
    DK: '105',           // too short
    EE: '1011',          // too short
    EL: '1234567',       // too long even with space stripped
    ES: '2800',          // too short
    FI: 'ABCDE',         // letters not allowed
    FR: '750',           // too short
    HR: '100',           // too short
    HU: '10115',         // too long (4 required)
    IE: '02 X285',       // 1st block must start with a letter
    IT: '0010',          // too short
    LT: 'LT-1234',       // too short (5 digits required after prefix)
    LU: '100',           // too short
    LV: '1010',          // missing `LV-` prefix
    MT: 'VL 1117',       // first block must be 3 letters
    NL: '1011 A',        // 2nd block must be 2 letters
    PL: '00001',         // missing hyphen
    PT: '1000001',       // missing hyphen
    RO: '01001',         // too short (6 required)
    SE: '11',            // too short
    SI: 'A1000',         // letter not allowed
    SK: '8',             // too short
  };

  for (const code of EU_VAT_COUNTRY_CODES) {
    const bad = NEGATIVE[code];
    it(`${code}: rejects "${bad}"`, () => {
      expect(isValidPostalCode(code, bad)).toBe(false);
    });
  }
});

describe('isValidPostalCode — edge cases', () => {
  it('returns false for an unknown country code', () => {
    expect(isValidPostalCode('GR', '105 57')).toBe(false); // Greece is `EL`
    expect(isValidPostalCode('UK', 'SW1A 1AA')).toBe(false);
    expect(isValidPostalCode('', '00-001')).toBe(false);
  });

  it('returns false for an empty postal code regardless of country', () => {
    expect(isValidPostalCode('PL', '')).toBe(false);
    expect(isValidPostalCode('DE', '')).toBe(false);
  });

  it('accepts mixed-case letters where the regex uses the /i flag', () => {
    // NL / IE / LT / LV / MT all use `/i` — uppercase mask is a UI concern,
    // not a validation one. The DTO accepts lowercase input.
    expect(isValidPostalCode('NL', '1011 ab')).toBe(true);
    expect(isValidPostalCode('IE', 'd02 x285')).toBe(true);
    expect(isValidPostalCode('LT', 'lt-01100')).toBe(true);
    expect(isValidPostalCode('LV', 'lv-1010')).toBe(true);
    expect(isValidPostalCode('MT', 'vlt 1117')).toBe(true);
  });

  it('LT accepts both forms — with and without the `LT-` prefix', () => {
    expect(isValidPostalCode('LT', 'LT-01100')).toBe(true);
    expect(isValidPostalCode('LT', '01100')).toBe(true);
  });

  it('formats with optional space are accepted with or without it', () => {
    // CZ/EL/SE/SK/IE/MT/NL all have an optional space in the regex.
    expect(isValidPostalCode('CZ', '11000')).toBe(true);
    expect(isValidPostalCode('CZ', '110 00')).toBe(true);
    expect(isValidPostalCode('NL', '1011AB')).toBe(true);
    expect(isValidPostalCode('NL', '1011 AB')).toBe(true);
  });
});
