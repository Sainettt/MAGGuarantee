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
 * ClaimSequence (counter row), MonthlyLimit (no deletedAt column),
 * ClaimAttachment (no deletedAt column — never soft-deleted).
 *
 * Recursion note (the bug fixed alongside the attachment-model addition): a
 * `model`-component override CANNOT call `ctx.delete(...)` /
 * `ctx.deleteMany(...)` to perform the "real" delete — those re-enter the
 * override and blow the call stack. The recursion-free way to run the genuine
 * delete (non-soft models + the `INCLUDE_SOFT_DELETED` hard-delete escape
 * hatch) is the PRE-EXTENSION client handed to the `Prisma.defineExtension`
 * factory: `client.<model>.delete(...)`. It keeps full Prisma semantics
 * (cascades, P2003/P2025 codes) — important, because callers like
 * `TrailerTypesService.hardDelete` translate P2003 into a 409. The tradeoff:
 * that real delete runs on the root (pre-extension) client, so it is NOT
 * enrolled in an ambient `@Audit` interactive transaction. The SOFT path
 * (the common case, including every attachment delete) stays on `ctx.update`
 * and therefore remains fully transaction-atomic. See the per-branch comments
 * in `delete` / `deleteMany` below.
 */

export const SOFT_DELETE_MODELS = [
  'User',
  'Carrier',
  'Vehicle',
  'Driver',
  'Trailer',
  'Claim',
  'Delegation',
  // Attachment metadata rows: each has a `deletedAt` column and each
  // repository's `softDelete()` calls `.delete()` expecting a soft-delete.
  // Without these entries `.delete()` took the non-soft branch and recursed
  // (RangeError → 500 → the audited DELETE transaction rolled back → the row
  // survived). See docs/12-database-schema.md#soft-delete.
  'CarrierAttachment',
  'VehicleAttachment',
  'DriverAttachment',
  'TrailerAttachment',
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
      // The soft rewrite uses the `model` component so it can call the sibling
      // `update`/`updateMany` via `Prisma.getExtensionContext(this)` — that
      // context is transaction-aware, so a soft delete inside a `@Audit`
      // interactive transaction commits/rolls back atomically with the audit
      // row.
      //
      // The REAL delete (non-soft models, and the `INCLUDE_SOFT_DELETED`
      // hard-delete escape hatch) MUST NOT go through `ctx.delete(...)` — that
      // re-enters this very override (infinite recursion → RangeError → 500).
      // Instead it runs on `client` — the PRE-EXTENSION client captured by the
      // `Prisma.defineExtension((client) => …)` factory above. Its delegates
      // are not wrapped by this extension, so the call is recursion-free and
      // preserves full Prisma semantics (cascade deletes, P2003/P2025 codes).
      model: {
        $allModels: {
          async delete<A>(this: A, args: unknown) {
            type Ctx = {
              update: (a: unknown) => Promise<unknown>;
            };
            const ctx = Prisma.getExtensionContext(this) as unknown as Ctx & {
              $name?: string;
            };
            const model = ctx.$name ?? '';
            if (!isSoftModel(model)) {
              // Non-soft model → genuine hard delete on the base client.
              return rawDelegate(client, model).delete(args);
            }
            const { rest, include } = takeIncludeFlag(args);
            if (include) {
              // Escape-hatch hard-delete. Caller explicitly opted in; run the
              // real delete on the base client (recursion-free).
              return rawDelegate(client, model).delete(rest);
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
            };
            const ctx = Prisma.getExtensionContext(this) as unknown as Ctx & {
              $name?: string;
            };
            const model = ctx.$name ?? '';
            if (!isSoftModel(model)) {
              return rawDelegate(client, model).deleteMany(args);
            }
            const { rest, include } = takeIncludeFlag(args);
            if (include) {
              return rawDelegate(client, model).deleteMany(rest);
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

/**
 * Resolves the pre-extension delegate (e.g. `client.trailerType`) for a model
 * by its PascalCase `$name`, used to run a recursion-free REAL delete from
 * inside the `model` override. The `client` here is the un-extended client the
 * `Prisma.defineExtension` factory receives, so its `delete`/`deleteMany` are
 * NOT wrapped by this extension.
 *
 * @internal
 */
function rawDelegate(
  client: unknown,
  model: string,
): {
  delete: (a: unknown) => Promise<unknown>;
  deleteMany: (a: unknown) => Promise<unknown>;
} {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate = (client as Record<string, unknown>)[key];
  if (!delegate || typeof delegate !== 'object') {
    throw new Error(`[soft-delete] no Prisma delegate for model "${model}"`);
  }
  return delegate as {
    delete: (a: unknown) => Promise<unknown>;
    deleteMany: (a: unknown) => Promise<unknown>;
  };
}
