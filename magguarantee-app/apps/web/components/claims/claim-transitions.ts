// Client-side mirror of `apps/api/src/modules/claims/claim-state-machine.ts`
// transformed for the UI's discriminated `UpdateClaimSchema` form: when
// transitioning out of `REKLAMACJA` the wire literals are the synthetic
// `REKLAMACJA_ZAAKCEPTOWANO` / `REKLAMACJA_ODRZUCONO` (the service translates
// them back to ZAAKCEPTOWANO/ODRZUCONO and mirrors `statusBeforeReklamacja`).
//
// Keeping this duplicated rather than importing from `@magguarantee/shared`
// because the wire enum and the form-target enum diverge intentionally —
// the form needs the synthetic literals to drive Zod variant selection.

import type { ClaimStatus } from '@magguarantee/shared';

/** The 4 literals the form's discriminator can hold (matches Zod union). */
export type ClaimDecisionTarget =
  | 'ZAAKCEPTOWANO'
  | 'ODRZUCONO'
  | 'REKLAMACJA_ZAAKCEPTOWANO'
  | 'REKLAMACJA_ODRZUCONO';

/**
 * Given the *current* claim status, return the decision-target literals
 * a verifier may pick in the modal. Mirror of `claim-state-machine.ts`
 * but with the synthetic REKLAMACJA_* literals substituted in.
 *
 * Terminal states (`ZAAKCEPTOWANO` / `ODRZUCONO`) return `[]` — the UI hides
 * the decision row entirely.
 */
export function decisionTargetsFor(
  currentStatus: ClaimStatus,
): ClaimDecisionTarget[] {
  switch (currentStatus) {
    case 'NA_WERYFIKACJI':
      return ['ZAAKCEPTOWANO', 'ODRZUCONO'];
    case 'OCZEKUJE_NA_AUTORYZACJE':
      // Claims reach this status ONLY automatically: the backend routes a
      // wniosek here when the dopłata exceeds Maksim's threshold at the moment
      // the verification is saved, and rolls it back to NA_WERYFIKACJI if a
      // later edit drops the dopłata under the threshold. There is NO manual
      // path into this status — the verifier just picks the accept/reject
      // decision once Maksim's confirmation screenshot is uploaded.
      return ['ZAAKCEPTOWANO', 'ODRZUCONO'];
    case 'REKLAMACJA':
      return ['REKLAMACJA_ZAAKCEPTOWANO', 'REKLAMACJA_ODRZUCONO'];
    case 'ZAAKCEPTOWANO':
    case 'ODRZUCONO':
    default:
      return [];
  }
}
