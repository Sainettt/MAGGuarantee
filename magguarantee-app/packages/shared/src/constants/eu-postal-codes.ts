// Per-country postal-code rules for the 27 EU member states.
//
// Reused by:
//  - `@magguarantee/shared` Zod schemas (delegations.ts cross-field validation)
//  - the web `MaskedInput` component (renders the placeholder, inserts literal
//    chars as the user types).
//
// Greece uses `EL` (the VIES code used everywhere in this codebase) — the
// underlying postal format is the same that UPU documents under `GR`.

import {
  EU_VAT_COUNTRY_CODES as _EU_VAT_COUNTRY_CODES,
  type EuVatCountryCode,
} from './eu-vat-countries';

/**
 * `mask` dialect:
 *   `9` — digit slot (0-9)
 *   `A` — uppercase letter slot (A-Z)
 *   anything else — literal character (rendered as-is, inserted as the user
 *   types).
 *
 * `regex` is intentionally lenient on spacing/case — humans type both `1011AB`
 * and `1011 ab` for NL — but strict enough to reject obviously-wrong inputs.
 * Case-insensitive (`/i`) on letter-bearing patterns; normalization to upper
 * case happens at the UI layer (the mask renders uppercase letter slots).
 */
export interface EuPostalRule {
  regex: RegExp;
  example: string;
  mask: string;
}

// Keep this object total over `EuVatCountryCode` — TypeScript enforces that
// every EU code has a rule. Adding a new country to the enum is a compile
// error here until a rule is added too.
export const EU_POSTAL_CODES: Record<EuVatCountryCode, EuPostalRule> = {
  AT: { regex: /^\d{4}$/, example: '1010', mask: '9999' },
  BE: { regex: /^\d{4}$/, example: '1000', mask: '9999' },
  BG: { regex: /^\d{4}$/, example: '1000', mask: '9999' },
  CY: { regex: /^\d{4}$/, example: '1010', mask: '9999' },
  CZ: { regex: /^\d{3} ?\d{2}$/, example: '110 00', mask: '999 99' },
  DE: { regex: /^\d{5}$/, example: '10115', mask: '99999' },
  DK: { regex: /^\d{4}$/, example: '1050', mask: '9999' },
  EE: { regex: /^\d{5}$/, example: '10111', mask: '99999' },
  // Greece — `EL` is the VIES code; UPU lists the postal format under `GR`.
  EL: { regex: /^\d{3} ?\d{2}$/, example: '105 57', mask: '999 99' },
  ES: { regex: /^\d{5}$/, example: '28001', mask: '99999' },
  FI: { regex: /^\d{5}$/, example: '00100', mask: '99999' },
  FR: { regex: /^\d{5}$/, example: '75001', mask: '99999' },
  HR: { regex: /^\d{5}$/, example: '10000', mask: '99999' },
  HU: { regex: /^\d{4}$/, example: '1011', mask: '9999' },
  // Ireland — Eircode: 1 letter + 2 digits, then 4 alphanumerics.
  IE: { regex: /^[A-Z]\d{2} ?[A-Z0-9]{4}$/i, example: 'D02 X285', mask: 'A99 AAAA' },
  IT: { regex: /^\d{5}$/, example: '00100', mask: '99999' },
  // Lithuania — `LT-` prefix optional (UPU formal vs. local short form).
  LT: { regex: /^(LT-)?\d{5}$/i, example: 'LT-01100', mask: 'LT-99999' },
  LU: { regex: /^\d{4}$/, example: '1009', mask: '9999' },
  // Latvia — `LV-` prefix is required by Latvijas Pasts.
  LV: { regex: /^LV-\d{4}$/i, example: 'LV-1010', mask: 'LV-9999' },
  MT: { regex: /^[A-Z]{3} ?\d{4}$/i, example: 'VLT 1117', mask: 'AAA 9999' },
  NL: { regex: /^\d{4} ?[A-Z]{2}$/i, example: '1011 AB', mask: '9999 AA' },
  PL: { regex: /^\d{2}-\d{3}$/, example: '00-001', mask: '99-999' },
  PT: { regex: /^\d{4}-\d{3}$/, example: '1000-001', mask: '9999-999' },
  RO: { regex: /^\d{6}$/, example: '010011', mask: '999999' },
  SE: { regex: /^\d{3} ?\d{2}$/, example: '111 22', mask: '999 99' },
  SI: { regex: /^\d{4}$/, example: '1000', mask: '9999' },
  SK: { regex: /^\d{3} ?\d{2}$/, example: '811 01', mask: '999 99' },
};

// Compile-time guard: completeness over EU codes. Will fail to compile if
// `EU_POSTAL_CODES` ever drops a code from the union.
const _EU_POSTAL_CODES_COMPLETE: Record<
  (typeof _EU_VAT_COUNTRY_CODES)[number],
  EuPostalRule
> = EU_POSTAL_CODES;
void _EU_POSTAL_CODES_COMPLETE;

/**
 * Validate a postal code against the rules for its country.
 *
 * Returns `false` for unknown country codes (defensive — callers should
 * validate the country with the EU enum *before* calling this).
 */
export function isValidPostalCode(
  country: string,
  postalCode: string,
): boolean {
  const rule = EU_POSTAL_CODES[country as EuVatCountryCode];
  if (!rule) return false;
  return rule.regex.test(postalCode);
}
