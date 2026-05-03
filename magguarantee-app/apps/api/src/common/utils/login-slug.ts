/**
 * Build a `firstname.lastname` slug from a Polish-language pair.
 *
 * Mirrors the legacy `Code.gs` helper that the carrier UI relied on for
 * creating driver logins (per docs/04-data-model.md `Driver.loginSlug`),
 * but rewritten — we replace ad-hoc string ops with a pure transform we
 * can unit-test.
 *
 * Steps:
 *   1. Strip diacritics (ł → l, ą → a, ż → z, …) so the slug stays ASCII.
 *   2. Lowercase, replace whitespace with dot.
 *   3. Trim non `[a-z0-9.-]` runs to a single hyphen.
 *
 * Collision handling (`-2`, `-3`, …) lives in the repository layer, not here.
 */
export function buildLoginSlug(firstName: string, lastName: string): string {
  const cleaned = `${firstName.trim()}.${lastName.trim()}`
    .normalize('NFD')
    // Remove combining marks (NFD splits accented letters into base+mark).
    .replace(/\p{Diacritic}/gu, '')
    // Polish-specific letters that don't decompose into base+mark via NFD.
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.-]+/g, '-')
    // Collapse repeats and trim ends.
    .replace(/-+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/(^[.\-]+|[.\-]+$)/g, '');
  if (!cleaned) return 'driver';
  return cleaned;
}
