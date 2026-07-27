/**
 * Verification outcome email to INTERNAL staff (planiści, opiekun, lider,
 * wnioski@). GAS analog: `sendInternalDecisionEmail`. Same data as the carrier
 * email plus the carrier name, since internal recipients handle many carriers.
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

export interface InternalDecisionProps {
  nrZgl: string;
  decisionLabel: string;
  tone: Tone;
  carrierName: string;
  vehiclePlate: string;
  periodFrom: string;
  periodTo: string;
  amount?: string;
  comment?: string;
  /** Employee-side claim detail URL (already includes APP_URL). */
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
  comment,
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

export default InternalDecisionEmail;
