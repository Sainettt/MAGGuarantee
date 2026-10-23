// Phase 7 REWORK (2026-06-20 #4, docs/20 §0″) — Delegation status state machine.
//
// Single source of truth for which `DelegationStatus → DelegationStatus`
// transitions are legal. Modelled on `claims/claim-state-machine.ts`.
//
// Lifecycle (strict chain order — admin is allowed onto the endpoints by their
// `@RequirePermission` but does NOT bypass the matrix; the gate applies to
// every caller):
//
//   carrier      eksport|admin       weryfikator|admin   weryfikator|admin
//   zgloszony ──▶ gotowy ──────────▶ w_trasie ──────────▶ zjechal
//                   ▲ │
//                   └─┘  rollback `gotowy → zgloszony` is allowed ONLY while
//                        the outing has not yet left (`w_trasie`).
//
//   * → anulowany  from any ACTIVE status (`zgloszony | gotowy | w_trasie`).
//     carrier cancels only their own `zgloszony` (service-level ownership gate);
//     admin cancels any active outing.
//
// `zjechal` and `anulowany` are terminal — no outbound edges.
//
// References:
//   - docs/20-phase-7-eksport-weryfikator.md §0″ (lifecycle table + decisions)
//   - docs/04-data-model.md (status invariants)

import { UnprocessableEntityException } from '@nestjs/common';

import type { DelegationStatus } from '@magguarantee/shared';

/**
 * Tagged union of every legal transition. Kept in sync with `TRANSITION_TABLE`
 * below; useful as a `Type`-level reference in tests.
 */
export type LegalDelegationTransition =
  | { from: 'zgloszony'; to: 'gotowy' }
  | { from: 'zgloszony'; to: 'anulowany' }
  | { from: 'gotowy'; to: 'w_trasie' }
  | { from: 'gotowy'; to: 'zgloszony' } // rollback (eksport/admin), pre-w_trasie
  | { from: 'gotowy'; to: 'anulowany' }
  | { from: 'w_trasie'; to: 'zjechal' }
  | { from: 'w_trasie'; to: 'anulowany' };

/**
 * Compact lookup table — `from` → set of legal `to` values. Terminal statuses
 * (`zjechal`, `anulowany`) map to empty sets.
 */
const TRANSITION_TABLE: Readonly<
  Record<DelegationStatus, ReadonlySet<DelegationStatus>>
> = {
  zgloszony: new Set<DelegationStatus>(['gotowy', 'anulowany']),
  gotowy: new Set<DelegationStatus>(['w_trasie', 'zgloszony', 'anulowany']),
  w_trasie: new Set<DelegationStatus>(['zjechal', 'anulowany']),
  zjechal: new Set<DelegationStatus>(),
  anulowany: new Set<DelegationStatus>(),
};

/**
 * The statuses an outing can still be cancelled from. Mirrors the ACTIVE board
 * floor used elsewhere in the delegations module.
 */
export const CANCELLABLE_DELEGATION_STATUSES: readonly DelegationStatus[] = [
  'zgloszony',
  'gotowy',
  'w_trasie',
];

/** Pure predicate — true iff the (from, to) edge exists in the matrix. */
export function isLegalDelegationTransition(
  from: DelegationStatus,
  to: DelegationStatus,
): boolean {
  if (from === to) return false;
  return TRANSITION_TABLE[from]?.has(to) ?? false;
}

/**
 * Throws `UnprocessableEntityException` (HTTP 422) with a Polish message if the
 * transition is illegal. Used by `DelegationsService` to fail fast before any
 * DB work, exactly like `assertLegalTransition` for claims.
 */
export function assertLegalDelegationTransition(
  from: DelegationStatus,
  to: DelegationStatus,
): void {
  if (!isLegalDelegationTransition(from, to)) {
    throw new UnprocessableEntityException(
      `Niedozwolone przejście statusu wyjazdu: ${from} → ${to}`,
    );
  }
}

/** Helper for tests / introspection — returns the legal `to` set as an array. */
export function legalDelegationTargets(
  from: DelegationStatus,
): DelegationStatus[] {
  return [...(TRANSITION_TABLE[from] ?? [])];
}
