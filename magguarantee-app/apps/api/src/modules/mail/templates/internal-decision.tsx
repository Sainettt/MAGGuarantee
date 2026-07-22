/**
 * Phase 9 — verification outcome email to INTERNAL staff (planiści, opiekun,
 * lider, wnioski@). GAS analog: `sendInternalDecisionEmail`. Same data as the
 * carrier email plus the carrier name, since internal recipients handle many
 * carriers.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { amountStyle, labelStyle, sectionStyle, toneColor, type Tone } from './_theme';
import { Cta, Field, MailLayout } from './MailLayout';

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
      title={`Wniosek ${nrZgl}: ${decisionLabel}`}
      preview={`${nrZgl} — ${decisionLabel} (${carrierName})`}
      tone={tone}
    >
      <Section style={sectionStyle}>
        <Field label="Przewoźnik">{carrierName}</Field>
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
      <Cta href={deeplink} label="Otwórz w MAGGuarantee" tone={tone} />
    </MailLayout>
  );
}

export default InternalDecisionEmail;
