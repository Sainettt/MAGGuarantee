import { BadRequestException } from '@nestjs/common';

/**
 * Coercion of `multipart/form-data` text fields into the typed shape the
 * Driver Zod schemas expect.
 *
 * Background: in a multipart request every non-file part arrives as a plain
 * string (`'true'`, `'["…"]'`). The Zod schemas (`CreateDriverSchema` /
 * `UpdateDriverSchema`) are strict and typed (`z.boolean()`, `z.array(...)`).
 * We normalise the raw `req.body` bag here BEFORE the `ZodValidationPipe`.
 *
 * ── Encoding contract for web (mirror exactly) ───────────
 *  - booleans  → the literal strings `'true'` / `'false'` (`active`, `adr`)
 *  - arrays    → a JSON-encoded string, e.g. `removeAttachmentIds='["…"]'`
 *  - strings   → as-is (firstName, lastName, phone, idDocumentNumber, …)
 *  - omitted   → omit the part entirely (an empty part is treated as omitted)
 */

/** Field names that must be parsed as booleans. */
const BOOLEAN_FIELDS = ['active', 'adr'] as const;

/** Field names that must be parsed as JSON arrays. */
const ARRAY_FIELDS = ['removeAttachmentIds'] as const;

/**
 * Normalises a raw multipart driver body into a JSON-shaped object ready for
 * Zod. Throws 400 on a malformed scalar (non-boolean string, invalid JSON
 * array) — these are client encoding errors.
 */
export function coerceDriverMultipartBody(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    // An empty part means "field not provided" — drop it so `.optional()`
    // and `.default()` behave the same as in a JSON request.
    if (value === undefined || value === null || value === '') continue;

    if ((BOOLEAN_FIELDS as readonly string[]).includes(key)) {
      out[key] = parseBoolean(key, value);
    } else if ((ARRAY_FIELDS as readonly string[]).includes(key)) {
      out[key] = parseArray(key, value);
    } else {
      // Plain string passthrough (carrierId, firstName, phone, …).
      out[key] = value;
    }
  }

  return out;
}

function parseBoolean(field: string, value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new BadRequestException(
    `Pole '${field}' musi być wartością logiczną ('true' lub 'false')`,
  );
}

function parseArray(field: string, value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fallthrough to the error below
    }
  }
  throw new BadRequestException(
    `Pole '${field}' musi być tablicą zakodowaną jako JSON (np. ["…"])`,
  );
}
