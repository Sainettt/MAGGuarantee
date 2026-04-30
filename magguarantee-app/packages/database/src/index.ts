// @magguarantee/database — Phase 1 entrypoint.
//
// Re-exports the generated Prisma client + a process-wide singleton `prisma`
// instance. Callers (api-agent, seed scripts, future workers) should import
// from here, never directly from `./generated`.

import { PrismaClient } from './generated';

export * from './generated';
export * from './enums';

// Lazy singleton — survives Next.js / NestJS hot reload by stashing the
// instance on globalThis. Avoids exhausting connections during dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
