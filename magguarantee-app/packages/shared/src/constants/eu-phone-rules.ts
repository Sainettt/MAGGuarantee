// Per-country phone-number plausibility rules for the 27 EU member states.
//
// SOFT-WARNING ONLY — see docs/14 §6.1.2.
// =============================================================================
// THIS FILE IS CONSUMED EXCLUSIVELY BY THE WEB MASKED-INPUT COMPONENTS
// (`<MaskedPhoneInput>` in the Driver modal) FOR A SOFT, ON-BLUR FORMAT HINT.
//
// It is DELIBERATELY *NOT* imported by any Zod schema and NOT used by the API —
// UNLIKE `EU_POSTAL_CODES`, which delegations.ts wires into cross-field
// validation. That asymmetry is intentional (docs/14 §6.1.2 / §6.1.3-A).
//
// Driver `phone` / `phone2` Zod fields accept any 1–32 char string, full stop.
// DO NOT "fix" this by adding validation: a non-EU driver, a landline shorter
// than the mobile range, or an unusual format must always submit cleanly. The
// warning is a fat-finger nudge, never a gate. Do not import this into a schema.
// =============================================================================
//
// Greece uses `EL` (the VIES code used everywhere in this codebase) — the
// underlying calling code is the same one ITU documents under `GR`.

import {
  EU_VAT_COUNTRY_CODES as _EU_VAT_COUNTRY_CODES,
  type EuVatCountryCode,
} from './eu-vat-countries';

/**
 * A lenient phone plausibility rule. No rigid character-mask exists for phones
 * (national significant lengths vary by mobile vs landline vs special), so the
 * model is a calling code + a generous national-digit-count range, surfaced as
 * a *"~N digits / +CC"* soft hint.
 */
export interface EuPhoneRule {
  /** E.164 country calling code WITHOUT the leading '+', e.g. '48' for PL. */
  callingCode: string;
  /** Min plausible national significant digits (excludes the calling code). */
  minNationalLen: number;
  /** Max plausible national significant digits (excludes the calling code). */
  maxNationalLen: number;
  /** A realistic mobile example in the form the hint shows, incl. '+CC'. */
  example: string;
}

// Keep this object total over `EuVatCountryCode` — TypeScript enforces that
// every EU code has a rule. Adding a new country to the enum is a compile
// error here until a rule is added too.
//
// Ranges are deliberately WIDE plausibility bounds (cover mobile AND landline)
// so legitimate numbers never soft-warn. The point is to catch "typed 4 digits"
// or "typed 20 digits", not to validate against the official numbering plan.
export const EU_PHONE_RULES: Record<EuVatCountryCode, EuPhoneRule> = {
  AT: { callingCode: '43', minNationalLen: 4, maxNationalLen: 13, example: '+43 664 1234567' },
  BE: { callingCode: '32', minNationalLen: 8, maxNationalLen: 9, example: '+32 470 12 34 56' },
  BG: { callingCode: '359', minNationalLen: 8, maxNationalLen: 9, example: '+359 87 123 4567' },
  CY: { callingCode: '357', minNationalLen: 8, maxNationalLen: 8, example: '+357 96 123456' },
  CZ: { callingCode: '420', minNationalLen: 9, maxNationalLen: 9, example: '+420 601 123 456' },
  DE: { callingCode: '49', minNationalLen: 6, maxNationalLen: 11, example: '+49 151 23456789' },
  DK: { callingCode: '45', minNationalLen: 8, maxNationalLen: 8, example: '+45 20 12 34 56' },
  EE: { callingCode: '372', minNationalLen: 7, maxNationalLen: 8, example: '+372 5123 4567' },
  // Greece — `EL` is the VIES code; ITU lists the calling code under `GR`.
  EL: { callingCode: '30', minNationalLen: 10, maxNationalLen: 10, example: '+30 691 234 5678' },
  ES: { callingCode: '34', minNationalLen: 9, maxNationalLen: 9, example: '+34 612 34 56 78' },
  FI: { callingCode: '358', minNationalLen: 5, maxNationalLen: 12, example: '+358 40 123 4567' },
  FR: { callingCode: '33', minNationalLen: 9, maxNationalLen: 9, example: '+33 6 12 34 56 78' },
  HR: { callingCode: '385', minNationalLen: 8, maxNationalLen: 9, example: '+385 91 234 5678' },
  HU: { callingCode: '36', minNationalLen: 8, maxNationalLen: 9, example: '+36 20 123 4567' },
  IE: { callingCode: '353', minNationalLen: 7, maxNationalLen: 9, example: '+353 85 123 4567' },
  IT: { callingCode: '39', minNationalLen: 6, maxNationalLen: 11, example: '+39 312 345 6789' },
  LT: { callingCode: '370', minNationalLen: 8, maxNationalLen: 8, example: '+370 612 34567' },
  LU: { callingCode: '352', minNationalLen: 6, maxNationalLen: 11, example: '+352 621 123 456' },
  LV: { callingCode: '371', minNationalLen: 8, maxNationalLen: 8, example: '+371 21 234 567' },
  MT: { callingCode: '356', minNationalLen: 8, maxNationalLen: 8, example: '+356 9912 3456' },
  NL: { callingCode: '31', minNationalLen: 9, maxNationalLen: 9, example: '+31 6 12345678' },
  PL: { callingCode: '48', minNationalLen: 9, maxNationalLen: 9, example: '+48 512 345 678' },
  PT: { callingCode: '351', minNationalLen: 9, maxNationalLen: 9, example: '+351 912 345 678' },
  RO: { callingCode: '40', minNationalLen: 9, maxNationalLen: 9, example: '+40 712 345 678' },
  SE: { callingCode: '46', minNationalLen: 7, maxNationalLen: 10, example: '+46 70 123 45 67' },
  SI: { callingCode: '386', minNationalLen: 8, maxNationalLen: 8, example: '+386 31 234 567' },
  SK: { callingCode: '421', minNationalLen: 9, maxNationalLen: 9, example: '+421 912 345 678' },
};

// Compile-time guard: completeness over EU codes. Will fail to compile if
// `EU_PHONE_RULES` ever drops a code from the union.
const _EU_PHONE_RULES_COMPLETE: Record<
  (typeof _EU_VAT_COUNTRY_CODES)[number],
  EuPhoneRule
> = EU_PHONE_RULES;
void _EU_PHONE_RULES_COMPLETE;

/**
 * SOFT plausibility check — true unless the digit count is clearly outside the
 * national range. Strips '+', spaces, '(', ')', '-' and an optional leading
 * country calling code before counting.
 *
 * NEVER used by any Zod schema (web masked-input soft hint only).
 *
 * - Empty `raw` → `true` (no warning on empty; the component gates on non-empty).
 * - Unknown country code → `true` (defensive — never warn without a rule).
 */
export function isPlausiblePhone(country: string, raw: string): boolean {
  if (!raw) return true;

  const rule = EU_PHONE_RULES[country as EuVatCountryCode];
  if (!rule) return true;

  // Normalise to digits only: strip '+', spaces, '(', ')', '-' (and anything
  // else that isn't a digit — letters can't appear in a real phone number).
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return true; // nothing to measure → don't warn

  // Drop an optional leading country calling code so we count the national part.
  if (digits.startsWith(rule.callingCode)) {
    digits = digits.slice(rule.callingCode.length);
  }

  return digits.length >= rule.minNationalLen && digits.length <= rule.maxNationalLen;
}
