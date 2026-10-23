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
  SubmitClaimSchema,
  SubmitReklamacjaSchema,
  UpdateClaimSchema,
  VerifyClaimSchema,
  type ClaimDto,
  type ClaimFilters,
  type ClaimListItem,
  type PreviewClaimDto,
  type PreviewClaimResponse,
  type RecalcLimitsPreviewDto,
  type SubmitClaimDto,
  type SubmitReklamacjaDto,
  type UpdateClaimDto,
  type VerifyClaimDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import {
  CarrierOwnershipGuard,
  CarrierOwns,
} from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { clientIp } from '../../common/utils/client-ip';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
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
 * Phase 4:
 *  - PATCH /claims/:nrZgl (decision, `claims.verify` — admin/pracownik)
 *  - PATCH /claims/:nrZgl/verification («Zapisz weryfikację» checkpoint; the
 *    over-threshold dopłata auto-moves the claim into OCZEKUJE_NA_AUTORYZACJE)
 *
 * The Maksim confirmation screenshot lives in claim-attachments
 * (`AUTORYZACJA_MAKSIMA`), lifting the over-threshold decision gate — the
 * over-threshold verification auto-moves the claim into OCZEKUJE_NA_AUTORYZACJE
 * (no manual flow).
 *
 * Gates (docs/25 §3 B2, B5): every route carries `@RequirePermission`, checked
 * by the global `PermissionsGuard` and mirrored per route in the generated
 * fixture `common/authz/__fixtures__/endpoint-permissions.snapshot.json` —
 * `claims.read` (admin, pracownik, przewoznik),
 * `claims.submit` (przewoznik), `claims.verify` (admin, pracownik); who holds
 * what is `ROLE_PERMISSIONS` in `@magguarantee/shared`. Row scope stays on
 * the role: the class-level `CarrierOwnershipGuard` runs the `@CarrierOwns`
 * checks, and the service narrows lists / re-checks single reads.
 */
@Controller('claims')
@UseGuards(CarrierOwnershipGuard)
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  // ── List & detail ───────────────────────────────────────

  // `claims.read` — held ONLY by admin/pracownik (all wnioski) and przewoznik
  // (own). opiekun has NO claims access at all — neither the list nor a single
  // wniosek (decision 2026-10-22, docs/03-roles.md#opiekun; it used to read
  // its own carriers' claims). planista / dyspozytor / eksport / weryfikator
  // have no claims access either (docs/03-roles.md access matrix). The same
  // permission guards `getOne` below; the service re-checks the role as
  // defence-in-depth.
  @Get()
  @RequirePermission('claims.read')
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
   *
   * No `@CarrierOwns` body guard: `delegationId` is OPTIONAL on the preview
   * body (Phase 7 §0″ finish) and the guard's `_extractId` 400s on a missing
   * id. Ownership is enforced in the service — `previewKmCalc` validates the
   * carrier owns the chosen outing (`_resolveDelegationContext`) or the
   * fallback `vehicleId` (`_requireOwnedVehicle`).
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('claims.submit')
  @Throttle({ default: RL_PREVIEW })
  async previewNew(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(PreviewClaimSchema)) dto: PreviewClaimDto,
  ): Promise<PreviewClaimResponse> {
    return this.claims.previewKmCalc(user, dto);
  }

  @Get(':nrZgl')
  @RequirePermission('claims.read')
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
   *
   * Any-of `claims.submit` (the carrier's reklamacja form) / `claims.verify`
   * (the verifier's edit mode): whoever may amend the wniosek may preview the
   * amendment.
   */
  @Post(':nrZgl/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('claims.submit', 'claims.verify')
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
   * `POST /claims` — `claims.submit`, held only by carriers. `Idempotency-Key`
   * header is accepted per docs/13-api-design.md#idempotency; the actual
   * de-duplication happens in a future Wave's IdempotencyInterceptor.
   * For now we wire the route + audit so the contract holds.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('claims.submit')
  // Phase 7 §0″ finish — vehicle/trailer/driver/mileage no longer travel in the
  // body; ownership is now enforced via the chosen outing. The `delegationId`
  // body field must point at an outing owned by the authenticated carrier
  // (`delegation.carrierId === carrier`); the service re-validates this in
  // `_resolveDelegationContext` (defence-in-depth).
  @CarrierOwns('delegationId', 'body', 'delegationId')
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
  @RequirePermission('claims.verify')
  @Audit({
    action: 'updateClaim',
    targetType: 'Claim',
    targetKey: (req) => req.params?.nrZgl,
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
    @Body(new ZodValidationPipe(UpdateClaimSchema)) dto: UpdateClaimDto,
    @Req() req: Request,
  ): Promise<ClaimDto> {
    const ip = clientIp(req);
    return this.claims.update(user, nrZgl, dto, ip);
  }

  // ── Verification checkpoint («Zapisz weryfikację») ──────

  /**
   * `PATCH /claims/:nrZgl/verification` — the pracownik's «Zapisz weryfikację»
   * checkpoint per docs/13-api-design.md#claims (`PATCH
   * /claims/:nrZgl/verification` row).
   *
   * The verifier persists their corrections to a `NA_WERYFIKACJI` claim BEFORE
   * making any decision. Stamps `verifiedAt`/`verifiedById`, which UNGATES the
   * decision transitions (`PATCH /claims/:nrZgl`) and the kwota-Maksima
   * authorization request FROM `NA_WERYFIKACJI` (both 422 `CLAIM_NOT_VERIFIED`
   * until verified). Body is the correction-fields-only `VerifyClaimSchema`; an
   * EMPTY body is legal ("confirmed as-is" — stamps `verifiedAt` without
   * recalc). Does NOT change status (verification is a flag, not a status). The
   * audit row commits in the same `prisma.$transaction` as the mutation via the
   * global `AuditInterceptor` (see `@Audit(...)` below); no email.
   */
  @Patch(':nrZgl/verification')
  @RequirePermission('claims.verify')
  @Audit({
    action: 'claim.verify',
    targetType: 'Claim',
    targetKey: (req) => req.params?.nrZgl,
  })
  async verify(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
    @Body(new ZodValidationPipe(VerifyClaimSchema)) dto: VerifyClaimDto,
  ): Promise<ClaimDto> {
    return this.claims.verifyClaim(user, nrZgl, dto);
  }

  // ── Limits refresh (escape hatch) ───────────────────────

  /**
   * `GET /claims/:nrZgl/recalc-limits/preview` — DRY RUN of the refresh below.
   *
   * The confirmation dialog (docs/14 §16.6) must show «было → станет» BEFORE
   * the write, and the write is not undoable (it overwrites the wniosek's
   * limits snapshot). No other endpoint can produce those numbers:
   * `POST /claims/:nrZgl/preview` is pinned to the frozen snapshot on purpose,
   * and `GET /limits` is admin-only.
   *
   * Pure read — computes with the SAME service code as the write, persists
   * nothing and writes NO audit row (hence no `@Audit()`; the inverse
   * audit-coverage spec only requires it on mutating verbs). Carries the SAME
   * status gate, so a frozen wniosek 422s before the dialog opens.
   *
   * Response: `RecalcLimitsPreviewDto` — `{ changed, current, next }`,
   * deliberately NOT a `ClaimDto` (nothing was written, so there is no claim
   * state to hand back). Gate: `claims.verify`, the same as the write.
   */
  @Get(':nrZgl/recalc-limits/preview')
  @RequirePermission('claims.verify')
  async recalcLimitsPreview(
    @Param('nrZgl') nrZgl: string,
  ): Promise<RecalcLimitsPreviewDto> {
    return this.claims.previewLimitsRefresh(nrZgl);
  }

  /**
   * `POST /claims/:nrZgl/recalc-limits` — re-price a wniosek with the CURRENT
   * `monthly_limits`, ignoring the limits snapshot frozen in its breakdown.
   *
   * Every other recalc path is pinned to the limits the wniosek was submitted
   * under, so a corrected limit never reaches filed wnioski by itself. This is
   * the deliberate, audited way in: it rewrites
   * `kmGuaranteed/kmDifference/paymentEur/ratePerKmEffective/breakdown/
   * drivenDays/kmPerDay`, touches neither period/mileage/status nor the
   * `orig*` snapshots, and sends NO email. 422
   * `CLAIM_LIMITS_REFRESH_BLOCKED` unless the wniosek sits in
   * `NA_WERYFIKACJI` (an authorised or decided amount is frozen).
   *
   * The response is the updated `ClaimDto` so the web can diff it against the
   * row it had open and show "było → jest" in the confirmation dialog.
   *
   * Gate: `claims.verify` (admin + pracownik) — the SAME requirement as every
   * other claim-mutating route. Per docs/03-roles.md «Верифицировать заявление
   * (изменить статус, пересчитать km/доплату)» belongs to `pracownik`;
   * `weryfikator` owns the km-board + outing statuses and holds no `claims.*`
   * permission at all, so it must not be able to reprice a wniosek (nor receive
   * a `ClaimDto` with the payout figures as the response).
   */
  @Post(':nrZgl/recalc-limits')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('claims.verify')
  @Audit({
    action: 'claim.limitsRefresh',
    targetType: 'Claim',
    targetKey: (req) => req.params?.nrZgl,
  })
  async recalcLimits(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
  ): Promise<ClaimDto> {
    return this.claims.refreshLimits(user, nrZgl);
  }

  // ── Reklamacja ──────────────────────────────────────────

  @Post(':nrZgl/reklamacja')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('claims.submit')
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

