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
import { Throttle } from '@nestjs/throttler';

import {
  ClaimDtoSchema,
  ClaimFiltersSchema,
  PreviewClaimSchema,
  SubmitClaimSchema,
  SubmitReklamacjaSchema,
  type ClaimDto,
  type ClaimFilters,
  type ClaimListItem,
  type PreviewClaimDto,
  type PreviewClaimResponse,
  type SubmitClaimDto,
  type SubmitReklamacjaDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import {
  CarrierOwnershipGuard,
  CarrierOwns,
} from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClaimsService } from './claims.service';

// Claim rate limits per docs/13-api-design.md#rate-limiting:
//   /claims/*/preview — 30 / minute / user
// (Other claim endpoints fall through to the global 100 / minute / user.)
const TEST_BYPASS = process.env.NODE_ENV === 'test';
const RL_PREVIEW = {
  limit: TEST_BYPASS ? 1_000 : 30,
  ttl: 60_000,
};

/**
 * Claims REST surface per docs/13-api-design.md#claims.
 *
 * Phase 3 scope:
 *  - POST /claims (submit)
 *  - GET /claims (list, role-scoped)
 *  - GET /claims/:nrZgl (single)
 *  - POST /claims/preview (unscoped — new-claim form)
 *  - POST /claims/:nrZgl/preview (scoped to existing — reklamacja edit)
 *  - POST /claims/:nrZgl/reklamacja (carrier disputes a decided claim)
 *
 * Phase 4 will add:
 *  - PATCH /claims/:nrZgl (verification + decision)
 *  - POST /claims/:nrZgl/auth-screenshot (multipart S3 upload)
 *  - POST /claims/:nrZgl/request-authorization
 */
@Controller('claims')
@UseGuards(RolesGuard, CarrierOwnershipGuard)
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  // ── List & detail ───────────────────────────────────────

  @Get()
  @Roles(
    'admin',
    'pracownik',
    'opiekun',
    'planista',
    'dyspozytor',
    'przewoznik',
    'eksport',
    'weryfikator',
  )
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ClaimFiltersSchema)) query: ClaimFilters,
  ): Promise<{ items: ClaimListItem[]; nextCursor: string | null }> {
    return this.claims.list(user, query);
  }

  /**
   * `POST /claims/preview` — unscoped, used by the carrier's new-claim form
   * to render a live km-calc preview without persisting. No `nrZgl` param
   * because the claim doesn't exist yet. Per Phase 3 user decisions.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Roles('przewoznik')
  @Throttle({ default: RL_PREVIEW })
  async previewNew(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(PreviewClaimSchema)) dto: PreviewClaimDto,
  ): Promise<PreviewClaimResponse> {
    return this.claims.previewKmCalc(user, dto);
  }

  @Get(':nrZgl')
  @Roles(
    'admin',
    'pracownik',
    'opiekun',
    'planista',
    'dyspozytor',
    'przewoznik',
    'eksport',
    'weryfikator',
  )
  @CarrierOwns('nrZgl', 'param', 'claimNrZgl')
  async getOne(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
  ): Promise<ClaimDto> {
    return this.claims.getOne(user, nrZgl);
  }

  /**
   * `POST /claims/:nrZgl/preview` — scoped to an existing claim. Used by the
   * reklamacja edit form so the carrier can see how amended inputs would
   * have changed the math.
   */
  @Post(':nrZgl/preview')
  @HttpCode(HttpStatus.OK)
  @Roles('przewoznik')
  @Throttle({ default: RL_PREVIEW })
  @CarrierOwns('nrZgl', 'param', 'claimNrZgl')
  async previewExisting(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
    @Body(new ZodValidationPipe(PreviewClaimSchema)) dto: PreviewClaimDto,
  ): Promise<PreviewClaimResponse> {
    return this.claims.previewForExisting(user, nrZgl, dto);
  }

  // ── Submit (carrier) ────────────────────────────────────

  /**
   * `POST /claims` — only carriers may submit. `Idempotency-Key` header is
   * accepted per docs/13-api-design.md#idempotency; the actual
   * de-duplication happens in a future Wave's IdempotencyInterceptor.
   * For now we wire the route + audit so the contract holds.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('przewoznik')
  @CarrierOwns('vehicleId', 'body', 'vehicleId')
  @Audit({
    action: 'submitClaim',
    targetType: 'Claim',
    targetKey: (_req, result) =>
      ClaimDtoSchema.safeParse(result).success
        ? (result as { nrZgl: string }).nrZgl
        : undefined,
  })
  async submit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(SubmitClaimSchema)) dto: SubmitClaimDto,
  ): Promise<ClaimDto> {
    return this.claims.submit(user, dto);
  }

  // ── Reklamacja ──────────────────────────────────────────

  @Post(':nrZgl/reklamacja')
  @HttpCode(HttpStatus.OK)
  @Roles('przewoznik')
  @CarrierOwns('nrZgl', 'param', 'claimNrZgl')
  @Audit({
    action: 'submitReklamacja',
    targetType: 'Claim',
    targetKey: (req) => req.params?.nrZgl,
  })
  async submitReklamacja(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
    @Body(new ZodValidationPipe(SubmitReklamacjaSchema))
    dto: SubmitReklamacjaDto,
  ): Promise<ClaimDto> {
    return this.claims.submitReklamacja(user, nrZgl, dto);
  }
}
