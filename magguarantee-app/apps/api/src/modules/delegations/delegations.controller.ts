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
  MarkInTransitSchema,
  MarkReturnedSchema,
  SubmitDelegationSchema,
  UuidSchema,
  type CancelDelegationDto,
  type DelegationDto,
  type DelegationEligibilityResponse,
  type DelegationFilters,
  type MarkInTransitDto,
  type MarkReturnedDto,
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
 * Phase 7 adds the weryfikator status lifecycle (admin may also drive it):
 *  - POST /delegations/:id/in-transit (weryfikator | admin) — zgloszony→w_trasie
 *  - POST /delegations/:id/returned   (weryfikator | admin) — w_trasie→zjechal
 * The verifier has NO cancel authority (owner decision 2026-06-10): cancel
 * stays carrier-only below, unchanged.
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
  @Roles(
    'admin',
    'opiekun',
    'planista',
    'dyspozytor',
    'przewoznik',
    'eksport',
    'weryfikator',
  )
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
  @Roles(
    'admin',
    'opiekun',
    'planista',
    'dyspozytor',
    'przewoznik',
    'eksport',
    'weryfikator',
  )
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

  /**
   * `zgloszony → w_trasie`. Verifier/admin only. Empty body (`.strict({})`).
   * The `@Audit` interceptor opens the transaction the service's write +
   * audit row commit inside; the state machine rejects a wrong source status
   * with 409 before any write. No `CarrierOwnershipGuard` applies — the
   * verifier is an all-access role, the guard short-circuits for non-carriers.
   */
  @Post(':id/in-transit')
  @HttpCode(HttpStatus.OK)
  @Roles('weryfikator', 'admin')
  @Audit({
    action: 'delegation.markInTransit',
    targetType: 'Delegation',
    targetKey: (req) => req.params?.id,
  })
  async markInTransit(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(MarkInTransitSchema)) _dto: MarkInTransitDto,
  ): Promise<DelegationDto> {
    return this.delegations.markInTransit(user, id);
  }

  /**
   * `w_trasie → zjechal`. Verifier/admin only. Body `{ actualReturnAt }`
   * (date-only, same convention as `plannedReturnAt`). Atomically mirrors
   * `actualReturnAt` into `Vehicle.lastDroveAt` (key Phase 7 deliverable).
   */
  @Post(':id/returned')
  @HttpCode(HttpStatus.OK)
  @Roles('weryfikator', 'admin')
  @Audit({
    action: 'delegation.markReturned',
    targetType: 'Delegation',
    targetKey: (req) => req.params?.id,
  })
  async markReturned(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(MarkReturnedSchema)) dto: MarkReturnedDto,
  ): Promise<DelegationDto> {
    return this.delegations.markReturned(user, id, dto);
  }
}
