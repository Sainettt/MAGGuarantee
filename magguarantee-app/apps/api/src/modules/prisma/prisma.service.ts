import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { PrismaClient, prisma as prismaSingleton } from '@magguarantee/database';

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
