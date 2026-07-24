// ── The ONE permission derivation for the wniosek modal ─────────────────────
//
// docs/14-design-system.md §6.5.12–§6.5.14 · docs/03-roles.md (admin ⊃ pracownik)
//
// WHY THIS FILE EXISTS
// --------------------
// Editability used to be keyed on `mode === 'edit'` alone, while the action
// gates (`needsVerification`, `verifyGated`, `decisionGated`, `submitDisabled`)
// were each spelled out inline against `claim.status`. The two drifted: a
// pracownik at `OCZEKUJE_NA_AUTORYZACJE` got editable fact inputs AND a
// «Zapisz weryfikację» button that the API answers with
// 422 `CLAIM_VERIFY_ADMIN_ONLY`.
//
// So: (status, role, mode) → ONE `ClaimPermissions` object, and EVERY section
// (fact pairs, verify button, decision panel, submit payload) reads from it.
// Adding a rule means editing this function, not five call sites. In particular
// `payloadIncludesCorrections` is derived from the SAME `factsEditable` flag
// that renders the inputs, so the modal can never PATCH a field the user was
// not allowed to touch.
//
// NOTE (этап 5.1, docs/14 §6.5.14 REMOVED): the «kwota Maksima» manual flow is
// gone. `amountApproved` is ALWAYS the server-computed locked/computed field
// (§6.5.4 / §(b)); there is no admin-override / pracownik-lock split any more,
// so this object no longer derives an amount-approved render mode or a
// Maksim-decision flag.
//
// Mirrors, on purpose:
//   - `_assertMayVerifyInStatus` (claims.service.ts) → `canVerifyInStatus`
//   - the `CLAIM_NOT_VERIFIED` decision gate      → `requiresVerifiedCheckpoint`
// Server-side enforcement is authoritative; this is the UI's honest mirror.

import type { ClaimStatus, Role } from '@magguarantee/shared';

export type ClaimModalMode = 'view' | 'edit';

export interface ClaimPermissionsInput {
  status: ClaimStatus;
  /** Current user's role. `undefined` while `GET /auth/me` is in flight. */
  role: Role | undefined;
  mode: ClaimModalMode;
}

export interface ClaimPermissions {
  /** The 6 verification facts render as inputs (else: static `view` form). */
  factsEditable: boolean;
  /**
   * Which block-level lock notice belongs above the fact block (§6.5.13 case 2).
   * `null` → no notice at all.
   */
  factsNotice: 'locked' | 'adminInfo' | null;
  /**
   * «Zapisz weryfikację» is rendered. §6.5.13 hard rule: an action that is
   * impossible for this role in this state is REMOVED, not disabled.
   */
  showVerifyButton: boolean;
  /**
   * The server's `CLAIM_NOT_VERIFIED` gate applies — a decision requires a
   * saved checkpoint first. Distinct from `showVerifyButton`: at
   * `OCZEKUJE_NA_AUTORYZACJE` an admin may re-save the checkpoint but the
   * decision is not gated on it (the claim was already verified upstream).
   */
  requiresVerifiedCheckpoint: boolean;
  /**
   * The PATCH may carry the 6 correction fields. Tied to `factsEditable` so a
   * read-only fact block can never be submitted as an edit.
   */
  payloadIncludesCorrections: boolean;
}

export function deriveClaimPermissions({
  status,
  role,
  mode,
}: ClaimPermissionsInput): ClaimPermissions {
  const isAdmin = role === 'admin';
  const isEdit = mode === 'edit';
  const pendingAuthorization = status === 'OCZEKUJE_NA_AUTORYZACJE';

  // Status window in which a verification checkpoint may be saved at all —
  // mirror of `VERIFIABLE_CLAIM_STATUSES` + `_assertMayVerifyInStatus`.
  const canVerifyInStatus =
    status === 'NA_WERYFIKACJI' || (pendingAuthorization && isAdmin);

  // Facts follow the verify right: if you cannot save the checkpoint in this
  // status you have no business typing into the fields it would persist.
  const factsEditable = isEdit && canVerifyInStatus;

  const factsNotice: ClaimPermissions['factsNotice'] = !pendingAuthorization
    ? null
    : isAdmin
      ? 'adminInfo'
      : 'locked';

  return {
    factsEditable,
    factsNotice,
    showVerifyButton: isEdit && canVerifyInStatus,
    requiresVerifiedCheckpoint: status === 'NA_WERYFIKACJI',
    payloadIncludesCorrections: factsEditable,
  };
}
