/**
 * Verification outcome email to the CARRIER. GAS analog: `buildCarrierEmail`.
 * The status badge is driven by the decision (accepted → green, rejected → red)
 * per the legacy `CONFIG.KOLORY` colour mapping — now expressed as a status
 * pill instead of a tinted header (docs/22-email-design.md §5).
 */
import * as React from 'react';

import { criticalColor, eyebrowStyle, paragraphStyle, type Tone } from './_theme';
import {
  AmountPanel,
  Block,
  DataSection,
  FieldRow,
  MailLayout,
} from './MailLayout';

export interface CarrierDecisionProps {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** Human label of the decision, e.g. `ZAAKCEPTOWANO`. */
  decisionLabel: string;
  /** Status accent for the decision (success = accepted, danger = rejected). */
  tone: Tone;
  vehiclePlate: string;
  periodFrom: string;
  periodTo: string;
  /** Approved payout in EUR, pre-formatted (two decimals). Omitted if N/A. */
  amount?: string;
  comment?: string;
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
  comment,
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

      {amount ? (
        <AmountPanel label="Kwota" value={`${amount} EUR`} valueColor={criticalColor(tone)} />
      ) : null}

      {comment ? (
        <Block>
          <p style={{ ...eyebrowStyle, margin: '18px 0 8px 0' }}>Komentarz</p>
          <p style={{ ...paragraphStyle, whiteSpace: 'pre-line' }}>{comment}</p>
        </Block>
      ) : null}
    </MailLayout>
  );
}

export default CarrierDecisionEmail;
