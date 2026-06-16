// Phase 8 — audit-coverage spot-check harness.
//
// Roadmap item 3 ("каждый mutating endpoint фактически пишет audit") needs a
// test that proves the *real* `@Audit()` config on a controller method flows
// through the *real* `AuditInterceptor` and reaches `AuditWriter.log(...)`.
//
// The existing service-level specs simulate the ambient `AuditContext` with a
// `withAuditContext()` helper — that masks a whole class of regression: a
// controller method that LACKS the `@Audit()` decorator (so the interceptor
// never opens a context / writes a row) still passes those specs, because the
// test opens the context the production interceptor never would. This harness
// closes that gap: it reads the decorator straight off the controller class
// with a real `Reflector` and runs the production interceptor end-to-end with
// fakes for Prisma + AuditWriter only.
//
// What it deliberately does NOT mock:
//  - the `@Audit()` metadata (read off the live controller via Reflector),
//  - the `AuditInterceptor` transaction/context orchestration,
//  - the `targetKey` extractor (run with the real req/result).
//
// What it fakes (no live DB needed):
//  - `prisma.$transaction` — runs the callback inline, records commit/rollback,
//  - `AuditWriter.log` — captures the entry instead of writing a row.

import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, Observable } from 'rxjs';

import type { Prisma } from '@magguarantee/database';

import type { AuthUser } from '../../../modules/auth/decorators/current-user.decorator';
import type { AuditWriter } from '../../../modules/audit/audit.service';
import type { AuditEntryInput } from '../../../modules/audit/audit.types';
import type { PrismaService } from '../../../modules/prisma/prisma.service';
import { AuditContext } from '../audit-context';
import { AUDIT_METADATA_KEY } from '../audit.constants';
import { AuditInterceptor } from '../audit.interceptor';

/** Minimal HTTP-request shape the interceptor + targetKey extractors read. */
export interface HarnessRequest {
  user?: AuthUser;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  ip?: string;
  url?: string;
  method?: string;
}

export interface RunAuditedHandlerOptions {
  /** Controller class whose method carries the `@Audit()` decorator. */
  controller: new (...args: never[]) => object;
  /** Name of the handler method on the controller. */
  method: string;
  /** Request stand-in passed to the interceptor + targetKey extractor. */
  req: HarnessRequest;
  /**
   * The value the (faked) controller handler resolves to. Forwarded to the
   * interceptor's success branch — used by `targetKey: (_req, result) => ...`
   * extractors and for the `after` snapshot.
   */
  result?: unknown;
  /**
   * Optional hook run *inside* the interceptor's ambient `AuditContext` (i.e.
   * what a real service does mid-handler): stash a `before` snapshot, set
   * `reason` metadata, etc. via the `AuditContext` static API.
   */
  duringHandler?: () => void;
}

export interface RunAuditedHandlerResult {
  /** The single captured audit entry (undefined when nothing was written). */
  entry: AuditEntryInput | undefined;
  /** All captured entries (a correctly-decorated route writes exactly one). */
  entries: AuditEntryInput[];
  /** Whether the faked transaction committed. */
  committed: boolean;
  /** Whether the faked transaction rolled back. */
  rolledBack: boolean;
  /** Number of `prisma.$transaction` opens (0 for `manualTransaction: true`). */
  txOpens: number;
}

/**
 * Reads the `@Audit()` metadata that the production `AuditInterceptor` would
 * see for `controller.prototype[method]`. Returns `undefined` when the method
 * carries no decorator — which is exactly the regression we want a spec to
 * assert against.
 */
export function readAuditConfig(
  controller: new (...args: never[]) => object,
  method: string,
): unknown {
  const reflector = new Reflector();
  const handler = (controller.prototype as Record<string, unknown>)[method] as
    | ((...args: never[]) => unknown)
    | undefined;
  if (typeof handler !== 'function') {
    throw new Error(
      `audit harness: ${controller.name}.${method} is not a method`,
    );
  }
  return reflector.getAllAndOverride(AUDIT_METADATA_KEY, [handler, controller]);
}

/**
 * Drive the real `AuditInterceptor` against a controller method's real
 * `@Audit()` config, with a faked handler + faked Prisma/AuditWriter. Proves
 * the decorator→interceptor→writer path end-to-end without a live DB.
 */
export async function runAuditedHandler(
  opts: RunAuditedHandlerOptions,
): Promise<RunAuditedHandlerResult> {
  const entries: AuditEntryInput[] = [];
  const writer = {
    log: jest.fn(async (entry: AuditEntryInput) => {
      entries.push(entry);
    }),
  } as unknown as AuditWriter;

  const state = { committed: false, rolledBack: false, txOpens: 0 };
  const txClient = {
    __tx: 'harness-sentinel',
  } as unknown as Prisma.TransactionClient;
  const prisma = {
    $transaction: jest.fn(
      async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        state.txOpens += 1;
        try {
          const out = await fn(txClient);
          state.committed = true;
          return out;
        } catch (err) {
          state.rolledBack = true;
          throw err;
        }
      },
    ),
  } as unknown as PrismaService;

  const reflector = new Reflector();
  const interceptor = new AuditInterceptor(reflector, writer, prisma);

  const handler = (opts.controller.prototype as Record<string, unknown>)[
    opts.method
  ] as ((...args: never[]) => unknown) | undefined;
  if (typeof handler !== 'function') {
    throw new Error(
      `audit harness: ${opts.controller.name}.${opts.method} is not a method`,
    );
  }

  const ctx = {
    switchToHttp: () => ({ getRequest: () => opts.req }),
    getHandler: () => handler,
    getClass: () => opts.controller,
  } as unknown as ExecutionContext;

  // Fake "next" handler: runs the optional in-handler hook (what a service
  // does mid-request — setBefore/setMetadata) inside the ambient context, then
  // emits the supplied result. Mirrors the rxjs Observable the real Nest
  // pipeline hands the interceptor.
  const next: CallHandler = {
    handle: () =>
      new Observable<unknown>((subscriber) => {
        if (opts.duringHandler) {
          // Runs inside `AuditContext.run(...)` (the interceptor already
          // opened it before subscribing), so setBefore/setMetadata land on
          // the live store — exactly like a production service call.
          opts.duringHandler();
        }
        // Emit the controller result verbatim (defaults to `undefined`, the
        // 204-style void-handler shape the interceptor tolerates).
        subscriber.next(opts.result);
        subscriber.complete();
      }),
  };

  await lastValueFrom(interceptor.intercept(ctx, next));

  return {
    entry: entries[0],
    entries,
    committed: state.committed,
    rolledBack: state.rolledBack,
    txOpens: state.txOpens,
  };
}

/**
 * Re-export so specs can assert against the same `AuditContext` the harness
 * drives (e.g. snapshot a `before` via `duringHandler`).
 */
export { AuditContext };
