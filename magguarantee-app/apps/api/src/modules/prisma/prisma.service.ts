import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { PrismaClient, prisma as prismaSingleton } from '@magguarantee/database';

/**
 * Thin DI wrapper around the @magguarantee/database singleton client.
 *
 * Repositories inject this service and call `prisma.user.findUnique(...)`.
 * Controllers and feature services never touch Prisma directly — they go
 * through repositories per the api-agent guidelines.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = prismaSingleton;

  // Convenience accessors — ergonomically equivalent to `service.client.user`.
  get user() {
    return this.client.user;
  }
  get refreshToken() {
    return this.client.refreshToken;
  }
  get appConfig() {
    return this.client.appConfig;
  }

  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    // The Prisma typings for $transaction give us a TransactionClient. For
    // our usage we re-cast to PrismaClient since we only call standard
    // model accessors inside the callback.
    return this.client.$transaction(fn as never) as Promise<T>;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
