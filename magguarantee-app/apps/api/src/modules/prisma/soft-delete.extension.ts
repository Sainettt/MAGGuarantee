import { Prisma } from '@magguarantee/database';

/**
 * Soft-delete strategy per docs/12-database-schema.md#soft-delete-vs-hard-delete:
 *
 *   "implementation: a global Prisma middleware that adds
 *    `WHERE deleted_at IS NULL` to every find* / update* / delete* (the
 *    last is rewritten to `update { deletedAt: now() }`). Triggered only
 *    for models with a `deletedAt` field."
 *
 * Implemented as a Prisma client extension (the modern replacement for
 * `$use` middleware, which is deprecated in 5.x). Two components:
 *
 *   • `query` — for read operations (`findFirst`, `findMany`, `count`,
 *     `findUnique` post-filter) and `updateMany`. We splice
 *     `deletedAt: null` into the where clause so callers never see
 *     soft-deleted rows.
 *
 *   • `model` — overrides `delete` / `deleteMany` to perform an
 *     `update` setting `deletedAt = new Date()`. This is where the actual
 *     "soft" happens.
 *
 * Operations intentionally NOT intercepted:
 *
 *   • `update` (single-row, unique where): can't AND a non-unique
 *     `deletedAt` filter into a `findUnique`-shaped where clause. Leaving
 *     it alone also keeps the "restore" flow simple — repos can
 *     `update({ where: { id }, data: { deletedAt: null } })` to bring a
 *     soft-deleted row back. Repository code that needs to refuse writes
 *     on soft-deleted rows should `findFirst` first.
 *
 *   • `upsert`: Prisma upsert merges create+update; a sensible auto-filter
 *     would either suppress restores or break create. Out of scope for now.
 *
 *   • `createMany` / `create`: nothing to filter.
 *
 * Escape hatch: pass `[INCLUDE_SOFT_DELETED]: true` on top-level args to
 * bypass the auto-filter (read paths) and to perform a real hard-delete on
 * `delete*` calls. Symbol-keyed so it cannot collide with Prisma args.
 *
 * Excluded models: AuditLog (append-only), RefreshToken (hard-delete by
 * `expiresAt`), AppConfig (singletons), TrailerType (toggled via `active`),
 * ClaimSequence (counter row), MonthlyLimit (no deletedAt column).
 */

export const SOFT_DELETE_MODELS = [
  'User',
  'Carrier',
  'Vehicle',
  'Driver',
  'Trailer',
  'Claim',
  'Delegation',
] as const;
export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

const SOFT_DELETE_MODEL_SET: ReadonlySet<string> = new Set(SOFT_DELETE_MODELS);

/**
 * Symbol-flagged escape hatch. On reads: returns soft-deleted rows. On
 * delete*: performs a real hard-delete (admin-only flow).
 */
export const INCLUDE_SOFT_DELETED = Symbol('includeSoftDeleted');

/**
 * Internal helper, exposed for unit testing: detect & strip the symbol flag
 * from args. Public callers should not depend on this — use the symbol
 * directly on Prisma args instead.
 *
 * @internal
 */
export function _takeIncludeFlag(args: unknown): {
  rest: Record<string, unknown>;
  include: boolean;
} {
  return takeIncludeFlag(args);
}

function takeIncludeFlag(args: unknown): {
  rest: Record<string, unknown>;
  include: boolean;
} {
  if (!args || typeof args !== 'object') return { rest: {}, include: false };
  const obj = args as Record<string | symbol, unknown>;
  const include = obj[INCLUDE_SOFT_DELETED] === true;
  const rest: Record<string, unknown> = {};
  // Object.keys excludes symbol keys → naturally strips our flag.
  for (const k of Object.keys(obj)) rest[k] = obj[k];
  return { rest, include };
}

/** @internal — exported for unit tests. */
export function _isSoftModel(model: string | undefined): boolean {
  return isSoftModel(model);
}

function isSoftModel(model: string | undefined): boolean {
  return !!model && SOFT_DELETE_MODEL_SET.has(model);
}

/** @internal — exported for unit tests. */
export function _injectDeletedAtNullToWhere(
  args: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return injectDeletedAtNullToWhere(args);
}

/**
 * Idempotently merge `{ deletedAt: null }` into `args.where`. If the caller
 * already specified a `deletedAt` filter explicitly, leave it alone — they
 * are signalling intent.
 */
function injectDeletedAtNullToWhere(
  args: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const a = args ?? {};
  const whereRaw = (a.where ?? {}) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(whereRaw, 'deletedAt')) {
    return a;
  }
  return { ...a, where: { ...whereRaw, deletedAt: null } };
}

/**
 * Build the soft-delete client extension. Apply it once at PrismaService
 * construction time via `prisma.$extends(softDeleteExtension())`.
 */
export function softDeleteExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'softDelete',

      // ── Reads + updates: filter out soft-deleted rows. ──
      query: {
        $allModels: {
          async findFirst({ model, args, query }) {
            if (!isSoftModel(model)) return query(args);
            const { rest, include } = takeIncludeFlag(args);
            if (include) return query(rest as typeof args);
            return query(injectDeletedAtNullToWhere(rest) as typeof args);
          },

          async findFirstOrThrow({ model, args, query }) {
            if (!isSoftModel(model)) return query(args);
            const { rest, include } = takeIncludeFlag(args);
            if (include) return query(rest as typeof args);
            return query(injectDeletedAtNullToWhere(rest) as typeof args);
          },

          async findMany({ model, args, query }) {
            if (!isSoftModel(model)) return query(args);
            const { rest, include } = takeIncludeFlag(args);
            if (include) return query(rest as typeof args);
            return query(injectDeletedAtNullToWhere(rest) as typeof args);
          },

          async findUnique({ model, args, query }) {
            // Prisma rejects non-unique `where` extensions on findUnique, so
            // we run as-is and post-filter.
            if (!isSoftModel(model)) return query(args);
            const { rest, include } = takeIncludeFlag(args);
            // `rest` carries the same fields as `args` (we only stripped a
            // symbol-keyed flag), so the operation-typed cast is safe.
            const row = (await query(rest as typeof args)) as
              | (Record<string, unknown> & { deletedAt?: Date | null })
              | null;
            if (include) return row;
            if (row && row.deletedAt) return null;
            return row;
          },

          async findUniqueOrThrow({ model, args, query }) {
            if (!isSoftModel(model)) return query(args);
            const { rest, include } = takeIncludeFlag(args);
            const row = (await query(rest as typeof args)) as
              | (Record<string, unknown> & { deletedAt?: Date | null })
              | null;
            if (include) return row;
            if (row && row.deletedAt) {
              throw new Error(
                `[soft-delete] ${model} matched by findUniqueOrThrow is soft-deleted`,
              );
            }
            return row;
          },

          async count({ model, args, query }) {
            if (!isSoftModel(model)) return query(args);
            const { rest, include } = takeIncludeFlag(args);
            if (include) return query(rest as typeof args);
            return query(injectDeletedAtNullToWhere(rest) as typeof args);
          },

          async updateMany({ model, args, query }) {
            if (!isSoftModel(model)) return query(args);
            const { rest, include } = takeIncludeFlag(args);
            if (include) return query(rest as typeof args);
            return query(injectDeletedAtNullToWhere(rest) as typeof args);
          },
        },
      },

      // ── delete / deleteMany rewritten to soft-update. ──
      // Using the `model` component so we can call sibling operations
      // (`update`/`updateMany`) on the same client.
      model: {
        $allModels: {
          async delete<A>(this: A, args: unknown) {
            type Ctx = {
              update: (a: unknown) => Promise<unknown>;
              delete: (a: unknown) => Promise<unknown>;
            };
            const ctx = Prisma.getExtensionContext(this) as unknown as Ctx & {
              $name?: string;
            };
            const model = ctx.$name ?? '';
            if (!isSoftModel(model)) {
              return ctx.delete(args);
            }
            const { rest, include } = takeIncludeFlag(args);
            if (include) {
              // Hard-delete. Caller has explicitly opted in.
              return ctx.delete(rest);
            }
            // Re-issue as update setting deletedAt = now.
            const where = (rest as { where?: Record<string, unknown> }).where;
            if (!where) {
              throw new Error(
                `[soft-delete] ${model}.delete() requires a where clause`,
              );
            }
            return ctx.update({
              where,
              data: { deletedAt: new Date() },
            });
          },

          async deleteMany<A>(this: A, args: unknown) {
            type Ctx = {
              updateMany: (a: unknown) => Promise<unknown>;
              deleteMany: (a: unknown) => Promise<unknown>;
            };
            const ctx = Prisma.getExtensionContext(this) as unknown as Ctx & {
              $name?: string;
            };
            const model = ctx.$name ?? '';
            if (!isSoftModel(model)) {
              return ctx.deleteMany(args);
            }
            const { rest, include } = takeIncludeFlag(args);
            if (include) {
              return ctx.deleteMany(rest);
            }
            // Re-issue as updateMany — `where` may be omitted (deleteMany
            // without a filter wipes the table; we mirror that).
            const where =
              (rest as { where?: Record<string, unknown> }).where ?? {};
            // Avoid touching rows that are already soft-deleted.
            const whereWithGuard = Object.prototype.hasOwnProperty.call(
              where,
              'deletedAt',
            )
              ? where
              : { ...where, deletedAt: null };
            return ctx.updateMany({
              where: whereWithGuard,
              data: { deletedAt: new Date() },
            });
          },
        },
      },
    }),
  );
}
