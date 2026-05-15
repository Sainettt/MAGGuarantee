import { Controller, Get } from '@nestjs/common';

import type { LookupUserListDto } from '@magguarantee/shared';

import { LookupsService } from './lookups.service';

/**
 * Read-only dropdown helpers per docs/13-api-design.md#lookups.
 *
 * Every endpoint here is accessible by all authenticated users — no
 * `@Roles()` restriction. The global `JwtAuthGuard` already handles auth.
 *
 * Note: `GET /lookups/cert-types` was removed in the
 * 20260515130307_vehicle_certificate_l_to_boolean wave — `Vehicle.certificateL`
 * is now a Boolean (TAK/NIE) so no enum lookup is needed.
 */
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get('dyspozytor')
  dyspozytor(): Promise<LookupUserListDto> {
    return this.lookups.dyspozytor();
  }

  @Get('planisci')
  planisci(): Promise<LookupUserListDto> {
    return this.lookups.planisci();
  }

  @Get('opiekuni')
  opiekuni(): Promise<LookupUserListDto> {
    return this.lookups.opiekuni();
  }
}
