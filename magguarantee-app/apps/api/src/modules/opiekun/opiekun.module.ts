import { Module } from '@nestjs/common';

import { CarriersModule } from '../carriers/carriers.module';
import { OpiekunController } from './opiekun.controller';
import { OpiekunService } from './opiekun.service';

/**
 * Phase 5 — Opiekun-scoped surface. Backs `/api/v1/opiekun/*`. The
 * controller leans on `CarriersRepository` (re-exported from
 * `CarriersModule`) — no Prisma access of its own, no new repository.
 */
@Module({
  imports: [CarriersModule],
  controllers: [OpiekunController],
  providers: [OpiekunService],
  exports: [OpiekunService],
})
export class OpiekunModule {}
