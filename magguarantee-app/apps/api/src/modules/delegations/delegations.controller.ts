import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CancelDelegationSchema,
  DelegationFiltersSchema,
  SubmitDelegationSchema,
  UuidSchema,
  type CancelDelegationDto,
  type DelegationDto,
  type DelegationEligibilityResponse,
  type DelegationFilters,
  type SubmitDelegationDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import {
  CarrierOwnershipGuard,
  CarrierOwns,
} from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DelegationsService } from './delegations.service';

/**
 * Delegations REST surface per docs/13-api-design.md#delegations.
 *
 * Phase 3 scope:
 *  - POST /delegations (carrier registers a new outing)
 *  - GET /delegations (list, role-scoped)
 *  - GET /delegations/:id (single, owner-scoped for carriers)
 *  - POST /delegations/:id/cancel (carrier cancels their `zgloszony`)
 *
 * Phase 7 rework (2026-06-10 #2): the weryfikator no longer touches
 * delegations at all — that role now manages per-VEHICLE route status (see the
 * vehicles module: `POST /vehicles/:id/route-status`). The former
 * in-transit/returned delegation handlers were removed and `weryfikator` was
 * dropped from every `@Roles(...)` here. `eksport` stays — it keeps its
 * read-only outings board (active-status floor + `includeHistory` toggle).
 * Cancel remains carrier-only, unchanged.
 *
 * `pracownik` is intentionally NOT in the role list — per
 * docs/03-roles.md#pracownik that role is a narrow "Opiekun wniosków"
 * scoped to claims verification only. This is stricter than legacy
 * (`getDelegacjeForEksport` allowed pracownik) — decision locked in the
 * wave brief.
 */
@Controller('delegations')
@UseGuards(RolesGuard, CarrierOwnershipGuard)
export class DelegationsController {
  constructor(private readonly delegations: DelegationsService) {}

  @Get()
  @Roles('admin', 'opiekun', 'planista', 'dyspozytor', 'przewoznik', 'eksport')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(DelegationFiltersSchema))
    query: DelegationFilters,
  ): Promise<{ items: DelegationDto[]; nextCursor: string | null }> {
    return this.delegations.list(user, query);
  }

  /**
   * Carrier-portal readiness flag for the new-delegation form. Declared
   * BEFORE `GET /:id` so the literal `eligibility` segment is matched first
   * (Express matches routes in declaration order). Returns only a boolean —
   * no breakdown — per the product decision (the detail lives on the opiekun
   * fleet view via `attentionReasons`).
   */
  @Get('eligibility')
  @Roles('przewoznik')
  async eligibility(
    @CurrentUser() user: AuthUser,
  ): Promise<DelegationEligibilityResponse> {
    return this.delegations.eligibility(user);
  }

  @Get(':id')
  @Roles('admin', 'opiekun', 'planista', 'dyspozytor', 'przewoznik', 'eksport')
  @CarrierOwns('id', 'param', 'delegationId')
  async getOne(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<DelegationDto> {
    return this.delegations.getOne(user, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('przewoznik')
  @CarrierOwns('vehicleId', 'body', 'vehicleId')
  @Audit({
    action: 'submitDelegation',
    targetType: 'Delegation',
    targetKey: (_req, result) => (result as { id?: string })?.id,
  })
  async add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(SubmitDelegationSchema))
    dto: SubmitDelegationDto,
  ): Promise<DelegationDto> {
    return this.delegations.add(user, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('przewoznik')
  @CarrierOwns('id', 'param', 'delegationId')
  @Audit({
    action: 'cancelDelegation',
    targetType: 'Delegation',
    targetKey: (req) => req.params?.id,
  })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(CancelDelegationSchema))
    dto: CancelDelegationDto,
  ): Promise<DelegationDto> {
    return this.delegations.cancel(user, id, dto);
  }
}
