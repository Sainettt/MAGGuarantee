/**
 * Reklamacja outcome email to the CARRIER. Sibling of `carrier-decision.tsx`
 * (same tone conventions: accepted → green, rejected → red) but about the
 * REKLAMACJA, not the wniosek.
 *
 * Why it is a separate template: after a reklamacja decision the claim's `status`
 * rolls BACK to `statusBeforeReklamacja` (variant A, REWORK 2026-07-31), so the
 * generic decision email would announce the ORIGINAL wniosek verdict a second
 * time. The outcome lives in `reklamacjaResolution` and only this template reads
 * it.
 *
 *  - `UZNANA`    → success tone, the kwota + «Nr zlecenia» it is paid under.
 *  - `ODRZUCONA` → danger tone, the justification (`reklamacjaResponse`), no
 *                  amount panel (there is nothing to pay).
 *
 * Design: docs/22-email-design.md §7.
 */
import * as React from 'react';

import type { ReklamacjaResolution } from '@magguarantee/shared';

import {
  criticalColor,
  eyebrowStyle,
  paragraphStyle,
  type Tone,
} from './_theme';
import {
  AmountPanel,
  Block,
  DataSection,
  FieldRow,
  MailLayout,
} from './MailLayout';

export interface ReklamacjaCarrierDecisionProps {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** The OUTCOME — never inferred from the claim status. */
  resolution: ReklamacjaResolution;
  vehiclePlate: string;
  /** Kwota reklamacji in EUR, pre-formatted (2 dp). Paid as-is on `UZNANA`. */
  kwota: string;
  /** «Nr zlecenia» the dopłata is paid under — present on `UZNANA`. */
  orderNumber?: string;
  /** MAGTRANS' answer (`reklamacjaResponse`) — the reason on `ODRZUCONA`. */
  response?: string;
  /** Carrier-facing claim detail URL (already includes APP_URL). */
  deeplink: string;
}

const COPY: Record<
  ReklamacjaResolution,
  { tone: Tone; label: string; lead: string; responseHeading: string }
> = {
  UZNANA: {
    tone: 'success',
    label: 'Reklamacja uznana',
    lead: 'Twoja reklamacja została uznana. Kwota zostanie wypłacona zgodnie z numerem zlecenia poniżej.',
    responseHeading: 'Komentarz',
  },
  ODRZUCONA: {
    tone: 'danger',
    label: 'Reklamacja odrzucona',
    lead: 'Twoja reklamacja została odrzucona. Poniżej uzasadnienie decyzji.',
    responseHeading: 'Uzasadnienie',
  },
};

export function ReklamacjaCarrierDecisionEmail({
  nrZgl,
  resolution,
  vehiclePlate,
  kwota,
  orderNumber,
  response,
  deeplink,
}: ReklamacjaCarrierDecisionProps): React.ReactElement {
  const copy = COPY[resolution];
  const accepted = resolution === 'UZNANA';
  return (
    <MailLayout
      preview={`${nrZgl} — ${copy.label}`}
      overline="Decyzja w sprawie reklamacji"
      title={nrZgl}
      badge={{ tone: copy.tone, label: copy.label }}
      cta={{ href: deeplink, label: 'Otwórz wniosek' }}
    >
      <Block>
        <p style={paragraphStyle}>{copy.lead}</p>
      </Block>

      <DataSection heading="Reklamacja">
        <FieldRow label="Wniosek" value={nrZgl} />
        <FieldRow label="Ciągnik" value={vehiclePlate} />
        {accepted && orderNumber ? (
          <FieldRow label="Nr zlecenia" value={orderNumber} />
        ) : null}
      </DataSection>

      {accepted ? (
        <AmountPanel
          label="Kwota do wypłaty"
          value={`${kwota} EUR`}
          valueColor={criticalColor(copy.tone)}
        />
      ) : null}

      {response ? (
        <Block>
          <p style={{ ...eyebrowStyle, margin: '18px 0 8px 0' }}>
            {copy.responseHeading}
          </p>
          <p style={{ ...paragraphStyle, whiteSpace: 'pre-line' }}>{response}</p>
        </Block>
      ) : null}
    </MailLayout>
  );
}

export default ReklamacjaCarrierDecisionEmail;
