/**
 * A carrier filed a REKLAMACJA — heads-up to every active `admin` + `pracownik`
 * (the staff who can decide it). No GAS analog: the legacy app logged the
 * reklamacja and mailed only the first admin it found.
 *
 * The whole point of the email is that the recipient can decide WITHOUT opening
 * the app first: the kwota being claimed, next to the three figures that bound it
 * (requested / paid / claimable maximum), plus the carrier's justification.
 *
 * Design: docs/22-email-design.md (`warning` badge — it is pending work).
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

export interface ReklamacjaInternalSubmittedProps {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  carrierName: string;
  vehiclePlate: string;
  /** Kwota reklamacji in EUR, pre-formatted (2 dp). */
  kwota: string;
  /** Originally requested dopłata (`origPaymentEur`), pre-formatted. */
  wnioskowana: string;
  /** Already paid out (`amountApproved`, `0.00` for a rejected wniosek). */
  wyplacona: string;
  /** Ceiling `wnioskowana − wyplacona`, pre-formatted. */
  maksimum: string;
  /** The carrier's justification (`reklamacjaText`). */
  tresc: string;
  /** Employee claims list with the `?nrZgl=` deeplink (already includes APP_URL). */
  deeplink: string;
}

export function ReklamacjaInternalSubmittedEmail({
  nrZgl,
  carrierName,
  vehiclePlate,
  kwota,
  wnioskowana,
  wyplacona,
  maksimum,
  tresc,
  deeplink,
}: ReklamacjaInternalSubmittedProps): React.ReactElement {
  return (
    <MailLayout
      preview={`${nrZgl} — reklamacja na ${kwota} EUR (${carrierName})`}
      overline="Reklamacja"
      title={nrZgl}
      badge={{ tone: 'warning', label: 'Reklamacja do rozpatrzenia' }}
      cta={{ href: deeplink, label: 'Otwórz w MAGGuarantee' }}
      note="Reklamację można uznać (z numerem zlecenia do wypłaty) albo odrzucić z uzasadnieniem."
    >
      <DataSection heading="Wniosek">
        <FieldRow label="Przewoźnik" value={carrierName} />
        <FieldRow label="Ciągnik" value={vehiclePlate} />
        <FieldRow label="Kwota wnioskowana" value={`${wnioskowana} EUR`} />
        <FieldRow label="Kwota wypłacona" value={`${wyplacona} EUR`} />
        <FieldRow label="Maksimum reklamacji" value={`${maksimum} EUR`} />
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

export default ReklamacjaInternalSubmittedEmail;
