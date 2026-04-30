// i18n locale registry — Phase 1 ships Polish + English, Polish is default.
// The strategy is cookie-based (`mt_lang`), no URL prefix.

export const locales = ['pl', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'pl';

export const LOCALE_COOKIE = 'mt_lang';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Pick the best locale from an `Accept-Language` header. Falls back to
 * `defaultLocale` when none of the requested languages match `locales`.
 */
export function pickLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return defaultLocale;
  // header: "pl,en-US;q=0.9,en;q=0.8" — naive parse is fine (no q-sort needed
  // for two languages where the first match wins).
  const candidates = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim().toLowerCase())
    .filter((s): s is string => Boolean(s));
  for (const c of candidates) {
    const base = c.split('-')[0];
    if (base && isLocale(base)) return base;
  }
  return defaultLocale;
}
