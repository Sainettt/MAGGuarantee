/**
 * "Order issued" notification. Sent to the carrier when an eksport marks the
 * outing `gotowy` (`DelegationsService.markReady`).
 *
 * ⚠️ REWRITE 2026-07-30 — the mail used to announce «Ciągnik gotowy do
 * wyjazdu», which said nothing about WHY the outing moved. What actually
 * happened is that the eksport found a ładunek and issued a zlecenie in
 * SpedTrans, so that is what the mail says now, with the order number as the
 * hero element (`CodePanel` — this is the number the carrier quotes back).
 *
 * The status name («Załadowany») is stated plainly so the mail and the app use
 * the same word. Per the product decision the mail does NOT editorialise about
 * that status being a documentary rather than a physical state.
 *
 * Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { eyebrowStyle } from './_theme';
import {
  Block,
  CodePanel,
  DataSection,
  FieldRow,
  MailLayout,
  Paragraph,
} from './MailLayout';

export interface DelegationReadyProps {
  carrierName: string;
  plateNumber: string;
  /** Pre-formatted departure: "dd.MM.yyyy HH:mm · <country> <postal>". */
  departure: string;
  /** SpedTrans order number — mandatory on the forward `gotowy` flip. */
  spedOrderNumber: string;
}

export function DelegationReadyEmail({
  carrierName,
  plateNumber,
  departure,
  spedOrderNumber,
}: DelegationReadyProps): React.ReactElement {
  return (
    <MailLayout
      preview={`Zlecenie ${spedOrderNumber} — ciągnik ${plateNumber}`}
      overline="Wyjazd"
      title="Zlecenie wystawione"
      badge={{ tone: 'success', label: 'Załadowany' }}
    >
      <Paragraph>Witaj {carrierName},</Paragraph>
      <Paragraph>
        Znaleźliśmy ładunek dla ciągnika <strong>{plateNumber}</strong> i
        wystawiliśmy zlecenie w SpedTrans.
      </Paragraph>

      <Block pad="4px 32px 6px 32px">
        <p style={eyebrowStyle}>Nr zlecenia ze spedu</p>
      </Block>
      <CodePanel
        value={spedOrderNumber}
        variant="light"
        size={18}
        letterSpacing={1}
      />

      <Paragraph>
        W systemie wyjazd ma teraz status <strong>„Załadowany”</strong>.
      </Paragraph>

      <DataSection heading="Wyjazd">
        <FieldRow label="Ciągnik" value={plateNumber} />
        <FieldRow label="Wyjazd" value={departure} />
      </DataSection>
    </MailLayout>
  );
}

export default DelegationReadyEmail;
