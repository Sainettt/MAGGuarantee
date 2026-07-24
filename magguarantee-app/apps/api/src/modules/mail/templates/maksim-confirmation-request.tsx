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
 * alongside for non-HTML clients.
 *
 * Brand color (#dc2626) from docs/14-design-system.md §"MAGTRANS RED".
 * No images, no remote assets — predictable Outlook + Gmail rendering.
 */
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface MaksimConfirmationRequestProps {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** Display name of the carrier (User.name → fallback to login). */
  carrierName: string;
  /** Plate number snapshot from the claim. */
  vehiclePlate: string;
  /** Dopłata (EUR) — `amountRequested` pre-formatted to two decimals. */
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

const brand = '#dc2626';
const ink = '#0f172a';
const inkMuted = '#475569';
const surface = '#ffffff';
const surfaceMuted = '#f8fafc';
const border = '#e2e8f0';

const bodyStyle: React.CSSProperties = {
  backgroundColor: surfaceMuted,
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  color: ink,
  margin: 0,
  padding: '24px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: surface,
  maxWidth: 560,
  margin: '0 auto',
  borderRadius: 12,
  overflow: 'hidden',
  border: `1px solid ${border}`,
};

const headerStyle: React.CSSProperties = {
  borderTop: `4px solid ${brand}`,
  padding: '24px 32px 16px',
  backgroundColor: surface,
};

const sectionStyle: React.CSSProperties = {
  padding: '16px 32px',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: inkMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  margin: '0 0 4px',
};

const valueStyle: React.CSSProperties = {
  fontSize: 15,
  color: ink,
  margin: '0 0 12px',
  fontWeight: 500,
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: brand,
  color: '#ffffff',
  borderRadius: 8,
  padding: '12px 24px',
  fontSize: 15,
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
};

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
    <Html lang="pl">
      <Head />
      <Preview>{`Potwierdzenie autoryzacji dopłaty: ${nrZgl}`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Heading
              as="h1"
              style={{ fontSize: 20, margin: 0, color: ink, fontWeight: 700 }}
            >
              Potwierdzenie autoryzacji: {nrZgl}
            </Heading>
            <Text style={{ ...labelStyle, marginTop: 6 }}>MAGGuarantee</Text>
          </Section>

          <Hr style={{ borderColor: border, margin: 0 }} />

          <Section style={sectionStyle}>
            <Text style={labelStyle}>Przewoźnik</Text>
            <Text style={valueStyle}>{carrierName}</Text>

            <Text style={labelStyle}>Ciągnik</Text>
            <Text style={valueStyle}>{vehiclePlate}</Text>

            <Text style={labelStyle}>Dopłata</Text>
            <Text style={valueStyle}>{doplata} EUR</Text>

            <Text style={labelStyle}>Próg autoryzacji</Text>
            <Text style={valueStyle}>{prog} EUR</Text>

            <Text style={labelStyle}>Dni w trasie</Text>
            <Text style={valueStyle}>{dniWTrasie}</Text>

            <Text style={labelStyle}>Okno godzin</Text>
            <Text style={valueStyle}>
              {godzinyFrom} – {godzinyTo}
            </Text>

            <Text style={labelStyle}>Odjazd (zgłoszony → faktyczny)</Text>
            <Text style={valueStyle}>{planFakt(odjazdPlan, odjazdFakt)}</Text>

            <Text style={labelStyle}>Zjazd (planowany → faktyczny)</Text>
            <Text style={valueStyle}>{planFakt(zjazdPlan, zjazdFakt)}</Text>
          </Section>

          {hasKorekty ? (
            <>
              <Hr style={{ borderColor: border, margin: 0 }} />
              <Section style={sectionStyle}>
                <Text style={labelStyle}>Korekty weryfikatora</Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: inkMuted,
                    margin: '0 0 8px',
                    fontWeight: 400,
                  }}
                >
                  Weryfikator poprawił dane wprowadzone przez przewoźnika:
                </Text>
                {korekty!.map((k) => (
                  <Text
                    key={k.label}
                    style={{ ...valueStyle, margin: '0 0 6px' }}
                  >
                    {k.label}: {k.from} → {k.to}
                  </Text>
                ))}
              </Section>
            </>
          ) : null}

          <Section style={{ ...sectionStyle, textAlign: 'center' }}>
            <Button href={deeplink} style={buttonStyle}>
              Otwórz w MAGGuarantee
            </Button>
            <Text style={{ fontSize: 12, color: inkMuted, margin: '12px 0 0' }}>
              Lub skopiuj link: {deeplink}
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: 0 }} />

          <Section style={sectionStyle}>
            <Text style={{ fontSize: 12, color: inkMuted, margin: 0 }}>
              Ta wiadomość została wygenerowana automatycznie przez system
              MAGGuarantee. Dopłata przekracza próg autoryzacji — decyzja
              zostanie odblokowana po wgraniu potwierdzenia Twojej zgody.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default MaksimConfirmationRequestEmail;
