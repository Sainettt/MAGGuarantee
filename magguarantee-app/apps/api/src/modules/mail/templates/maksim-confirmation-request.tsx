/**
 * Maksim over-threshold CONFIRMATION-REQUEST email template.
 *
 * The ONLY authorization notification: when a verifier saves a verification and
 * the dopłata STRICTLY exceeds `getAuthThreshold(drivenDays)`, the claim is
 * auto-moved into `OCZEKUJE_NA_AUTORYZACJE` and Maksim is asked to confirm
 * out-of-band; the verifier then uploads a screenshot of his reply to lift the
 * decision block.
 *
 * Rendered to HTML via `@react-email/render` in
 * `MailService.sendMaksimConfirmationRequest()`; a plain-text fallback is built
 * alongside for non-HTML clients. Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { colors, eyebrowStyle, paragraphStyle, fieldValueStyle } from './_theme';
import {
  AmountPanel,
  Block,
  DataSection,
  FieldRow,
  MailLayout,
} from './MailLayout';

export interface MaksimConfirmationRequestProps {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** Display name of the carrier (User.name → fallback to login). */
  carrierName: string;
  /** Plate number snapshot from the claim. */
  vehiclePlate: string;
  /** Dopłata (EUR) — the current `paymentEur`, pre-formatted to two decimals. */
  doplata: string;
  /** Próg autoryzacji (EUR) — `getAuthThreshold(drivenDays)`, two decimals. */
  prog: string;
  /** Dni w trasie — `drivenDays`, pre-formatted. */
  dniWTrasie: string;
  /** Okno godzin — start (`HH:mm`) of the claimed time window. */
  godzinyFrom: string;
  /** Okno godzin — end (`HH:mm`). */
  godzinyTo: string;
  /** Odjazd zgłoszony (date, `YYYY-MM-DD`) — `delegation.departureAt`; `null` when unlinked. */
  odjazdPlan: string | null;
  /** Odjazd faktyczny (date) — `delegation.actualDepartureAt`; `null` before `w_trasie`. */
  odjazdFakt: string | null;
  /** Zjazd planowany (date) — `delegation.plannedReturnAt`; `null` when unlinked. */
  zjazdPlan: string | null;
  /** Zjazd faktyczny (date) — `delegation.actualReturnAt`; `null` before `zjechał`. */
  zjazdFakt: string | null;
  /**
   * «Korekty weryfikatora» — the diff between the carrier's original submit data
   * and the verified data (reused `_buildAuthorizationKorekty`). Section omitted
   * when absent/empty (verifier confirmed as-is).
   */
  korekty?: Array<{ label: string; from: string; to: string }>;
  /** Full URL to the employee claim page (already includes APP_URL). */
  deeplink: string;
}

/** Renders "plan → fakt" or "plan" or "—" depending on which dates exist. */
function planFakt(plan: string | null, fakt: string | null): string {
  if (plan && fakt) return `${plan} → ${fakt}`;
  if (plan) return plan;
  if (fakt) return fakt;
  return '—';
}

export function MaksimConfirmationRequestEmail(
  props: MaksimConfirmationRequestProps,
): React.ReactElement {
  const {
    nrZgl,
    carrierName,
    vehiclePlate,
    doplata,
    prog,
    dniWTrasie,
    godzinyFrom,
    godzinyTo,
    odjazdPlan,
    odjazdFakt,
    zjazdPlan,
    zjazdFakt,
    korekty,
    deeplink,
  } = props;

  const hasKorekty = Array.isArray(korekty) && korekty.length > 0;

  return (
    <MailLayout
      preview={`Potwierdzenie autoryzacji dopłaty: ${nrZgl}`}
      overline="Potwierdzenie autoryzacji"
      title={nrZgl}
      badge={{ tone: 'warning', label: 'Oczekuje na autoryzację' }}
      cta={{ href: deeplink, label: 'Otwórz w MAGGuarantee' }}
      note="Dopłata przekracza próg autoryzacji — decyzja zostanie odblokowana po wgraniu potwierdzenia Twojej zgody."
    >
      <DataSection heading="Wniosek">
        <FieldRow label="Przewoźnik" value={carrierName} />
        <FieldRow label="Ciągnik" value={vehiclePlate} />
      </DataSection>

      <AmountPanel
        label="Dopłata (przekracza próg)"
        value={`${doplata} EUR`}
        valueColor={colors.brand}
      />

      <DataSection heading="Szczegóły">
        <FieldRow label="Próg autoryzacji" value={`${prog} EUR`} />
        <FieldRow label="Dni w trasie" value={dniWTrasie} />
        <FieldRow label="Okno godzin" value={`${godzinyFrom} – ${godzinyTo}`} />
        <FieldRow label="Odjazd (zgłoszony → faktyczny)" value={planFakt(odjazdPlan, odjazdFakt)} />
        <FieldRow label="Zjazd (planowany → faktyczny)" value={planFakt(zjazdPlan, zjazdFakt)} />
      </DataSection>

      {hasKorekty ? (
        <Block>
          <p style={{ ...eyebrowStyle, margin: '18px 0 8px 0' }}>Korekty weryfikatora</p>
          <p style={{ ...paragraphStyle, margin: '0 0 8px 0' }}>
            Weryfikator poprawił dane wprowadzone przez przewoźnika:
          </p>
          {korekty!.map((k) => (
            <p key={k.label} style={{ ...fieldValueStyle, fontWeight: 'normal', margin: '0 0 6px 0' }}>
              <span style={{ color: colors.text }}>{k.label}: </span>
              {k.from} → {k.to}
            </p>
          ))}
        </Block>
      ) : null}
    </MailLayout>
  );
}

export default MaksimConfirmationRequestEmail;
