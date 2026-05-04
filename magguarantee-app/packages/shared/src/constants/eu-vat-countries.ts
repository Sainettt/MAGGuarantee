// EU VAT country codes accepted by VIES.
//
// Reference: https://ec.europa.eu/taxation_customs/vies/#/vat-validation
// Note: VIES uses `EL` (not `GR`) for Greece — keep the EL variant since this
// list is the source of truth for VIES requests and the carrier UI dropdown.
//
// Names use Polish (the system's primary UI language per CLAUDE.md / next-intl
// PL default). EN translations live in the web app's i18n bundle.

/**
 * Single readonly list of all 27 EU VAT-registered country codes.
 * Stable order (alphabetical by code) — UI components can iterate as-is.
 */
export const EU_VAT_COUNTRIES = [
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgia' },
  { code: 'BG', name: 'Bułgaria' },
  { code: 'CY', name: 'Cypr' },
  { code: 'CZ', name: 'Czechy' },
  { code: 'DE', name: 'Niemcy' },
  { code: 'DK', name: 'Dania' },
  { code: 'EE', name: 'Estonia' },
  { code: 'EL', name: 'Grecja' },
  { code: 'ES', name: 'Hiszpania' },
  { code: 'FI', name: 'Finlandia' },
  { code: 'FR', name: 'Francja' },
  { code: 'HR', name: 'Chorwacja' },
  { code: 'HU', name: 'Węgry' },
  { code: 'IE', name: 'Irlandia' },
  { code: 'IT', name: 'Włochy' },
  { code: 'LT', name: 'Litwa' },
  { code: 'LU', name: 'Luksemburg' },
  { code: 'LV', name: 'Łotwa' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Holandia' },
  { code: 'PL', name: 'Polska' },
  { code: 'PT', name: 'Portugalia' },
  { code: 'RO', name: 'Rumunia' },
  { code: 'SE', name: 'Szwecja' },
  { code: 'SI', name: 'Słowenia' },
  { code: 'SK', name: 'Słowacja' },
] as const;

/**
 * Tuple of the 27 ISO 2-letter codes — ready for `z.enum(...)`.
 *
 * Hard-coded as a literal tuple (rather than `.map(...)`) so the TypeScript
 * compiler keeps the exact-length tuple shape that `z.enum` expects.
 */
export const EU_VAT_COUNTRY_CODES = [
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'EL',
  'ES',
  'FI',
  'FR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
] as const;

/** Union of accepted country codes. */
export type EuVatCountryCode = (typeof EU_VAT_COUNTRIES)[number]['code'];
