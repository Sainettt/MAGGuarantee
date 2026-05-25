import { ConflictException } from '@nestjs/common';

/**
 * Translate Prisma's unique-constraint violation (P2002) into a 409 Conflict
 * with a friendly message. Used by repositories that enforce composite-unique
 * keys at the DB layer (Vehicle / Trailer `(carrierId, plateNumber)`,
 * Driver `loginSlug`, TrailerType `name`).
 *
 * Per docs/13-api-design.md#стандартные-коды:
 *   409 — Конфликт (дубликат NrRej, NrZgl уже занят).
 */
interface PrismaKnownError {
  code?: string;
  meta?: {
    target?: string[] | string;
  };
}

export function isPrismaUniqueViolation(err: unknown): err is PrismaKnownError {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { code?: string }).code === 'P2002'
  );
}

export function uniqueViolationToConflict(
  err: unknown,
  fallback: string,
): ConflictException {
  if (!isPrismaUniqueViolation(err)) {
    return new ConflictException(fallback);
  }
  const target = err.meta?.target;
  const fields = Array.isArray(target)
    ? target.join(', ')
    : typeof target === 'string'
      ? target
      : undefined;
  const detail = fields
    ? `Konflikt — wartość już istnieje (${fields})`
    : fallback;
  return new ConflictException(detail);
}

/**
 * Prisma P2003 — foreign-key constraint violation. Surfaces when we try to
 * delete a parent row that still has live children (e.g. hard-deleting a
 * TrailerType while trailers still reference it). The service layer maps
 * this to 409 Conflict with a custom message — the caller must remove the
 * dependants first.
 */
export function isPrismaForeignKeyViolation(
  err: unknown,
): err is PrismaKnownError {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { code?: string }).code === 'P2003'
  );
}
