import { Controller, Get } from '@nestjs/common';

import type { OpiekunCarriersResponse } from '@magguarantee/shared';

import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { OpiekunService } from './opiekun.service';

/**
 * Phase 5 — opiekun-scoped surface.
 *
 * `GET /api/v1/opiekun/carriers` — lighter sibling of `/fleet/opiekun`.
 * Returns the identity + active-child counts of every carrier under the
 * caller's supervision (admin → all carriers; opiekun → own only). Used
 * for the dashboard sidebar / navigation rail.
 *
 * Gate mirrors `/fleet/opiekun`: `@RequirePermission('panel.opiekun')`
 * (admin, opiekun; docs/25 §3 B2, global `PermissionsGuard`).
 * Ownership scoping is applied server-side in
 * `OpiekunService.listMyCarriers` (the OpiekunOwnershipGuard is
 * decorator-driven and only fires on single-resource lookups).
 */
@Controller('opiekun')
export class OpiekunController {
  constructor(private readonly opiekun: OpiekunService) {}

  @Get('carriers')
  @RequirePermission('panel.opiekun')
  async carriers(
    @CurrentUser() user: AuthUser,
  ): Promise<OpiekunCarriersResponse> {
    return this.opiekun.listMyCarriers(user);
  }
}
