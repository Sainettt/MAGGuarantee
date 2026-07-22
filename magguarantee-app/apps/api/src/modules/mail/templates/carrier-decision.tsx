/**
 * Phase 9 — verification outcome email to the CARRIER. GAS analog:
 * `buildCarrierEmail`. The header tone is driven by the decision (accepted →
 * green, rejected → red, etc.) per the legacy `CONFIG.KOLORY` colour mapping.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { amountStyle, labelStyle, sectionStyle, toneColor, type Tone } from './_theme';
import { Cta, Field, MailLayout } from './MailLayout';

export interface CarrierDecisionProps {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** Human label of the decision, e.g. `ZAAKCEPTOWANO`. */
  decisionLabel: string;
  /** Header / amount accent colour for the decision. */
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
      title={`Wniosek ${nrZgl}: ${decisionLabel}`}
      preview={`${nrZgl} — ${decisionLabel}`}
      tone={tone}
    >
      <Section style={sectionStyle}>
        <Field label="Ciągnik">{vehiclePlate}</Field>
        <Field label="Okres">
          {periodFrom} → {periodTo}
        </Field>
        {amount ? (
          <>
            <Text style={labelStyle}>Kwota</Text>
            <Text style={{ ...amountStyle, color: toneColor(tone) }}>
              {amount} EUR
            </Text>
          </>
        ) : null}
        {comment ? (
          <>
            <Text style={{ ...labelStyle, marginTop: 16 }}>Komentarz</Text>
            <Text style={{ whiteSpace: 'pre-line', margin: '0 0 8px' }}>
              {comment}
            </Text>
          </>
        ) : null}
      </Section>
      <Cta href={deeplink} label="Otwórz wniosek" tone={tone} />
    </MailLayout>
  );
}

export default CarrierDecisionEmail;
