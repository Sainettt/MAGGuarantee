/**
 * Receipt to the CARRIER: "we got your reklamacja". Customer-requested
 * confirmation mail (2026-07-31) — the carrier gets exactly one shot per wniosek,
 * so it must be unambiguous that the filing landed and what was filed.
 *
 * Deliberately no numbers beyond the kwota: the ceiling arithmetic is internal
 * context, and the carrier already saw it in the form.
 *
 * Design: docs/22-email-design.md (`warning` badge — awaiting a decision).
 */
import * as React from 'react';

import { colors, eyebrowStyle, paragraphStyle } from './_theme';
import {
  AmountPanel,
  Block,
  DataSection,
  FieldRow,
  MailLayout,
} from './MailLayout';

export interface ReklamacjaCarrierSubmittedProps {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** Kwota reklamacji in EUR, pre-formatted (2 dp). */
  kwota: string;
  /** Echo of the carrier's own justification (`reklamacjaText`). */
  tresc: string;
  /** Carrier-facing claim detail URL (already includes APP_URL). */
  deeplink: string;
}

export function ReklamacjaCarrierSubmittedEmail({
  nrZgl,
  kwota,
  tresc,
  deeplink,
}: ReklamacjaCarrierSubmittedProps): React.ReactElement {
  return (
    <MailLayout
      preview={`Reklamacja do wniosku ${nrZgl} została złożona`}
      overline="Reklamacja"
      title={nrZgl}
      badge={{ tone: 'warning', label: 'Reklamacja w toku' }}
      cta={{ href: deeplink, label: 'Otwórz wniosek' }}
      note="Otrzymasz od nas wiadomość z decyzją, gdy reklamacja zostanie rozpatrzona."
    >
      <Block>
        <p style={paragraphStyle}>
          Potwierdzamy przyjęcie reklamacji do wniosku {nrZgl}.
        </p>
      </Block>

      <DataSection heading="Zgłoszenie">
        <FieldRow label="Wniosek" value={nrZgl} />
      </DataSection>

      <AmountPanel
        label="Kwota reklamacji"
        value={`${kwota} EUR`}
        valueColor={colors.brand}
      />

      {tresc ? (
        <Block>
          <p style={{ ...eyebrowStyle, margin: '18px 0 8px 0' }}>
            Treść reklamacji
          </p>
          <p style={{ ...paragraphStyle, whiteSpace: 'pre-line' }}>{tresc}</p>
        </Block>
      ) : null}
    </MailLayout>
  );
}

export default ReklamacjaCarrierSubmittedEmail;
