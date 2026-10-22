// Who wrote what on a wniosek (UWAGI #4, 2026-10-22). SHARED by the staff
// `ClaimModal` and the carrier claim-detail page so both sides agree on which
// free-text field belongs to whom and which label it carries.
//
// THE TWO AUTHORS. A wniosek carries two independent free-text fields:
//
//   comment         — the CARRIER's note, typed once at submit. Staff never
//                     write it. Caveat: wnioski accepted before 2026-10-22 may
//                     still hold the verifier's acceptance text here (not
//                     backfilled — the two cannot be told apart). No special
//                     handling: it is labelled as the carrier's note.
//   decisionComment — MAGTRANS's justification of the decision: optional on
//                     ZAAKCEPTOWANO, required on ODRZUCONO. `null` until
//                     decided. A reklamacja answer is NOT here (that is
//                     `reklamacjaResponse`, rendered by the reklamacja blocks).
//
// Labels are verdict-driven («Uzasadnienie decyzji» vs «Powód odrzucenia») and
// the verdict of a claim sitting in REKLAMACJA is the one it held before the
// complaint, so the label never depends on the transient dispute status.

import type { ClaimDto, ClaimStatus } from '@magguarantee/shared';

/** The two statuses a decision comment can belong to. */
export type DecisionVerdict = Extract<ClaimStatus, 'ZAAKCEPTOWANO' | 'ODRZUCONO'>;

/**
 * Message key of the decision-comment label per verdict. The SAME key names
 * exist in both namespaces that render the field:
 *   `employee.claims.modal.notes.*`  — staff wording («Uzasadnienie decyzji»)
 *   `carrier.claims.detail.*`        — carrier wording («Uzasadnienie MAGTRANS»)
 */
export const DECISION_NOTE_LABEL_KEY = {
  ZAAKCEPTOWANO: 'decisionCommentAccepted',
  ODRZUCONO: 'decisionCommentRejected',
} as const satisfies Record<DecisionVerdict, string>;

export type DecisionNoteLabelKey =
  (typeof DECISION_NOTE_LABEL_KEY)[DecisionVerdict];

export interface DecisionNote {
  verdict: DecisionVerdict;
  /** Verbatim text (render with `whitespace-pre-wrap`). */
  text: string;
  labelKey: DecisionNoteLabelKey;
}

/**
 * The verdict a wniosek currently carries, or `null` while it is undecided
 * (`NA_WERYFIKACJI` / `OCZEKUJE_NA_AUTORYZACJE`).
 *
 * In `REKLAMACJA` the verdict is `statusBeforeReklamacja`. A NULL column there
 * falls back on `amountApproved` — the same defensive fallback the shared
 * reklamacja helpers and the api use for such rows.
 */
export function decisionVerdict(
  claim: Pick<ClaimDto, 'status' | 'statusBeforeReklamacja' | 'amountApproved'>,
): DecisionVerdict | null {
  switch (claim.status) {
    case 'ZAAKCEPTOWANO':
    case 'ODRZUCONO':
      return claim.status;
    case 'REKLAMACJA': {
      const before = claim.statusBeforeReklamacja;
      if (before === 'ZAAKCEPTOWANO' || before === 'ODRZUCONO') return before;
      if (before != null) return null;
      return claim.amountApproved != null ? 'ZAAKCEPTOWANO' : 'ODRZUCONO';
    }
    default:
      return null;
  }
}

/** Whitespace-only text is treated as absent; anything else is kept verbatim. */
function nonBlank(text: string | null | undefined): string | null {
  return text != null && text.trim() !== '' ? text : null;
}

/** The carrier's own submit note, or `null` when it left none. */
export function carrierNote(claim: Pick<ClaimDto, 'comment'>): string | null {
  return nonBlank(claim.comment);
}

/**
 * MAGTRANS's decision justification with the verdict (and label key) it
 * belongs to. `null` when the wniosek is undecided or the decision carried no
 * text (an acceptance may legitimately have none).
 */
export function decisionNote(
  claim: Pick<
    ClaimDto,
    'status' | 'statusBeforeReklamacja' | 'amountApproved' | 'decisionComment'
  >,
): DecisionNote | null {
  const verdict = decisionVerdict(claim);
  const text = nonBlank(claim.decisionComment);
  if (verdict == null || text == null) return null;
  return { verdict, text, labelKey: DECISION_NOTE_LABEL_KEY[verdict] };
}
