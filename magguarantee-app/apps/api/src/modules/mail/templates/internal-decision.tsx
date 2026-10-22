/**
 * Verification outcome email to INTERNAL staff (planiści, opiekun, lider,
 * wnioski@). GAS analog: `sendInternalDecisionEmail`. Same data as the carrier
 * email plus the carrier name, since internal recipients handle many carriers.
 *
 * Free text (UWAGI #4, 2026-10-22) — two separately labelled blocks, each
 * rendered only when non-empty:
 *  - MAGTRANS's justification (`Claim.decisionComment`) → «Uzasadnienie
 *    decyzji» (ZAAKCEPTOWANO) / «Powód odrzucenia» (ODRZUCONO);
 *  - the carrier's submit note (`Claim.comment`) → «Komentarz przewoźnika».
 */
import * as React from 'react';

import { criticalColor, type Tone } from './_theme';
import {
  CARRIER_COMMENT_HEADING,
  DECISION_COMMENT_HEADING,
  LabelledTextBlock,
  type WniosekDecisionLabel,
} from './_decision-copy';
import { AmountPanel, DataSection, FieldRow, MailLayout } from './MailLayout';

export interface InternalDecisionProps {
  nrZgl: string;
  /** The decision, also the badge label (`ZAAKCEPTOWANO` / `ODRZUCONO`). */
  decisionLabel: WniosekDecisionLabel;
  tone: Tone;
  carrierName: string;
  vehiclePlate: string;
  periodFrom: string;
  periodTo: string;
  amount?: string;
  /** MAGTRANS's justification (`Claim.decisionComment`). */
  decisionComment?: string;
  /** The carrier's note written at submit (`Claim.comment`). */
  carrierComment?: string;
  /** Employee-side claim deeplink (`/employee/claims?nrZgl=…`, includes APP_URL). */
  deeplink: string;
}

export function InternalDecisionEmail({
  nrZgl,
  decisionLabel,
  tone,
  carrierName,
  vehiclePlate,
  periodFrom,
  periodTo,
  amount,
  decisionComment,
  carrierComment,
  deeplink,
}: InternalDecisionProps): React.ReactElement {
  return (
    <MailLayout
      preview={`${nrZgl} — ${decisionLabel} (${carrierName})`}
      overline="Decyzja w sprawie wniosku"
      title={nrZgl}
      badge={{ tone, label: decisionLabel }}
      cta={{ href: deeplink, label: 'Otwórz w MAGGuarantee' }}
    >
      <DataSection heading="Wniosek">
        <FieldRow label="Przewoźnik" value={carrierName} />
        <FieldRow label="Ciągnik" value={vehiclePlate} />
        <FieldRow label="Okres" value={`${periodFrom} – ${periodTo}`} />
      </DataSection>

      {/* `!= null`: a real `0.00 EUR` decision must still print. */}
      {amount != null ? (
        <AmountPanel label="Kwota" value={`${amount} EUR`} valueColor={criticalColor(tone)} />
      ) : null}

      {decisionComment ? (
        <LabelledTextBlock
          heading={DECISION_COMMENT_HEADING[decisionLabel]}
          text={decisionComment}
        />
      ) : null}

      {carrierComment ? (
        <LabelledTextBlock heading={CARRIER_COMMENT_HEADING} text={carrierComment} />
      ) : null}
    </MailLayout>
  );
}

export default InternalDecisionEmail;
