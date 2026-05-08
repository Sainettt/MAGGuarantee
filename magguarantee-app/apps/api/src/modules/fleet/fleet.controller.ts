import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import {
  MyFleetQuerySchema,
  type MyFleetQuery,
  type MyFleetResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FleetService } from './fleet.service';

/**
 * Fleet aggregates REST surface per docs/13-api-design.md#fleet.
 *
 * Phase 3 ships only `/fleet/my` (carrier role). The other variants
 * (`/fleet/opiekun`, `/fleet/planista`, `/fleet/dyspozytor`,
 * `/fleet/eksport`, `/fleet/weryfikator`) belong to later phases.
 */
@Controller('fleet')
@UseGuards(RolesGuard)
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  @Get('my')
  @Roles('przewoznik')
  async my(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(MyFleetQuerySchema)) query: MyFleetQuery,
  ): Promise<MyFleetResponse> {
    return this.fleet.getMyFleet(user, query);
  }
}
