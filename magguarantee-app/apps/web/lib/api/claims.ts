// Typed API wrappers for /api/v1/claims/*.
//
// Phase 3 — carrier UI. Server enforces ownership/role checks; the client
// just passes the carrier-supplied body and trusts the response.
// Phase 4 — sub-slice 4.1 adds `updateClaim` (PATCH) for admin/pracownik
// verification.

import type {
  ClaimDto,
  ClaimFilters,
  ClaimListItem,
  PreviewClaimDto,
  PreviewClaimResponse,
  RecalcLimitsPreviewDto,
  SubmitClaimDto,
  SubmitReklamacjaDto,
  UpdateClaimDto,
  VerifyClaimDto,
} from '@magguarantee/shared';

import { apiBlob, apiForm, apiJson } from './client';
import { type Paginated, toQuery } from './query';

export function listClaims(
  filters: ClaimFilters = { limit: 50 },
): Promise<Paginated<ClaimListItem>> {
  return apiJson<Paginated<ClaimListItem>>(
    `/claims${toQuery(filters)}`,
    { method: 'GET' },
  );
}

export function getClaim(nrZgl: string): Promise<ClaimDto> {
  return apiJson<ClaimDto>(`/claims/${encodeURIComponent(nrZgl)}`, {
    method: 'GET',
  });
}

export function submitClaim(
  body: SubmitClaimDto,
  idempotencyKey?: string,
): Promise<ClaimDto> {
  return apiJson<ClaimDto>('/claims', {
    method: 'POST',
    json: body,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

/**
 * Live-preview the km-calc against a draft new-claim form. Server is the
 * single source of truth — the panel renders exactly what comes back.
 *
 * Note: docs/13 lists both `POST /claims/preview` (no nrZgl) and
 * `POST /claims/:nrZgl/preview` (replay against a saved claim). The
 * new-claim form uses the former.
 */
export function previewNewClaim(
  body: PreviewClaimDto,
): Promise<PreviewClaimResponse> {
  return apiJson<PreviewClaimResponse>('/claims/preview', {
    method: 'POST',
    json: body,
  });
}

export function submitReklamacja(
  nrZgl: string,
  body: SubmitReklamacjaDto,
): Promise<ClaimDto> {
  return apiJson<ClaimDto>(
    `/claims/${encodeURIComponent(nrZgl)}/reklamacja`,
    { method: 'POST', json: body },
  );
}

/**
 * Live-preview the km-calc against an existing claim — used by the
 * employee verification modal's recalc badge so the verifier sees how
 * amending mileage / hoursAdjusted would change the doplata before they
 * decide.
 *
 * Per `docs/13-api-design.md:196` the endpoint should be open to any
 * logged-in user. The current backend `@Roles('przewoznik')` is a known
 * gap — see report `## Blockers`.
 */
export function previewExistingClaim(
  nrZgl: string,
  body: PreviewClaimDto,
): Promise<PreviewClaimResponse> {
  return apiJson<PreviewClaimResponse>(
    `/claims/${encodeURIComponent(nrZgl)}/preview`,
    { method: 'POST', json: body },
  );
}

/**
 * `PATCH /claims/:nrZgl` — verifier's decision endpoint (Phase 4, sub-slice
 * 4.1). Body is the discriminated `UpdateClaimSchema` shape; the server
 * translates synthetic `REKLAMACJA_*` literals back into the underlying
 * `ClaimStatus`. Only `admin` and `pracownik` may call this.
 */
export function updateClaim(
  nrZgl: string,
  body: UpdateClaimDto,
): Promise<ClaimDto> {
  return apiJson<ClaimDto>(`/claims/${encodeURIComponent(nrZgl)}`, {
    method: 'PATCH',
    json: body,
  });
}

/**
 * `PATCH /claims/:nrZgl/verification` — verifier's checkpoint (verifier-
 * checkpoint feature). Admin / pracownik confirms a claim in status
 * `NA_WERYFIKACJI` — WITH optional corrections
 * (`dateStart`/`dateEnd`/`timeFrom`/`timeTo`/`mileage`/`hoursAdjusted`, all
 * optional; an EMPTY body means "confirm as-is"). Stamps
 * `verifiedAt`/`verifiedById` and re-runs km-calc only when the math-relevant
 * fields are touched. Repeatable — re-calling overwrites the previous stamp +
 * corrections. Decision PATCHes FROM `NA_WERYFIKACJI` are gated (422
 * `CLAIM_NOT_VERIFIED`) until this checkpoint runs. Saving the verification
 * with the dopłata over Maksim's threshold is what auto-routes the claim into
 * `OCZEKUJE_NA_AUTORYZACJE` (server-side) — there is no manual authorization
 * request. Returns the updated `ClaimDto` so the open modal reflects
 * `verifiedAt`/`verifiedBy` without a manual refetch. 422 (Polish message) if
 * the claim is no longer in `NA_WERYFIKACJI`.
 */
export function verifyClaim(
  nrZgl: string,
  body: VerifyClaimDto,
): Promise<ClaimDto> {
  return apiJson<ClaimDto>(
    `/claims/${encodeURIComponent(nrZgl)}/verification`,
    { method: 'PATCH', json: body },
  );
}

/**
 * `POST /claims/:nrZgl/authorization-confirmation` — Maksim authorization gate.
 *
 * Uploads the screenshot of Maksim's out-of-band confirmation as a
 * `multipart/form-data` request (the file rides as the `file` part — the API
 * field name MUST match exactly). Roles admin / pracownik. The upload is
 * persisted as a `ClaimAttachment` with `category = AUTORYZACJA_MAKSIMA` and
 * CLEARS the over-threshold decision gate: the returned fresh `ClaimDto`
 * carries `maksimGateClearedAt != null`, which re-enables the Akceptuj / Odrzuć
 * controls. The web reads that flipped field — it never guesses the cleared
 * state locally.
 */
export function uploadAuthorizationConfirmation(
  nrZgl: string,
  file: File,
): Promise<ClaimDto> {
  const fd = new FormData();
  fd.append('file', file);
  return apiForm<ClaimDto>(
    `/claims/${encodeURIComponent(nrZgl)}/authorization-confirmation`,
    fd,
    { method: 'POST' },
  );
}

/**
 * `GET /claims/:nrZgl/recalc-limits/preview` — DRY RUN of the limits refresh.
 *
 * Computes the five figures a refresh would move with the same code path as
 * the write — plus the weeks of the period whose limits changed
 * (`changedWeeks`: limits and `kmInWeek` «było / będzie») and how many did not
 * (`unchangedWeekCount`) — persists nothing and writes no audit row. Same roles
 * (`admin` / `pracownik`) and the SAME status gate as the write, so a 422
 * `CLAIM_LIMITS_REFRESH_BLOCKED` (with the server's Polish explanation)
 * arrives BEFORE anything is committed. This is what lets the confirmation
 * dialog show «było → станет» ahead of the POST — `POST /claims/:nrZgl/preview`
 * cannot: it is pinned to the wniosek's own frozen limits snapshot.
 */
export function previewRecalcClaimLimits(
  nrZgl: string,
): Promise<RecalcLimitsPreviewDto> {
  return apiJson<RecalcLimitsPreviewDto>(
    `/claims/${encodeURIComponent(nrZgl)}/recalc-limits/preview`,
    { method: 'GET' },
  );
}

/**
 * `POST /claims/:nrZgl/recalc-limits` — re-price a wniosek with the CURRENT
 * `weekly_limits` instead of the snapshot frozen into it at submission
 * (docs/14 §16.6). No body. Roles `admin` / `pracownik`.
 *
 * Rewrites kmGuaranteed / kmDifference / paymentEur / ratePerKmEffective /
 * breakdown and resets the verification checkpoint when the money moved;
 * touches neither the period, the mileage, nor the status, and sends no
 * email. 422 `CLAIM_LIMITS_REFRESH_BLOCKED` (with a ready Polish message that
 * differs for `OCZEKUJE_NA_AUTORYZACJE` vs a decided wniosek) unless the
 * wniosek sits in `NA_WERYFIKACJI` — render the server's message, never a
 * locally invented one.
 *
 * Returns the updated `ClaimDto`, which is what lets the dialog show
 * «było → jest» against the row it had open.
 */
export function recalcClaimLimits(nrZgl: string): Promise<ClaimDto> {
  return apiJson<ClaimDto>(
    `/claims/${encodeURIComponent(nrZgl)}/recalc-limits`,
    { method: 'POST' },
  );
}

/**
 * `GET /claims/:nrZgl/authorization-confirmation/:attachmentId/download` —
 * streams the uploaded confirmation screenshot. The endpoint is authenticated
 * (NOT a public URL), so we fetch it through the auth/refresh-aware client and
 * hand back a `Blob` the caller opens via an object-URL — same recipe as the
 * carrier / vehicle attachment downloads.
 */
export function downloadAuthorizationConfirmation(
  nrZgl: string,
  attachmentId: string,
): Promise<Blob> {
  return apiBlob(
    `/claims/${encodeURIComponent(nrZgl)}/authorization-confirmation/${attachmentId}/download`,
    { method: 'GET' },
  );
}
