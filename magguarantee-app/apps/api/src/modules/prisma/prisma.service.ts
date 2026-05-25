import { Injectable, OnModuleDestroy } from '@nestjs/common';

import {
  PrismaClient,
  prisma as prismaSingleton,
  type Prisma,
} from '@magguarantee/database';

import { AuditContext } from '../../common/audit/audit-context';
import { softDeleteExtension } from './soft-delete.extension';

/**
 * The extended client surface — the result of `prismaSingleton.$extends(...)`.
 * Prisma's typings produce a complex generic type for extended clients; we
 * treat it nominally for DI purposes (callers use property access patterns
 * identical to the base client).
 */
type ExtendedPrismaClient = ReturnType<typeof buildClient>;

function buildClient() {
  return prismaSingleton.$extends(softDeleteExtension());
}

/**
 * Thin DI wrapper around the @magguarantee/database singleton client,
 * post-`$extends` with the soft-delete extension (per
 * docs/12-database-schema.md#soft-delete).
 *
 * Repositories inject this service and call `prisma.client.user.findUnique(...)`.
 * Controllers and feature services never touch Prisma directly — they go
 * through repositories per the api-agent guidelines.
 *
 * NOTE: extending returns a NEW client; the underlying singleton (used by
 * the seed script and any future scripts that import `prisma` directly from
 * @magguarantee/database) is unaffected. Soft-delete only applies to API
 * code paths.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: ExtendedPrismaClient = buildClient();

  // Convenience accessors — ergonomically equivalent to `service.client.X`.
  // These reach through to the extended client. Repositories may use either.
  get user() {
    return this.client.user;
  }
  get refreshToken() {
    return this.client.refreshToken;
  }
  get appConfig() {
    return this.client.appConfig;
  }

  /**
   * Ambient-aware Prisma delegate surface. When a `@Audit()`-marked endpoint
   * is being processed, the `AuditInterceptor` opens a `prisma.$transaction`
   * and stashes the transaction client into `AuditContext`. Any repository
   * using `this.prisma.tx.<model>.<op>` therefore enrolls into the same
   * transaction as the audit row write — both commit together or roll back
   * together (no more "mutation succeeded, audit row missing" window).
   *
   * Outside an audited request (`AuditContext.current() === undefined`) the
   * getter falls back to the root extended client. That keeps the migration
   * transparent for auth / cron / non-audit paths — they continue to operate
   * on a fresh connection per call.
   *
   * The return type is the loose union of `PrismaClient` and
   * `Prisma.TransactionClient` because the extended client and a tx client
   * share the same delegate shape; callers don't care which one they got.
   */
  get tx(): PrismaClient | Prisma.TransactionClient {
    return (
      (AuditContext.current()?.tx as unknown as PrismaClient | undefined) ??
      (this.client as unknown as PrismaClient)
    );
  }

  /**
   * Pass-through to the extended client's $transaction. Matches the previous
   * Phase 1 signature so existing callers (AuthService) are unchanged.
   */
  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return (this.client.$transaction as unknown as (
      cb: (tx: unknown) => Promise<T>,
    ) => Promise<T>)(fn as unknown as (tx: unknown) => Promise<T>);
  }

  async onModuleDestroy(): Promise<void> {
    // Disconnect the underlying singleton — extensions share the same
    // underlying connection pool with their parent.
    await prismaSingleton.$disconnect();
  }
}
