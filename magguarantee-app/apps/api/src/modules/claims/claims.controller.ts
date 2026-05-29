import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import {
  ClaimDtoSchema,
  ClaimFiltersSchema,
  PreviewClaimSchema,
  RequestAuthorizationSchema,
  SubmitClaimSchema,
  SubmitReklamacjaSchema,
  UpdateClaimSchema,
  type ClaimDto,
  type ClaimFilters,
  type ClaimListItem,
  type PreviewClaimDto,
  type PreviewClaimResponse,
  type RequestAuthorizationDto,
  type SubmitClaimDto,
  type SubmitReklamacjaDto,
  type UpdateClaimDto,
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
 * Phase 4 — sub-slice 4.1 (this commit):
 *  - PATCH /claims/:nrZgl (verification + decision, admin/pracownik only)
 *
 * Phase 4 — later sub-slices:
 *  - POST /claims/:nrZgl/request-authorization (sub-slice 4.2)
 *  - Auth-screenshot upload — REMOVED from scope (user decision).
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
  @Roles('przewoznik', 'pracownik', 'admin')
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
    // submit() opens its own `prisma.$transaction` for the atomic nrZgl-counter
    // bump + claim insert — transactional control is explicit in the service,
    // not implied by this decorator. Audit row is written standalone on success.
    manualTransaction: true,
  })
  async submit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(SubmitClaimSchema)) dto: SubmitClaimDto,
  ): Promise<ClaimDto> {
    return this.claims.submit(user, dto);
  }

  // ── Update / verify (admin / pracownik) ─────────────────

  /**
   * `PATCH /claims/:nrZgl` — verifier's decision endpoint per
   * docs/13-api-design.md#claims-wnioski (`PATCH /claims/:nrZgl` row,
   * docs/13-api-design.md:194) and the per-target invariants documented in
   * docs/13-api-design.md#update-claim-verification (lines 350-364).
   *
   * Body is the discriminated union `UpdateClaimSchema` from
   * `@magguarantee/shared`; the service translates synthetic
   * `REKLAMACJA_*` literals back into the underlying `ClaimStatus` before
   * persisting and validates the transition against the 9-edge state
   * machine. The audit row writes in the same `$transaction` as the
   * mutation (`AuditWriter.log({ tx })`).
   */
  @Patch(':nrZgl')
  @Roles('admin', 'pracownik')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
    @Body(new ZodValidationPipe(UpdateClaimSchema)) dto: UpdateClaimDto,
    @Req() req: Request,
  ): Promise<ClaimDto> {
    const ip = extractRequestIp(req);
    return this.claims.update(user, nrZgl, dto, ip);
  }

  // ── Request authorization (Phase 4.2) ───────────────────

  /**
   * `POST /claims/:nrZgl/request-authorization` per
   * docs/13-api-design.md#claims (line 274).
   *
   * Admin / pracownik flags a verified claim as needing Maksim sign-off
   * before being booked as accepted. The service:
   *  - transitions the claim into `OCZEKUJE_NA_AUTORYZACJE`,
   *  - mints a fresh `authorizationToken`,
   *  - persists `Claim.amountMaximum = kwotaMaksima`,
   *  - dispatches an email to `MAKSIM_EMAIL` (Mailhog in dev).
   *
   * Audit row commits in the same `prisma.$transaction` as the row update
   * via the global `AuditInterceptor` (see `@Audit(...)` below). Email send
   * is fire-and-log outside the transaction — same policy as submit /
   * reklamacja / verification.
   */
  @Post(':nrZgl/request-authorization')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'pracownik')
  @Audit({
    action: 'claim.requestAuthorization',
    targetType: 'Claim',
    targetKey: (req) => req.params?.nrZgl,
  })
  async requestAuthorization(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
    @Body(new ZodValidationPipe(RequestAuthorizationSchema))
    dto: RequestAuthorizationDto,
  ): Promise<ClaimDto> {
    return this.claims.requestAuthorization(user, nrZgl, dto);
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

/**
 * Best-effort client IP extraction. Prefers `x-forwarded-for` (first hop,
 * trimmed) when the API sits behind Caddy / nginx; falls back to Express'
 * `req.ip`. Returns `undefined` when neither is set — `AuditWriter` accepts
 * an absent ipAddress so the field stays NULL in that case.
 *
 * Mirror of `_extractIp` in `apps/api/src/common/audit/audit.interceptor.ts`
 * — kept inline rather than extracted to keep the controller's import
 * surface minimal.
 */
function extractRequestIp(req: Request): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  const xffStr = Array.isArray(xff) ? xff[0] : xff;
  if (typeof xffStr === 'string' && xffStr.length > 0) {
    const first = xffStr.split(',')[0]?.trim();
    if (first) return first;
  }
  return typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : undefined;
}
