/**
 * "New claim submitted" notification. GAS analog: the `submitNewClaim`
 * notification. Sent to the carrier (as a receipt, no open button) and to
 * internal staff when a carrier submits a new wniosek; lands in the same Gmail
 * thread as later decision emails (threadKey `wniosek-{nrZgl}`).
 *
 * The "open wniosek" button (`deeplink`) is rendered ONLY when supplied — the
 * caller passes it for admin/pracownik recipients only.
 *
 * Design: docs/22-email-design.md (overline → nrZgl → "Oczekuje na weryfikację"
 * badge → data sections → amount panel).
 */
import * as React from 'react';

import { colors } from './_theme';
import {
  AmountPanel,
  DataSection,
  FieldRow,
  MailLayout,
} from './MailLayout';

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
  /** Amount requested by the carrier in EUR, pre-formatted (two decimals). */
  amountRequested?: string;
  /** System-calculated compensation in EUR, pre-formatted (two decimals). */
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
  amountRequested,
  paymentEur,
  deeplink,
}: CarrierSubmittedProps): React.ReactElement {
  const hasKm = Boolean(kmGuaranteed || kmDriven || kmShortfall);
  const headline = amountRequested ?? paymentEur;
  return (
    <MailLayout
      preview={`Nowy wniosek ${nrZgl} od ${carrierName}`}
      overline="Nowy wniosek o gwarancję"
      title={nrZgl}
      badge={{ tone: 'warning', label: 'Oczekuje na weryfikację' }}
      cta={deeplink ? { href: deeplink, label: 'Otwórz wniosek' } : undefined}
      note="Wniosek oczekuje na weryfikację. Po decyzji otrzymasz kolejną wiadomość."
    >
      <DataSection heading="Przewoźnik">
        <FieldRow label="Firma" value={carrierName} />
        <FieldRow label="Ciągnik" value={vehiclePlate} />
      </DataSection>

      <DataSection heading="Okres rozliczeniowy">
        <FieldRow label="Zakres dat" value={`${periodFrom} – ${periodTo}`} />
        {drivenDays ? (
          <FieldRow label="Dni przepracowane" value={drivenDays} />
        ) : null}
      </DataSection>

      {hasKm ? (
        <DataSection heading="Kilometry">
          {kmGuaranteed ? (
            <FieldRow label="Gwarantowane" value={`${kmGuaranteed} km`} />
          ) : null}
          {kmDriven ? (
            <FieldRow label="Przejechane" value={`${kmDriven} km`} />
          ) : null}
          {kmShortfall ? (
            <FieldRow
              label="Niedobór"
              value={`${kmShortfall} km`}
              valueColor={colors.brand}
            />
          ) : null}
        </DataSection>
      ) : null}

      {headline ? (
        <AmountPanel label="Kwota wnioskowana" value={`${headline} EUR`} />
      ) : null}

      {amountRequested && paymentEur ? (
        <DataSection heading="Rozliczenie">
          <FieldRow label="Wyliczona rekompensata" value={`${paymentEur} EUR`} />
        </DataSection>
      ) : null}
    </MailLayout>
  );
}

export default CarrierSubmittedEmail;
