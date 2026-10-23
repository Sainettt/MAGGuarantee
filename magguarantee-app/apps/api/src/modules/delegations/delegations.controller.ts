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
  MarkReadySchema,
  MarkReturnedSchema,
  SubmitDelegationSchema,
  UuidSchema,
  type CancelDelegationDto,
  type DelegationDto,
  type DelegationEligibilityResponse,
  type DelegationFilters,
  type MarkInTransitDto,
  type MarkReadyDto,
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
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  DelegationsService,
  MARK_READY_AUDIT_ACTIONS,
} from './delegations.service';

/**
 * Delegations REST surface per docs/13-api-design.md#delegations.
 *
 * Phase 3 scope:
 *  - POST /delegations (carrier registers a new outing)
 *  - GET /delegations (list, role-scoped)
 *  - GET /delegations/:id (single, owner-scoped for carriers)
 *  - POST /delegations/:id/cancel (carrier cancels their `zgloszony`)
 *
 * Phase 7 rework (2026-06-10 #2 → 2026-06-12 #3): the weryfikator no longer
 * touches delegations at all — that role now records per-VEHICLE DAILY km (see
 * the vehicles module: `PUT /vehicles/:id/daily-km`, `GET /vehicles/km-board`).
 * The former in-transit/returned delegation handlers were removed and
 * `weryfikator` was dropped from every role gate here. `eksport` stays — it
 * keeps its read-only outings board (active-status floor + `includeHistory`
 * toggle). Cancel remains carrier-only, unchanged. (The 2026-06-20 #4 rework
 * brought the transitions and the weryfikator read board back — see the
 * status-transition handlers.)
 *
 * Gates (docs/25 §3 B2): every route carries `@RequirePermission` exactly as
 * planned in `common/authz/endpoint-permissions.ts`, checked by the global
 * `PermissionsGuard` — `delegations.read`, `.create`, `.cancel`,
 * `.mark_ready`, `.transit`; who holds what is `ROLE_PERMISSIONS` in
 * `@magguarantee/shared`. Row scope stays on the role: the class-level
 * `CarrierOwnershipGuard` runs the `@CarrierOwns` checks, and the service
 * narrows lists and status branches by role.
 *
 * `pracownik` intentionally holds NO `delegations.*` permission — per
 * docs/03-roles.md#pracownik that role is a narrow "Opiekun wniosków"
 * scoped to claims verification only. This is stricter than legacy
 * (`getDelegacjeForEksport` allowed pracownik) — decision locked in the
 * wave brief.
 */
@Controller('delegations')
@UseGuards(CarrierOwnershipGuard)
export class DelegationsController {
  constructor(private readonly delegations: DelegationsService) {}

  @Get()
  @RequirePermission('delegations.read')
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
  @RequirePermission('delegations.create')
  async eligibility(
    @CurrentUser() user: AuthUser,
  ): Promise<DelegationEligibilityResponse> {
    return this.delegations.eligibility(user);
  }

  @Get(':id')
  @RequirePermission('delegations.read')
  @CarrierOwns('id', 'param', 'delegationId')
  async getOne(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<DelegationDto> {
    return this.delegations.getOne(user, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('delegations.create')
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
  // Phase 7 REWORK (2026-06-20 #4) — admin may anulate any active outing; the
  // carrier branch (own + `zgloszony`) is unchanged. `delegations.cancel`
  // (przewoznik, admin) opens the route; the service picks the branch by role.
  @RequirePermission('delegations.cancel')
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

  // ── Status transitions (Phase 7 REWORK 2026-06-20 #4) ────

  /**
   * `POST /delegations/:id/ready` — `delegations.mark_ready` (eksport, admin).
   * `zgloszony → gotowy` (clean flip after a SpedTrans zlecenie) + rollback
   * `gotowy → zgloszony` (pre-`w_trasie`, via `rollback: true`). The state
   * machine 422s an illegal edge.
   *
   * Audit: `delegation.markReady` for the flip; the service renames the row to
   * `delegation.rollbackReady` on the rollback branch (`AuditContext.setAction`)
   * and stashes the pre-transition status / sped number as `before`.
   */
  @Post(':id/ready')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('delegations.mark_ready')
  @Audit({
    action: MARK_READY_AUDIT_ACTIONS.ready,
    targetType: 'Delegation',
    targetKey: (req) => req.params?.id,
  })
  async markReady(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(MarkReadySchema)) dto: MarkReadyDto,
  ): Promise<DelegationDto> {
    return this.delegations.markReady(user, id, dto);
  }

  /**
   * `POST /delegations/:id/in-transit` — `delegations.transit` (weryfikator,
   * admin). `gotowy → w_trasie`, stamps `verifiedBy/At`. admin holds the
   * permission but still goes through the state machine (no skipping `gotowy`).
   */
  @Post(':id/in-transit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('delegations.transit')
  @Audit({
    action: 'delegation.markInTransit',
    targetType: 'Delegation',
    targetKey: (req) => req.params?.id,
  })
  async markInTransit(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(MarkInTransitSchema)) dto: MarkInTransitDto,
  ): Promise<DelegationDto> {
    return this.delegations.markInTransit(user, id, dto);
  }

  /**
   * `POST /delegations/:id/returned` — `delegations.transit` (weryfikator,
   * admin). `w_trasie → zjechal` with date-only `actualReturnAt`. In one
   * transaction: sets `actualReturnAt` + `verifiedBy/At`, advances
   * `Vehicle.lastDroveAt`, and auto-recalculates the linked wniosek. The
   * `@Audit('delegation.markReturned')` interceptor opens that ambient
   * transaction.
   */
  @Post(':id/returned')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('delegations.transit')
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
