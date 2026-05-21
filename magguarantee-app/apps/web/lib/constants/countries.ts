// Destination-country list for the vehicle «Kraje» <MultiSelect>.
//
// The canonical set of 30 ISO-3166-1 alpha-2 codes (EU-27 + GB + NO + CH)
// lives in @magguarantee/shared (`EUROPEAN_COUNTRY_CODES`) — we do NOT
// re-define it here. This module only maps each stable code to the i18n key
// that resolves its localised display name, so the <MultiSelect> can show
// "Niemcy" / "Germany" depending on the active locale while persisting "DE".
//
// The label itself is resolved at render time via `useTranslations` so the
// list re-sorts when the locale changes (docs/14 § Phase 5.2.2 — sort by the
// localised name, not a hard-coded order).

import { EUROPEAN_COUNTRY_CODES } from '@magguarantee/shared';

/**
 * i18n key for a country's localised name. Keys live under the `countries`
 * namespace in `messages/pl.json` / `en.json`, keyed by ISO code.
 */
export function countryLabelKey(code: string): string {
  return `countries.${code}`;
}

/** Re-export the canonical code list for convenience in the vehicle Sheet. */
export const DESTINATION_COUNTRY_CODES = EUROPEAN_COUNTRY_CODES;
