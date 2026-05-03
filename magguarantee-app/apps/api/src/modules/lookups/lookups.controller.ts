import { Controller, Get } from '@nestjs/common';

import type { CertTypeListDto, LookupUserListDto } from '@magguarantee/shared';

import { LookupsService } from './lookups.service';

/**
 * Read-only dropdown helpers per docs/13-api-design.md#lookups.
 *
 * Every endpoint here is accessible by all authenticated users — no
 * `@Roles()` restriction. The global `JwtAuthGuard` already handles auth.
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

  @Get('cert-types')
  certTypes(): CertTypeListDto {
    return [...this.lookups.certTypes()];
  }
}
