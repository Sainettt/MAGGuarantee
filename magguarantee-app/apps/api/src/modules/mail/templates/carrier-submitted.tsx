/**
 * Phase 9 — "new claim submitted" notification. GAS analog: the `submitNewClaim`
 * notification. Sent to internal staff (and the carrier as a receipt) when a
 * carrier submits a new wniosek; lands in the same Gmail thread as later
 * decision emails (threadKey `wniosek-{nrZgl}`).
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { sectionStyle } from './_theme';
import { Cta, Field, MailLayout } from './MailLayout';

export interface CarrierSubmittedProps {
  nrZgl: string;
  carrierName: string;
  vehiclePlate: string;
  periodFrom: string;
  periodTo: string;
  /** Amount requested in EUR, pre-formatted (two decimals). Omitted if N/A. */
  amountRequested?: string;
  /** Claim detail URL (already includes APP_URL). */
  deeplink: string;
}

export function CarrierSubmittedEmail({
  nrZgl,
  carrierName,
  vehiclePlate,
  periodFrom,
  periodTo,
  amountRequested,
  deeplink,
}: CarrierSubmittedProps): React.ReactElement {
  return (
    <MailLayout
      title={`Nowy wniosek: ${nrZgl}`}
      preview={`Nowy wniosek ${nrZgl} od ${carrierName}`}
    >
      <Section style={sectionStyle}>
        <Field label="Przewoźnik">{carrierName}</Field>
        <Field label="Pojazd">{vehiclePlate}</Field>
        <Field label="Okres">
          {periodFrom} → {periodTo}
        </Field>
        {amountRequested ? (
          <Field label="Kwota wnioskowana">{amountRequested} EUR</Field>
        ) : null}
        <Text style={{ margin: '4px 0 0' }}>
          Wniosek oczekuje na weryfikację.
        </Text>
      </Section>
      <Cta href={deeplink} label="Otwórz wniosek" />
    </MailLayout>
  );
}

export default CarrierSubmittedEmail;
