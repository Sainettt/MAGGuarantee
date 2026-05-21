// European country codes accepted as Vehicle destination countries.
//
// Scope: EU-27 + United Kingdom (GB) + Norway (NO) + Switzerland (CH) — the
// markets MAGTRANS carriers actually operate in. 30 codes total.
//
// Reference: ISO 3166-1 alpha-2. NOTE the difference from
// `EU_VAT_COUNTRY_CODES` (eu-vat-countries.ts): VIES uses the `EL` dialect
// for Greece, while this list uses the canonical ISO code `GR`. These two
// lists serve different purposes and MUST NOT be conflated — VIES requests
// need `EL`, the destination-countries field is a plain ISO-3166 set.
//
// Both api (@magguarantee/shared Zod schemas) and web (RHF country picker)
// import this single list so the allowed-set never drifts.
//
// Names use Polish (the system's primary UI language per CLAUDE.md /
// next-intl PL default). EN translations live in the web i18n bundle.

/**
 * Single readonly list of all 30 allowed destination country codes
 * (EU-27 + GB + NO + CH). Stable order (alphabetical by ISO code) — UI
 * components can iterate as-is.
 */
export const EUROPEAN_COUNTRIES = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgia' },
  { code: 'BG', name: 'Bułgaria' },
  { code: 'CH', name: 'Szwajcaria' },
  { code: 'CY', name: 'Cypr' },
  { code: 'CZ', name: 'Czechy' },
  { code: 'DE', name: 'Niemcy' },
  { code: 'DK', name: 'Dania' },
  { code: 'EE', name: 'Estonia' },
  { code: 'ES', name: 'Hiszpania' },
  { code: 'FI', name: 'Finlandia' },
  { code: 'FR', name: 'Francja' },
  { code: 'GB', name: 'Wielka Brytania' },
  { code: 'GR', name: 'Grecja' },
  { code: 'HR', name: 'Chorwacja' },
  { code: 'HU', name: 'Węgry' },
  { code: 'IE', name: 'Irlandia' },
  { code: 'IT', name: 'Włochy' },
  { code: 'LT', name: 'Litwa' },
  { code: 'LU', name: 'Luksemburg' },
  { code: 'LV', name: 'Łotwa' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Holandia' },
  { code: 'NO', name: 'Norwegia' },
  { code: 'PL', name: 'Polska' },
  { code: 'PT', name: 'Portugalia' },
  { code: 'RO', name: 'Rumunia' },
  { code: 'SE', name: 'Szwecja' },
  { code: 'SI', name: 'Słowenia' },
  { code: 'SK', name: 'Słowacja' },
] as const;

/**
 * Tuple of the 30 ISO 3166-1 alpha-2 codes — ready for `z.enum(...)`.
 *
 * Hard-coded as a literal tuple (rather than `.map(...)`) so the TypeScript
 * compiler keeps the exact-length tuple shape that `z.enum` requires.
 */
export const EUROPEAN_COUNTRY_CODES = [
  'AT',
  'BE',
  'BG',
  'CH',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GB',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
] as const;

/** Union of accepted destination country codes. */
export type EuropeanCountryCode = (typeof EUROPEAN_COUNTRIES)[number]['code'];
