import { Controller, Get, UseGuards } from '@nestjs/common';

import type { OpiekunCarriersResponse } from '@magguarantee/shared';

import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OpiekunService } from './opiekun.service';

/**
 * Phase 5 — opiekun-scoped surface.
 *
 * `GET /api/v1/opiekun/carriers` — lighter sibling of `/fleet/opiekun`.
 * Returns the identity + active-child counts of every carrier under the
 * caller's supervision (admin → all carriers; opiekun → own only). Used
 * for the dashboard sidebar / navigation rail.
 *
 * Role gating mirrors `/fleet/opiekun`: `@Roles('admin','opiekun')`.
 * Ownership scoping is applied server-side in
 * `OpiekunService.listMyCarriers` (the OpiekunOwnershipGuard is
 * decorator-driven and only fires on single-resource lookups).
 */
@Controller('opiekun')
@UseGuards(RolesGuard)
export class OpiekunController {
  constructor(private readonly opiekun: OpiekunService) {}

  @Get('carriers')
  @Roles('admin', 'opiekun')
  async carriers(
    @CurrentUser() user: AuthUser,
  ): Promise<OpiekunCarriersResponse> {
    return this.opiekun.listMyCarriers(user);
  }
}
