/**
 * Reflector key for the `@Audit(...)` decorator. Lives next to its decorator
 * + interceptor so feature controllers don't have to import implementation
 * files just to read metadata.
 */
export const AUDIT_METADATA_KEY = 'audit';

/**
 * Key-name rules the scrubber uses to redact values when serializing
 * `before` / `after` JSON bodies for the audit log, per
 * docs/15-auth-strategy.md#чек-лист-безопасности. Evaluated by
 * `isSensitiveAuditKey` in `audit.scrub.ts`; three layers:
 *
 *  1. {@link AUDIT_SENSITIVE_KEY_PATTERNS} — substring match on the key
 *     lower-cased with `_` / `-` / `.` removed, so `apiKey`, `api_key`,
 *     `API-KEY` and `APIKEY` are all `apikey`. For words that are never part
 *     of a harmless business field name.
 *  2. {@link AUDIT_SENSITIVE_KEY_WORDS} — whole-WORD match after splitting the
 *     key on camelCase / snake_case / kebab-case boundaries. For short words
 *     that would over-match as substrings (`pin` is inside `shipping`,
 *     `mapping`, `pino`; `otp` inside `hotpath`).
 *  3. The `…Code` suffix rule — a key whose last word is `code` and which has
 *     a qualifier in front of it (`resetCode`, `otpCode`, `verificationCode`,
 *     `login_code`) is a secret, UNLESS the word right before `code` is one of
 *     {@link AUDIT_BUSINESS_CODE_QUALIFIERS} (`postalCode`, `countryCode`,
 *     `trailerTypeCode`, `stanowiskoCode`, …). Fail-closed on purpose: a new
 *     `somethingCode` field shows up as `***` in the audit view (visible,
 *     fixable by adding the qualifier) rather than leaking silently.
 *
 * A BARE `code` key is NOT redacted. In audited payloads it is always a
 * business identifier — team code (`1.1.13`), stanowisko code, trailer-type
 * code — and those rows are exactly what the audit trail must show. The 2FA /
 * password-reset `code` only ever travels in request bodies of `@Public` auth
 * routes, which are not `@Audit`-decorated (and the pino logger redacts nested
 * `code` independently, see `common/logging/http-logger.options.ts`).
 * (Until 2026-09-14 the rule was `/\bcode\b/i`, which redacted team and
 * stanowisko codes but let `resetCode` / `otpCode` through.)
 */
export const AUDIT_SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /password/,
  /passwd/,
  /token/,
  /secret/,
  /authorization/,
  /cookie/,
  /credential/,
  /apikey/,
  /privatekey/,
  /accesskey/,
];

export const AUDIT_SENSITIVE_KEY_WORDS: ReadonlySet<string> = new Set([
  'otp',
  'totp',
  'hotp',
  'mfa',
  '2fa',
  'pin',
  'pins',
  'cvv',
  'cvc',
]);

/**
 * Words that, directly in front of `code`, make it a business identifier
 * rather than a secret. Lower-case.
 */
export const AUDIT_BUSINESS_CODE_QUALIFIERS: ReadonlySet<string> = new Set([
  // addresses & geography
  'postal', 'post', 'zip', 'country', 'region', 'city', 'area', 'location',
  // phone / locale / money
  'dial', 'calling', 'phone', 'language', 'lang', 'locale', 'currency',
  // protocol / error / status identifiers
  'status', 'http', 'error', 'response', 'exit', 'reason', 'issue', 'result',
  // classification & registries
  'type', 'short', 'ext', 'class', 'category', 'product', 'tax', 'vat', 'pkd',
  'iso', 'bar', 'qr', 'color', 'colour', 'unit',
  // banking identifiers (not credentials)
  'bank', 'swift', 'bic', 'sort', 'branch',
  // MAGGuarantee domain entities
  'stanowisko', 'team', 'trailer', 'vehicle', 'carrier', 'driver', 'claim',
  'delegation', 'department', 'position',
]);

export const AUDIT_REDACTED = '***';
