import {
  AUDIT_REDACTED,
  AUDIT_SENSITIVE_KEY_PATTERNS,
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
    if (isSensitiveKey(k)) {
      out[k] = AUDIT_REDACTED;
    } else {
      out[k] = scrub(v, seen);
    }
  }
  return out;
}

function isSensitiveKey(key: string): boolean {
  return AUDIT_SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}
