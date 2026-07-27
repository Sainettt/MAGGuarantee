/**
 * "New wyjazd announced" notification. Sent when a carrier registers a
 * delegation (`DelegationsService.add`): to the carrier as a confirmation
 * receipt, and to their opiekun as an internal heads-up.
 *
 * `forCarrier` toggles the intro line; the wyjazd details below are identical.
 * Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { DataSection, FieldRow, MailLayout, Paragraph } from './MailLayout';

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
      preview={`Wyjazd ${plateNumber} — ${departure}`}
      overline="Wyjazd"
      title="Nowy wyjazd zgłoszony"
    >
      <Paragraph>
        {forCarrier
          ? 'Twój wyjazd został zarejestrowany w systemie MAGGuarantee.'
          : `Przewoźnik ${carrierName} zgłosił nowy wyjazd.`}
      </Paragraph>

      <DataSection heading="Szczegóły wyjazdu">
        {!forCarrier ? <FieldRow label="Przewoźnik" value={carrierName} /> : null}
        <FieldRow label="Ciągnik" value={plateNumber} />
        <FieldRow label="Kierowca" value={driverName} />
        <FieldRow label="Wyjazd" value={departure} />
        <FieldRow label="Planowany powrót" value={plannedReturn} />
      </DataSection>
    </MailLayout>
  );
}

export default DelegationAnnouncedEmail;
