/**
 * Verification outcome email to the CARRIER. GAS analog: `buildCarrierEmail`.
 * The status badge is driven by the decision (accepted → green, rejected → red)
 * per the legacy `CONFIG.KOLORY` colour mapping — now expressed as a status
 * pill instead of a tinted header (docs/22-email-design.md §5).
 *
 * Free text (UWAGI #4, 2026-10-22): only MAGTRANS's justification
 * (`Claim.decisionComment`) is shown, headed «Uzasadnienie decyzji» /
 * «Powód odrzucenia». The carrier's own submit note is deliberately NOT echoed
 * back here (the internal mail shows it, see `internal-decision.tsx`).
 */
import * as React from 'react';

import { criticalColor, type Tone } from './_theme';
import {
  DECISION_COMMENT_HEADING,
  LabelledTextBlock,
  type WniosekDecisionLabel,
} from './_decision-copy';
import { AmountPanel, DataSection, FieldRow, MailLayout } from './MailLayout';

export interface CarrierDecisionProps {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** The decision, also the badge label (`ZAAKCEPTOWANO` / `ODRZUCONO`). */
  decisionLabel: WniosekDecisionLabel;
  /** Status accent for the decision (success = accepted, danger = rejected). */
  tone: Tone;
  vehiclePlate: string;
  periodFrom: string;
  periodTo: string;
  /** Approved payout in EUR, pre-formatted (two decimals). Omitted if N/A. */
  amount?: string;
  /**
   * MAGTRANS's justification (`Claim.decisionComment`): optional on
   * ZAAKCEPTOWANO, always present on ODRZUCONO. Never the carrier's note.
   */
  decisionComment?: string;
  /** Carrier-facing claim detail URL (already includes APP_URL). */
  deeplink: string;
}

export function CarrierDecisionEmail({
  nrZgl,
  decisionLabel,
  tone,
  vehiclePlate,
  periodFrom,
  periodTo,
  amount,
  decisionComment,
  deeplink,
}: CarrierDecisionProps): React.ReactElement {
  return (
    <MailLayout
      preview={`${nrZgl} — ${decisionLabel}`}
      overline="Decyzja w sprawie wniosku"
      title={nrZgl}
      badge={{ tone, label: decisionLabel }}
      cta={{ href: deeplink, label: 'Otwórz wniosek' }}
    >
      <DataSection heading="Wniosek">
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
    </MailLayout>
  );
}

export default CarrierDecisionEmail;
