// Phase 7 — Delegation status state machine.
//
// Single source of truth for which `DelegationStatus → DelegationStatus`
// transitions the weryfikator may drive. Mirrors `claim-state-machine.ts`
// (same shape: tagged union + lookup table + assert/predicate helpers), with
// two deliberate differences:
//
//   1. The legal set is tiny — the verifier does EXACTLY TWO transitions:
//        `zgloszony → w_trasie`   (in-transit)
//        `w_trasie  → zjechal`    (returned)
//      There is NO `anulowany` edge here: cancellation is a carrier-only path
//      (`przewoznik` cancels their own `zgloszony`) handled directly in
//      `DelegationsService.cancel`, NOT through this machine. The verifier has
//      no cancel authority (owner decision 2026-06-10,
//      docs/20-phase-7-eksport-weryfikator.md §4.5).
//
//   2. An illegal source status throws `ConflictException` (HTTP 409), not the
//      422 the claim machine uses. A delegation transition fails because the
//      row is in the wrong STATE for the requested action (a state conflict),
//      which the slice contract maps to 409.
//
// References:
//   - docs/04-data-model.md (Delegation status invariants)
//   - docs/20-phase-7-eksport-weryfikator.md §1, §3, §4
//   - Code.gs:4071 (markDelegacjaInTransit), Code.gs:4100 (markDelegacjaReturned)

import { ConflictException } from '@nestjs/common';

import type { DelegationStatus } from '@magguarantee/shared';

/**
 * Tagged union of every legal verifier-driven transition. Kept as a type so
 * tests / service code can assert exhaustiveness against the lookup table.
 */
export type LegalDelegationTransition =
  | { from: 'zgloszony'; to: 'w_trasie' }
  | { from: 'w_trasie'; to: 'zjechal' };

/**
 * Compact lookup — `from` → set of legal `to` values. Terminal/owner-only
 * states (`zjechal`, `anulowany`) carry an empty set: nothing the verifier can
 * do moves them forward. `anulowany` is reachable only via the carrier cancel
 * path, which does not consult this table.
 */
const TRANSITION_TABLE: Readonly<
  Record<DelegationStatus, ReadonlySet<DelegationStatus>>
> = {
  zgloszony: new Set<DelegationStatus>(['w_trasie']),
  w_trasie: new Set<DelegationStatus>(['zjechal']),
  zjechal: new Set<DelegationStatus>(),
  anulowany: new Set<DelegationStatus>(),
};

/** Pure predicate — true iff the (from, to) edge exists in the matrix. */
export function isLegalDelegationTransition(
  from: DelegationStatus,
  to: DelegationStatus,
): boolean {
  if (from === to) return false;
  return TRANSITION_TABLE[from]?.has(to) ?? false;
}

/**
 * Throws `ConflictException` (HTTP 409) with a Polish message when the
 * transition is illegal. Used by the verifier transitions to fail fast before
 * any DB work — e.g. trying to mark an already-`zjechal` outing "w trasie".
 */
export function assertLegalDelegationTransition(
  from: DelegationStatus,
  to: DelegationStatus,
): void {
  if (!isLegalDelegationTransition(from, to)) {
    throw new ConflictException(
      `Niedozwolone przejście statusu wyjazdu: ${from} → ${to}`,
    );
  }
}

/** Helper for tests / introspection — legal `to` set as an array. */
export function legalDelegationTargets(
  from: DelegationStatus,
): DelegationStatus[] {
  return [...(TRANSITION_TABLE[from] ?? [])];
}
