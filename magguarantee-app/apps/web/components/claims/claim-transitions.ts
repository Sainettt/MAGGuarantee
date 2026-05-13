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

/** The 5 literals the form's discriminator can hold (matches Zod union). */
export type ClaimDecisionTarget =
  | 'ZAAKCEPTOWANO'
  | 'ODRZUCONO'
  | 'OCZEKUJE_NA_AUTORYZACJE'
  | 'REKLAMACJA_ZAAKCEPTOWANO'
  | 'REKLAMACJA_ODRZUCONO';

/**
 * Given the *current* claim status, return the decision-target literals
 * a verifier may pick in the modal. Mirror of `claim-state-machine.ts`
 * but with the synthetic REKLAMACJA_* literals substituted in.
 *
 * Terminal frozen states (`AUTORYZACJA_KWOTA_MAKSIMA`) return `[]` —
 * the UI hides the decision row entirely.
 */
export function decisionTargetsFor(
  currentStatus: ClaimStatus,
): ClaimDecisionTarget[] {
  switch (currentStatus) {
    case 'NA_WERYFIKACJI':
      return ['ZAAKCEPTOWANO', 'ODRZUCONO', 'OCZEKUJE_NA_AUTORYZACJE'];
    case 'OCZEKUJE_NA_AUTORYZACJE':
      return ['ZAAKCEPTOWANO', 'ODRZUCONO'];
    case 'REKLAMACJA':
      return ['REKLAMACJA_ZAAKCEPTOWANO', 'REKLAMACJA_ODRZUCONO'];
    case 'ZAAKCEPTOWANO':
    case 'ODRZUCONO':
    case 'AUTORYZACJA_KWOTA_MAKSIMA':
    default:
      return [];
  }
}
