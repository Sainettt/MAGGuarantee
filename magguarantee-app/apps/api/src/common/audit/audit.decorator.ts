import { SetMetadata } from '@nestjs/common';

import { AUDIT_METADATA_KEY } from './audit.constants';

/**
 * Configuration for `@Audit(...)`. Passed through the reflector to the
 * `AuditInterceptor`, which reads it on every request and decides whether
 * to write a row to `audit_log`.
 *
 * Per docs/13-api-design.md#audit-на-уровне-api and
 * docs/04-data-model.md#auditlog-аудит.
 */
export interface AuditConfig {
  /**
   * Stable identifier for the action: `createCarrier`, `updateClaim`,
   * `cancelDelegation`, ... — the docs treat this as a free-form string
   * but the convention is camelCase verb-noun.
   *
   * This is the DEFAULT name. When one route carries two intents picked by the
   * request body, the service renames the row at runtime with
   * `AuditContext.setAction(...)` once it knows which branch ran — e.g.
   * `POST /delegations/:id/ready` writes `delegation.markReady` for the flip
   * and `delegation.rollbackReady` for `rollback: true`. Keep this default
   * set to the primary intent so a forgotten override still leaves a row.
   */
  action: string;

  /**
   * Entity name targeted by the action. Persisted as `audit_log.target_type`.
   * Examples: `'Carrier'`, `'Claim'`, `'Vehicle'`.
   */
  targetType?: string;

  /**
   * How to derive the human-readable target key (e.g. `nrZgl`, plate number,
   * carrier login) from either the request or the response. The interceptor
   * runs the function with both arguments after a successful response.
   *
   * Most often you'll either:
   *  - read from the response: `(_req, result) => result.nrZgl`
   *  - read from a path param: `(req) => req.params.id`
   */
  targetKey?: (req: AuditableRequest, result: unknown) => string | undefined;

  /**
   * If true, omit the response body from `after`. Useful for endpoints whose
   * response is the same row already captured by `targetKey` and contains
   * a lot of noise.
   *
   * Default: false (the scrubbed result body is stored in `after`).
   */
  omitResultBody?: boolean;

  /**
   * If true, the `AuditInterceptor` does NOT open a `prisma.$transaction`
   * around the handler. The handler runs without an ambient DB transaction
   * and the audit row is written standalone (on a fresh connection) after a
   * successful response.
   *
   * Use this for endpoints that:
   *  - perform external I/O inside the handler (e.g. S3 uploads) — keeping
   *    those out of a DB transaction avoids holding a pooled connection across
   *    network calls and blowing the default 5s interactive-tx timeout; OR
   *  - manage their own `prisma.$transaction(...)` for multi-statement
   *    atomicity (e.g. `claims.submit` reserving an `nrZgl` + inserting the
   *    claim), so transactional control is explicit in the service rather than
   *    implicit in this decorator.
   *
   * Trade-off: the audit row is no longer atomic with the mutation. The
   * mutation's own atomicity must be guaranteed by the service (explicit
   * transaction) or by compensating rollback (e.g. vehicles' upload rollback).
   *
   * Default: false (interceptor opens a transaction; audit row commits with
   * the mutation).
   */
  manualTransaction?: boolean;
}

/**
 * Minimal HTTP-request shape the audit decorator's `targetKey` callback
 * sees. Kept independent from express types so service tests can use
 * plain objects.
 */
export interface AuditableRequest {
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  ip?: string;
  url?: string;
  method?: string;
}

/**
 * Marks a controller method (or whole controller) as audit-tracked.
 *
 * Every POST/PUT/PATCH/DELETE route must carry this decorator or be listed,
 * with a reason, in the allowlist of `audit-coverage.inverse.spec.ts`
 * (@Public auth routes audited from the service, read-only POST lookups, ...).
 *
 * Usage:
 *   ```ts
 *   @Patch(':nrZgl')
 *   @Roles('admin', 'pracownik')
 *   @Audit({
 *     action: 'updateClaim',
 *     targetType: 'Claim',
 *     targetKey: (req) => req.params.nrZgl,
 *   })
 *   updateClaim(...)
 *   ```
 *
 * The `AuditInterceptor` (registered globally via `AuditModule`) handles the
 * actual write. On request error the audit row is **not** written — the
 * interceptor only emits on the success branch.
 */
export const Audit = (
  config: AuditConfig,
): MethodDecorator & ClassDecorator => SetMetadata(AUDIT_METADATA_KEY, config);
