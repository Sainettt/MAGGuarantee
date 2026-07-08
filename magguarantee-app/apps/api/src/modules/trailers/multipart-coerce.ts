import { BadRequestException } from '@nestjs/common';

/**
 * Coercion of `multipart/form-data` text fields into the typed shape the
 * Trailer Zod schemas expect.
 *
 * Background: in a multipart request every non-file part arrives as a plain
 * string (`'true'`, `'3'`, `'["…"]'`). The Zod schemas (`CreateTrailerSchema`
 * / `UpdateTrailerSchema`) are strict and typed. We normalise the raw
 * `req.body` bag here BEFORE the `ZodValidationPipe`.
 *
 * ── Encoding contract for web (mirror exactly) ───────────
 *  - booleans → literal `'true'` / `'false'`
 *  - numbers  → numeric strings (`'3'`, `'13.60'`)
 *  - arrays   → a JSON-encoded string, e.g. `removeAttachmentIds='["…"]'`
 *  - strings  → as-is (carrierId, plateNumber, trailerTypeId, notes)
 *  - omitted  → omit the part entirely (an empty part is treated as omitted)
 */

/** Field names that must be parsed as booleans. */
const BOOLEAN_FIELDS = [
  'active',
  'belts',
  'mats',
  'beams',
  'liftingRoof',
  'slidingRoof',
  'edscha',
  'palletBox',
  'certXl',
  'multilock',
] as const;

/** Field names that must be parsed as numbers. */
const NUMBER_FIELDS = [
  'beltsCount',
  'matsCount',
  'beamsCount',
  'innerLength',
  'innerWidth',
  'innerHeight',
  'capacity',
  'sideClearanceCm',
] as const;

/** Field names that must be parsed as JSON arrays. */
const ARRAY_FIELDS = ['removeAttachmentIds'] as const;

/**
 * Normalises a raw multipart trailer body into a JSON-shaped object ready for
 * Zod. Throws 400 on a malformed scalar — a client encoding error.
 */
export function coerceTrailerMultipartBody(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    // An empty part means "field not provided" — drop it so `.optional()`
    // and `.default()` behave the same as in a JSON request.
    if (value === undefined || value === null || value === '') continue;

    if ((BOOLEAN_FIELDS as readonly string[]).includes(key)) {
      out[key] = parseBoolean(key, value);
    } else if ((NUMBER_FIELDS as readonly string[]).includes(key)) {
      out[key] = parseNumber(key, value);
    } else if ((ARRAY_FIELDS as readonly string[]).includes(key)) {
      out[key] = parseArray(key, value);
    } else {
      // Plain string passthrough (carrierId, plateNumber, trailerTypeId, …).
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

function parseNumber(field: string, value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  throw new BadRequestException(`Pole '${field}' musi być liczbą`);
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
