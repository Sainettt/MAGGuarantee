// Per-country identity-document plausibility rules for the 27 EU member states.
//
// SOFT-WARNING ONLY — see docs/14 §6.1.2.
// =============================================================================
// THIS FILE IS CONSUMED EXCLUSIVELY BY THE WEB MASKED-INPUT COMPONENTS
// (`<MaskedDocumentInput>` in the Driver modal) FOR A SOFT, ON-BLUR FORMAT HINT.
//
// It is DELIBERATELY *NOT* imported by any Zod schema and NOT used by the API —
// UNLIKE `EU_POSTAL_CODES`, which delegations.ts wires into cross-field
// validation. That asymmetry is intentional (docs/14 §6.1.2 / §6.1.3-A).
//
// Driver `idDocumentNumber` Zod field accepts any 1–64 char string, full stop.
// DO NOT "fix" this by adding validation: most EU states issue several accepted
// document types (national ID, passport, residence card, legacy formats) with
// divergent shapes, so a strict regex WOULD false-warn on legitimate data. The
// warning is a fat-finger nudge, never a gate. Do not import this into a schema.
// =============================================================================
//
// Greece uses `EL` (the VIES code used everywhere in this codebase).

import {
  EU_VAT_COUNTRY_CODES as _EU_VAT_COUNTRY_CODES,
  type EuVatCountryCode,
} from './eu-vat-countries';

/**
 * A lenient identity-document plausibility rule: a length range with an
 * OPTIONAL permissive shape check.
 *
 * The `regex` is intentionally permissive (it must pass national ID *and*
 * passport *and* residence permit) and is OMITTED entirely for countries whose
 * accepted document types diverge too much to share one pattern — there, the
 * length range alone is the soft check. A missing `regex` is a feature.
 */
export interface EuIdDocumentRule {
  /** Min plausible length across the country's accepted document types. */
  minLen: number;
  /** Max plausible length across the country's accepted document types. */
  maxLen: number;
  /** A realistic example (national ID is fine) shown in the soft hint. */
  example: string;
  /**
   * OPTIONAL lenient shape check. Permissive enough to pass national ID,
   * passport and residence permit. Omitted where document types diverge too
   * much. Case-insensitive; the UI does not force case.
   */
  regex?: RegExp;
}

// Keep this object total over `EuVatCountryCode` — TypeScript enforces that
// every EU code has a rule. Adding a new country to the enum is a compile
// error here until a rule is added too.
//
// Length ranges bracket the SHORTEST accepted document through the LONGEST, so
// a passport never warns when the example is a national ID. `regex` is supplied
// only where a genuinely permissive shared shape exists; otherwise omitted.
export const EU_ID_DOCUMENT_RULES: Record<EuVatCountryCode, EuIdDocumentRule> = {
  // AT: Personalausweis / Reisepass shapes diverge — length range only.
  AT: { minLen: 7, maxLen: 10, example: 'P1234567' },
  // BE: eID 12 digits ('000-0000000-00' compacts to 12); passport 2 letters +
  // 6 digits. Diverge too much for one shape — length range only.
  BE: { minLen: 8, maxLen: 12, example: '012345678' },
  BG: { minLen: 8, maxLen: 10, example: '123456789' },
  CY: { minLen: 8, maxLen: 10, example: 'K00123456' },
  // CZ: občanský průkaz 9 alphanumerics; passport differs — loose shape ok.
  CZ: { minLen: 8, maxLen: 10, example: '123456789', regex: /^[A-Z0-9]{8,10}$/i },
  // DE Personalausweis (since 2010): 9 alphanumerics; passports differ. Keep a
  // length range + a very loose alphanumeric check so other types don't warn.
  DE: { minLen: 9, maxLen: 10, example: 'L01X00T47', regex: /^[A-Z0-9]{9,10}$/i },
  // DK CPR: 10 digits, sometimes written with a 'DDMMYY-SSSS' separator (11
  // chars); passport differs. Length range only, wide enough for both forms.
  DK: { minLen: 9, maxLen: 11, example: '123456-7890' },
  EE: { minLen: 8, maxLen: 9, example: 'AA1234567', regex: /^[A-Z]{1,2}\d{6,7}$/i },
  // Greece — `EL` is the VIES code. Taftotita: 2 letters + 6 digits (Greek/Latin
  // homoglyphs vary) — length range only to avoid alphabet false-warns.
  EL: { minLen: 7, maxLen: 9, example: 'AB123456' },
  // ES DNI: 8 digits + 1 letter; NIE: letter + 7 digits + letter — diverge.
  ES: { minLen: 9, maxLen: 9, example: '12345678Z' },
  FI: { minLen: 8, maxLen: 9, example: 'XP1234567', regex: /^[A-Z]{2}\d{6,7}$/i },
  // FR CNI: 12 alphanumerics; passport 9 — span the range, loose shape.
  FR: { minLen: 9, maxLen: 12, example: '123456789012', regex: /^[A-Z0-9]{9,12}$/i },
  HR: { minLen: 8, maxLen: 9, example: '123456789' },
  HU: { minLen: 8, maxLen: 9, example: '123456AB' },
  IE: { minLen: 8, maxLen: 9, example: 'PA1234567' },
  // IT carta d'identità elettronica: 2 letters + 5 digits + 2 letters; passport
  // differs — length range only.
  IT: { minLen: 8, maxLen: 9, example: 'CA12345AB' },
  LT: { minLen: 8, maxLen: 9, example: '12345678' },
  LU: { minLen: 8, maxLen: 10, example: 'SPEC12345' },
  LV: { minLen: 8, maxLen: 9, example: 'LV1234567' },
  MT: { minLen: 7, maxLen: 9, example: '0123456M' },
  // NL: 9 alphanumerics for ID and passport — a loose shared shape works.
  NL: { minLen: 8, maxLen: 9, example: 'SPECI2014', regex: /^[A-Z0-9]{8,9}$/i },
  // PL dowód osobisty: 3 letters + 6 digits ('ABA123456'). Passport: 2 letters +
  // 7 digits. The lenient regex admits both letter/digit mixes 8–10 chars long.
  PL: { minLen: 8, maxLen: 10, example: 'ABA123456', regex: /^[A-Z]{2,3}\d{6,7}$/i },
  PT: { minLen: 8, maxLen: 12, example: '123456789' },
  RO: { minLen: 8, maxLen: 9, example: 'AB123456' },
  SE: { minLen: 8, maxLen: 10, example: '12345678' },
  SI: { minLen: 8, maxLen: 9, example: 'PA1234567' },
  SK: { minLen: 8, maxLen: 10, example: 'AB123456' },
};

// Compile-time guard: completeness over EU codes. Will fail to compile if
// `EU_ID_DOCUMENT_RULES` ever drops a code from the union.
const _EU_ID_DOCUMENT_RULES_COMPLETE: Record<
  (typeof _EU_VAT_COUNTRY_CODES)[number],
  EuIdDocumentRule
> = EU_ID_DOCUMENT_RULES;
void _EU_ID_DOCUMENT_RULES_COMPLETE;

/**
 * SOFT plausibility check — true unless length is outside [minLen, maxLen] OR a
 * supplied lenient `regex` clearly fails. Trims surrounding whitespace; does NOT
 * force case (the regex carries `/i`).
 *
 * NEVER used by any Zod schema (web masked-input soft hint only). Kept lenient.
 *
 * - Empty `raw` → `true` (no warning on empty; the component gates on non-empty).
 * - Unknown country code → `true` (defensive — never warn without a rule).
 */
export function isPlausibleIdDocument(country: string, raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;

  const rule = EU_ID_DOCUMENT_RULES[country as EuVatCountryCode];
  if (!rule) return true;

  if (value.length < rule.minLen || value.length > rule.maxLen) return false;
  if (rule.regex && !rule.regex.test(value)) return false;

  return true;
}
