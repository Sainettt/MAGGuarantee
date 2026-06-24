/**
 * Phase 9 follow-up — "new wyjazd announced" notification. Sent when a carrier
 * registers a delegation (`DelegationsService.add`): to the carrier as a
 * confirmation receipt, and to their opiekun as an internal heads-up.
 *
 * `forCarrier` toggles the intro line; the wyjazd details below are identical.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { sectionStyle } from './_theme';
import { Field, MailLayout } from './MailLayout';

export interface DelegationAnnouncedProps {
  /** Carrier confirmation (true) vs internal opiekun heads-up (false). */
  forCarrier: boolean;
  carrierName: string;
  plateNumber: string;
  driverName: string;
  /** Pre-formatted departure: "dd.MM.yyyy HH:mm · <country> <postal>". */
  departure: string;
  /** Pre-formatted planned return: "dd.MM.yyyy · <country> <postal>". */
  plannedReturn: string;
}

export function DelegationAnnouncedEmail({
  forCarrier,
  carrierName,
  plateNumber,
  driverName,
  departure,
  plannedReturn,
}: DelegationAnnouncedProps): React.ReactElement {
  return (
    <MailLayout
      title="Nowy wyjazd zgłoszony"
      preview={`Wyjazd ${plateNumber} — ${departure}`}
    >
      <Section style={sectionStyle}>
        <Text style={{ margin: '0 0 12px' }}>
          {forCarrier
            ? 'Twój wyjazd został zarejestrowany w systemie MAGGuarantee.'
            : `Przewoźnik ${carrierName} zgłosił nowy wyjazd.`}
        </Text>
      </Section>
      <Section style={sectionStyle}>
        {!forCarrier ? <Field label="Przewoźnik">{carrierName}</Field> : null}
        <Field label="Pojazd">{plateNumber}</Field>
        <Field label="Kierowca">{driverName}</Field>
        <Field label="Wyjazd">{departure}</Field>
        <Field label="Planowany powrót">{plannedReturn}</Field>
      </Section>
    </MailLayout>
  );
}

export default DelegationAnnouncedEmail;
