/**
 * Reflector key for the `@Audit(...)` decorator. Lives next to its decorator
 * + interceptor so feature controllers don't have to import implementation
 * files just to read metadata.
 */
export const AUDIT_METADATA_KEY = 'audit';

/**
 * Field-name predicates the scrubber redacts when serializing `before` /
 * `after` JSON bodies for the audit log.
 *
 * Match is case-insensitive and substring-based for `*token*`/`*password*`/
 * etc., per docs/15-auth-strategy.md#чек-лист-безопасности.
 */
export const AUDIT_SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /password/i,
  /passwordhash/i,
  /token/i,
  /tokenhash/i,
  /\bcode\b/i,
  /authorization/i,
  /secret/i,
  /sessiontoken/i,
];

export const AUDIT_REDACTED = '***';
