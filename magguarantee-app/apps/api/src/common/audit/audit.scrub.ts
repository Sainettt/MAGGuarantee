import {
  AUDIT_BUSINESS_CODE_QUALIFIERS,
  AUDIT_REDACTED,
  AUDIT_SENSITIVE_KEY_PATTERNS,
  AUDIT_SENSITIVE_KEY_WORDS,
} from './audit.constants';

/**
 * Recursively walks an arbitrary JSON-ish value, replacing the values of
 * keys that match a sensitive-name pattern with `***`.
 *
 * Notes:
 *  - Operates on a fresh object — the caller's input is never mutated.
 *  - Arrays are handled element-wise; the array itself is never redacted.
 *  - Date / Buffer / typed-array instances are returned as-is (no traversal).
 *  - Cycles are broken with a WeakSet — re-encountered references render as
 *    the string `[Circular]`.
 */
export function scrubForAudit(value: unknown): unknown {
  return scrub(value, new WeakSet());
}

function scrub(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  // Don't traverse host objects like Date / Buffer / typed arrays.
  if (
    value instanceof Date ||
    value instanceof RegExp ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) ||
    ArrayBuffer.isView(value as ArrayBufferView)
  ) {
    return value;
  }

  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => scrub(v, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveAuditKey(k)) {
      out[k] = AUDIT_REDACTED;
    } else {
      out[k] = scrub(v, seen);
    }
  }
  return out;
}

/**
 * True when the value under `key` must not reach the audit log. The rules and
 * the reasoning behind them live on the constants in `audit.constants.ts`.
 */
export function isSensitiveAuditKey(key: string): boolean {
  const squashed = key.toLowerCase().replace(/[^a-z0-9]/gu, '');
  if (AUDIT_SENSITIVE_KEY_PATTERNS.some((re) => re.test(squashed))) return true;

  const words = splitKeyWords(key);
  if (words.some((w) => AUDIT_SENSITIVE_KEY_WORDS.has(w))) return true;

  return isSecretCodeKey(words);
}

/** `…Code` suffix with a qualifier that is not a business identifier. */
function isSecretCodeKey(words: readonly string[]): boolean {
  const last = words[words.length - 1];
  if (last !== 'code' && last !== 'codes') return false;
  // Bare `code` — a business identifier in every audited payload.
  if (words.length < 2) return false;
  const qualifier = words[words.length - 2]!;
  return !AUDIT_BUSINESS_CODE_QUALIFIERS.has(qualifier);
}

/**
 * `resetCode` → [reset, code]; `TOTPCode` → [totp, code];
 * `trailer_type-code` → [trailer, type, code].
 */
function splitKeyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .split(/[^A-Za-z0-9]+/u)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
}
