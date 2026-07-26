/**
 * Phase 9 — "new claim submitted" notification. GAS analog: the `submitNewClaim`
 * notification. Sent to the carrier (as a receipt, no open button) and to
 * internal staff when a carrier submits a new wniosek; lands in the same Gmail
 * thread as later decision emails (threadKey `wniosek-{nrZgl}`).
 *
 * The "open wniosek" button (`deeplink`) is rendered ONLY when supplied — the
 * caller passes it for admin/pracownik recipients only.
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
  /** Kilometres actually driven in the period. */
  kmDriven?: string;
  /** Kilometres guaranteed by contract for the period. */
  kmGuaranteed?: string;
  /** Shortfall (guaranteed − driven), the basis for compensation. */
  kmShortfall?: string;
  /** Worked days in the period (round(hours/24, 2)). */
  drivenDays?: string;
  /**
   * The km-calc compensation in EUR, pre-formatted (two decimals). At submit
   * time this IS the requested amount — there is no separate carrier-entered
   * figure (the old `amountRequested` prop was the same number twice).
   */
  paymentEur?: string;
  /** Claim detail URL — present ONLY for staff who may open the wniosek. */
  deeplink?: string;
}

export function CarrierSubmittedEmail({
  nrZgl,
  carrierName,
  vehiclePlate,
  periodFrom,
  periodTo,
  kmDriven,
  kmGuaranteed,
  kmShortfall,
  drivenDays,
  paymentEur,
  deeplink,
}: CarrierSubmittedProps): React.ReactElement {
  return (
    <MailLayout
      title={`Nowy wniosek: ${nrZgl}`}
      preview={`Nowy wniosek ${nrZgl} od ${carrierName}`}
    >
      <Section style={sectionStyle}>
        <Field label="Przewoźnik">{carrierName}</Field>
        <Field label="Ciągnik">{vehiclePlate}</Field>
        <Field label="Okres">
          {periodFrom} → {periodTo}
        </Field>
        {drivenDays ? (
          <Field label="Dni przepracowane">{drivenDays}</Field>
        ) : null}
      </Section>

      <Section style={sectionStyle}>
        {kmGuaranteed ? (
          <Field label="Kilometry gwarantowane">{kmGuaranteed} km</Field>
        ) : null}
        {kmDriven ? (
          <Field label="Kilometry przejechane">{kmDriven} km</Field>
        ) : null}
        {kmShortfall ? (
          <Field label="Niedobór kilometrów">{kmShortfall} km</Field>
        ) : null}
      </Section>

      <Section style={sectionStyle}>
        {paymentEur ? (
          <Field label="Kwota wnioskowana">{paymentEur} EUR</Field>
        ) : null}
        <Text style={{ margin: '4px 0 0' }}>
          Wniosek oczekuje na weryfikację.
        </Text>
      </Section>

      {deeplink ? <Cta href={deeplink} label="Otwórz wniosek" /> : null}
    </MailLayout>
  );
}

export default CarrierSubmittedEmail;
