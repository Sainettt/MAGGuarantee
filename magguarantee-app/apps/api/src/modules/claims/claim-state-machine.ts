// Phase 3 — Claim status state machine.
//
// Single source of truth for which `ClaimStatus → ClaimStatus` transitions
// are legal. Used by `ClaimsService.decide` (Phase 4 endpoint, currently
// stubbed) and the discriminated `UpdateClaimSchema` in
// `@magguarantee/shared/schemas/claims.ts`.
//
// References:
//   - docs/04-data-model.md (entity + status invariants)
//   - docs/01-overview.md (verification flow)
//   - Code.gs:5180-5345 (legacy verification dispatcher)
//
// Reklamacja transitions are sliced two ways:
//   - the carrier-facing path (`ZAAKCEPTOWANO → REKLAMACJA`,
//     `ODRZUCONO → REKLAMACJA`) lives behind `POST /claims/:nrZgl/reklamacja`
//     and is NOT part of the verifier's PATCH surface;
//   - the verifier-facing path (`REKLAMACJA → ZAAKCEPTOWANO`,
//     `REKLAMACJA → ODRZUCONO`) lives in PATCH and IS in the matrix below.
//
// "Frozen" terminal states do not appear as a `from`:
//   `AUTORYZACJA_KWOTA_MAKSIMA` is post-Maksim and only flows to ZAAKCEPTOWANO
//   via the same accept path (modeled here as `OCZEKUJE_NA_AUTORYZACJE → *`
//   covers it for the schema; service-level decide() narrows further).

import { UnprocessableEntityException } from '@nestjs/common';

import type { ClaimStatus } from '@magguarantee/shared';

/**
 * Tagged union of every legal transition. Useful as a `Type` reference in
 * tests or service code that wants to assert exhaustiveness.
 */
export type LegalTransition =
  | { from: 'NA_WERYFIKACJI'; to: 'OCZEKUJE_NA_AUTORYZACJE' }
  | { from: 'NA_WERYFIKACJI'; to: 'ZAAKCEPTOWANO' }
  | { from: 'NA_WERYFIKACJI'; to: 'ODRZUCONO' }
  | { from: 'OCZEKUJE_NA_AUTORYZACJE'; to: 'ZAAKCEPTOWANO' }
  | { from: 'OCZEKUJE_NA_AUTORYZACJE'; to: 'ODRZUCONO' }
  | { from: 'ZAAKCEPTOWANO'; to: 'REKLAMACJA' }
  | { from: 'ODRZUCONO'; to: 'REKLAMACJA' }
  | { from: 'REKLAMACJA'; to: 'ZAAKCEPTOWANO' }
  | { from: 'REKLAMACJA'; to: 'ODRZUCONO' };

/**
 * Compact lookup table — `from` → set of legal `to` values. Built from the
 * tagged union so the two stay in sync.
 */
const TRANSITION_TABLE: Readonly<Record<ClaimStatus, ReadonlySet<ClaimStatus>>> =
  {
    NA_WERYFIKACJI: new Set<ClaimStatus>([
      'OCZEKUJE_NA_AUTORYZACJE',
      'ZAAKCEPTOWANO',
      'ODRZUCONO',
    ]),
    OCZEKUJE_NA_AUTORYZACJE: new Set<ClaimStatus>([
      'ZAAKCEPTOWANO',
      'ODRZUCONO',
    ]),
    ZAAKCEPTOWANO: new Set<ClaimStatus>(['REKLAMACJA']),
    ODRZUCONO: new Set<ClaimStatus>(['REKLAMACJA']),
    REKLAMACJA: new Set<ClaimStatus>(['ZAAKCEPTOWANO', 'ODRZUCONO']),
    AUTORYZACJA_KWOTA_MAKSIMA: new Set<ClaimStatus>(),
  };

/** Pure predicate — true iff the (from, to) edge exists in the matrix. */
export function isLegalTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  if (from === to) return false;
  return TRANSITION_TABLE[from]?.has(to) ?? false;
}

/**
 * Throws `UnprocessableEntityException` (HTTP 422) with a Polish message
 * if the transition is illegal. Used by the verification service to fail
 * fast before doing any DB work.
 *
 * Distinct from a Postgres CHECK violation: this rejects the request at the
 * service layer with a friendly message instead of bouncing off a 5xx.
 */
export function assertLegalTransition(
  from: ClaimStatus,
  to: ClaimStatus,
): void {
  if (!isLegalTransition(from, to)) {
    throw new UnprocessableEntityException(
      `Niedozwolone przejście statusu wniosku: ${from} → ${to}`,
    );
  }
}

/** Helper for tests / introspection — returns the legal `to` set as an array. */
export function legalTargets(from: ClaimStatus): ClaimStatus[] {
  return [...(TRANSITION_TABLE[from] ?? [])];
}
