// Pre-Phase-4.4 — ambient transaction + audit context.
//
// Carries the in-flight Prisma transaction client, the resolved actor, and an
// optional `before` snapshot across the async chain of a single HTTP request.
// The `AuditInterceptor` opens a `prisma.$transaction` and wraps the
// `next.handle()` Observable inside `AuditContext.run(...)`. Anything the
// service does — including the audit-row write at the very end — picks up the
// same transaction client through `PrismaService.tx`.
//
// Design notes:
//  - AsyncLocalStorage (Node ≥ 16) is the safe primitive here: it propagates
//    through `await` / `Promise.then` chains AND through rxjs's microtask
//    boundary, so neither feature services nor the AuditWriter need to thread
//    a `tx` parameter manually.
//  - The store is mutated in place for `before`: the caller (service) writes
//    a pre-mutation snapshot, the interceptor reads it on commit. We expose
//    `setBefore()` rather than letting callers grab the store directly so we
//    can preserve the option of switching to an immutable model later.
//  - `current()` returns `undefined` outside any `run(...)` — that lets
//    `PrismaService.tx` fall back to the root client transparently for
//    background workers, cron tasks, auth refresh-token rotation, etc.

import { AsyncLocalStorage } from 'node:async_hooks';

import type { Prisma } from '@magguarantee/database';

import type { AuditActor } from '../../modules/audit/audit.types';

/**
 * Per-request audit state. Always populated by the `AuditInterceptor` when a
 * controller method carries `@Audit(...)`. Routes without the decorator never
 * enter `run(...)` and therefore see `current() === undefined`.
 */
export interface AuditContextStore {
  /** Active Prisma transaction client — same handle for the whole request. */
  tx: Prisma.TransactionClient;
  /** Identity of the actor that triggered the request. */
  actor: AuditActor;
  /** Client IP — already extracted from `x-forwarded-for` / `req.ip`. */
  ipAddress: string | null;
  /**
   * Optional pre-mutation snapshot the service captures right before its
   * write. The interceptor picks this up on commit and feeds it to
   * `AuditWriter.log(...)` as the `before` field. Left `undefined` when the
   * service doesn't bother to snapshot (e.g. pure create-flows).
   */
  before?: unknown;
  /**
   * Optional business-context metadata the service stashes via
   * `AuditContext.setMetadata(...)`. The interceptor merges this on top of
   * its own routing fields (method/route/userAgent) before writing — the
   * service-side keys win on collision, but in practice they're disjoint
   * (`reason`, `category`, ...) so callers can use the same key namespace
   * safely.
   *
   * Phase 4.4 motivator: hard-delete flows need a `reason` string that ends
   * up in `audit_log.metadata` without being threaded through every service
   * signature. The decorator-driven `targetKey` extractor is for routing data
   * (path params, result id) — `metadata` is for business data.
   */
  metadata?: Record<string, unknown>;
}

const storage = new AsyncLocalStorage<AuditContextStore>();

/**
 * Public surface of the ambient audit context. Four entry points:
 *
 *  - `run(store, fn)` — open a new context for the lifetime of `fn`. Nested
 *    `run(...)` calls create child stores (the inner store wins for the inner
 *    scope, the outer is restored on exit).
 *  - `current()` — read the active store. Returns `undefined` if no `run(...)`
 *    is on the stack — used by `PrismaService.tx` to decide whether to return
 *    the ambient transaction or the root client.
 *  - `setBefore(value)` — mutate the active store's `before` slot. No-op when
 *    called outside a `run(...)` (defence in depth — services don't have to
 *    know whether they're inside an audited request).
 *  - `setMetadata(obj)` — merge business-context metadata into the active
 *    store's `metadata` slot. Multiple calls accumulate (later keys win on
 *    collision). No-op outside any `run(...)` — same defensive contract as
 *    `setBefore`. The interceptor merges this onto its own routing metadata
 *    on commit.
 */
export const AuditContext = {
  current: (): AuditContextStore | undefined => storage.getStore(),
  run: <T>(store: AuditContextStore, fn: () => Promise<T>): Promise<T> =>
    storage.run(store, fn),
  setBefore: (before: unknown): void => {
    const s = storage.getStore();
    if (s) s.before = before;
  },
  setMetadata: (meta: Record<string, unknown>): void => {
    const s = storage.getStore();
    if (!s) return;
    s.metadata = { ...(s.metadata ?? {}), ...meta };
  },
};
