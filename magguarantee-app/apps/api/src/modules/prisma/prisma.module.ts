import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

// Re-export the soft-delete public surface so callers can import from a
// stable module path without reaching into the extension file.
export { INCLUDE_SOFT_DELETED, SOFT_DELETE_MODELS } from './soft-delete.extension';
export type { SoftDeleteModel } from './soft-delete.extension';
