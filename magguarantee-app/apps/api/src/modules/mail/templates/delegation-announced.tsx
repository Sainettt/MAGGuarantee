/**
 * "New wyjazd announced" confirmation receipt. Sent to the CARRIER when they
 * register a delegation (`DelegationsService.add`).
 *
 * Single audience since 2026-08-07: the internal heads-up (opiekun, planista,
 * dyspozytorzy) went back to the Google Chat space, so the former
 * `forCarrier` / `carrierName` props — which only served the internal
 * flavour — were dropped. See docs/16-jobs-and-integrations.md
 * #google-chat-notifications. Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { DataSection, FieldRow, MailLayout, Paragraph } from './MailLayout';

export interface DelegationAnnouncedProps {
  plateNumber: string;
  driverName: string;
  /** Pre-formatted departure: "dd.MM.yyyy HH:mm · <country> <postal>". */
  departure: string;
  /** Pre-formatted planned return: "dd.MM.yyyy · <country> <postal>". */
  plannedReturn: string;
}

export function DelegationAnnouncedEmail({
  plateNumber,
  driverName,
  departure,
  plannedReturn,
}: DelegationAnnouncedProps): React.ReactElement {
  return (
    <MailLayout
      preview={`Wyjazd ${plateNumber} — ${departure}`}
      overline="Wyjazd"
      title="Nowy wyjazd zgłoszony"
    >
      <Paragraph>
        Twój wyjazd został zarejestrowany w systemie MAGGuarantee.
      </Paragraph>

      <DataSection heading="Szczegóły wyjazdu">
        <FieldRow label="Ciągnik" value={plateNumber} />
        <FieldRow label="Kierowca" value={driverName} />
        <FieldRow label="Wyjazd" value={departure} />
        <FieldRow label="Planowany powrót" value={plannedReturn} />
      </DataSection>
    </MailLayout>
  );
}

export default DelegationAnnouncedEmail;
