import { BadRequestException } from '@nestjs/common';

/**
 * Coercion of `multipart/form-data` text fields into the typed shape the
 * Vehicle Zod schemas expect.
 *
 * Background: in a multipart request every non-file part arrives as a plain
 * string (`'true'`, `'2024'`, `'["DE","FR"]'`). The Zod schemas
 * (`CreateVehicleSchema` / `UpdateVehicleSchema`) are strict and typed
 * (`z.boolean()`, `z.number()`, `z.array(...)`). We therefore normalise the
 * raw `req.body` bag here BEFORE handing it to the `ZodValidationPipe`.
 *
 * ── Encoding contract for web (mirror exactly) ───────────
 *  - booleans  → the literal strings `'true'` / `'false'`
 *  - numbers   → numeric strings (`'0.85'`)
 *  - arrays    → a JSON-encoded string, e.g. `wasteCountries='["DE","FR"]'`
 *                (`wasteCountries`, `removeAttachmentIds`)
 *  - strings   → as-is
 *  - omitted   → omit the part entirely (an empty part is treated as omitted)
 */

/** Field names that must be parsed as booleans. */
const BOOLEAN_FIELDS = [
  'active',
  'certificateL',
  'fuelCard',
  'gb',
  'it',
  'fr',
  'agreement',
  'wasteAllowed',
  'cabotageDe',
  'cabotageFr',
  'adr',
] as const;

/** Field names that must be parsed as numbers. */
const NUMBER_FIELDS = [
  'rateDe',
  'rateUe',
  'rateExport',
  'rateImport',
] as const;

/** Field names that must be parsed as JSON arrays. */
const ARRAY_FIELDS = ['wasteCountries', 'removeAttachmentIds'] as const;

/**
 * Normalises a raw multipart body into a JSON-shaped object ready for Zod.
 * Throws 400 on a malformed scalar (non-boolean string, non-numeric string,
 * invalid JSON array) — these are client encoding errors.
 */
export function coerceVehicleMultipartBody(
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
      // Plain string passthrough (carrierId, plateNumber, notes, …).
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
    `Pole '${field}' musi być tablicą zakodowaną jako JSON (np. ["DE","FR"])`,
  );
}
