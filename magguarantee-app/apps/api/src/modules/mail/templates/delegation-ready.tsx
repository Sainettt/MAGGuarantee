/**
 * "Vehicle ready" notification. Sent to the carrier when an eksport marks the
 * outing `gotowy` (`DelegationsService.markReady`). Design:
 * docs/22-email-design.md.
 */
import * as React from 'react';

import { DataSection, FieldRow, MailLayout, Paragraph } from './MailLayout';

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
      preview={`Ciągnik ${plateNumber} jest gotowy`}
      overline="Wyjazd"
      title="Ciągnik gotowy do wyjazdu"
      badge={{ tone: 'success', label: 'Gotowy' }}
    >
      <Paragraph>Witaj {carrierName},</Paragraph>
      <Paragraph>
        Ciągnik <strong>{plateNumber}</strong> został oznaczony jako gotowy do
        wyjazdu.
      </Paragraph>

      <DataSection heading="Wyjazd">
        <FieldRow label="Ciągnik" value={plateNumber} />
        <FieldRow label="Wyjazd" value={departure} />
      </DataSection>
    </MailLayout>
  );
}

export default DelegationReadyEmail;
