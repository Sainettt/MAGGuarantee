/**
 * Phase 9 follow-up — "vehicle ready" notification. Sent to the carrier when an
 * eksport marks the outing `gotowy` (`DelegationsService.markReady`).
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { sectionStyle } from './_theme';
import { Field, MailLayout } from './MailLayout';

export interface DelegationReadyProps {
  carrierName: string;
  plateNumber: string;
  /** Pre-formatted departure: "dd.MM.yyyy HH:mm · <country> <postal>". */
  departure: string;
}

export function DelegationReadyEmail({
  carrierName,
  plateNumber,
  departure,
}: DelegationReadyProps): React.ReactElement {
  return (
    <MailLayout
      title="Pojazd gotowy do wyjazdu"
      preview={`Pojazd ${plateNumber} jest gotowy`}
      tone="success"
    >
      <Section style={sectionStyle}>
        <Text style={{ margin: '0 0 12px' }}>Witaj {carrierName},</Text>
        <Text style={{ margin: '0 0 12px' }}>
          Pojazd <strong>{plateNumber}</strong> został oznaczony jako gotowy do
          wyjazdu.
        </Text>
        <Field label="Pojazd">{plateNumber}</Field>
        <Field label="Wyjazd">{departure}</Field>
      </Section>
    </MailLayout>
  );
}

export default DelegationReadyEmail;
