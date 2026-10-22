/**
 * Copy, one block and the plain-text fallback (`buildDecisionText`, used by
 * `MailService`) shared by the WNIOSEK decision mails `carrier-decision` and
 * `internal-decision`.
 *
 * UWAGI #4 (2026-10-22): the verifier's decision text (`Claim.decisionComment`)
 * and the carrier's submit note (`Claim.comment`) are two different voices, so
 * they are never shown under one generic «Komentarz» heading:
 *  - MAGTRANS's text → «Uzasadnienie decyzji» (ZAAKCEPTOWANO) /
 *    «Powód odrzucenia» (ODRZUCONO);
 *  - the carrier's note → «Komentarz przewoźnika», INTERNAL mail only (the
 *    carrier is not shown their own note back).
 *
 * Reklamacja decisions have their own template (`reklamacja-carrier-decision`)
 * and copy; nothing here applies to them. Design: docs/22-email-design.md §7.
 */
import * as React from 'react';

import { eyebrowStyle, paragraphStyle } from './_theme';
import { Block } from './MailLayout';

/** The two terminal wniosek decisions a decision mail announces. */
export type WniosekDecisionLabel = 'ZAAKCEPTOWANO' | 'ODRZUCONO';

/** Heading over MAGTRANS's text (`Claim.decisionComment`), per decision. */
export const DECISION_COMMENT_HEADING: Record<WniosekDecisionLabel, string> = {
  ZAAKCEPTOWANO: 'Uzasadnienie decyzji',
  ODRZUCONO: 'Powód odrzucenia',
};

/** Heading over the carrier's submit note (`Claim.comment`), internal mail only. */
export const CARRIER_COMMENT_HEADING = 'Komentarz przewoźnika';

/** Eyebrow heading + pre-line paragraph — the shared look of a free-text block. */
export function LabelledTextBlock({
  heading,
  text,
}: {
  heading: string;
  text: string;
}): React.ReactElement {
  return (
    <Block>
      <p style={{ ...eyebrowStyle, margin: '18px 0 8px 0' }}>{heading}</p>
      <p style={{ ...paragraphStyle, whiteSpace: 'pre-line' }}>{text}</p>
    </Block>
  );
}

/** Input of the plain-text fallback; `carrierName` / `carrierComment` = internal only. */
export interface DecisionTextInput {
  nrZgl: string;
  decisionLabel: WniosekDecisionLabel;
  carrierName?: string;
  vehiclePlate: string;
  periodFrom: string;
  periodTo: string;
  amount?: string;
  /** MAGTRANS's justification (`Claim.decisionComment`). */
  decisionComment?: string;
  /** The carrier's submit note (`Claim.comment`) — pass it for the INTERNAL mail only. */
  carrierComment?: string;
  deeplink: string;
}

/**
 * Plain-text fallback shared by `carrier-decision` and `internal-decision`.
 * Same headings as the html blocks, so both parts of the mail agree on whose
 * text is whose.
 */
export function buildDecisionText(p: DecisionTextInput): string {
  const lines = [
    `Wniosek ${p.nrZgl}: ${p.decisionLabel}`,
    '',
    ...(p.carrierName ? [`Przewoźnik: ${p.carrierName}`] : []),
    `Ciągnik: ${p.vehiclePlate}`,
    `Okres: ${p.periodFrom} → ${p.periodTo}`,
    // `!= null`: a pre-formatted `'0.00'` is a real amount, not "absent".
    ...(p.amount != null ? [`Kwota: ${p.amount} EUR`] : []),
  ];
  if (p.decisionComment) {
    lines.push('', `${DECISION_COMMENT_HEADING[p.decisionLabel]}: ${p.decisionComment}`);
  }
  if (p.carrierComment) {
    lines.push('', `${CARRIER_COMMENT_HEADING}: ${p.carrierComment}`);
  }
  lines.push('', `Otwórz: ${p.deeplink}`);
  return lines.join('\n');
}
