/**
 * Phase 4.2 — Maksim authorization-request email template.
 *
 * Rendered to HTML via `@react-email/render` inside `MailService.
 * sendAuthorizationRequest()`. Plain text is generated alongside by the
 * caller so non-HTML email clients (and Mailhog's text pane) get a usable
 * fallback.
 *
 * Brand color (#dc2626) from docs/14-design-system.md §"MAGTRANS RED".
 * No images, no remote assets — keeps Outlook + Gmail rendering predictable.
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

export interface AuthorizationRequestProps {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** Display name of the carrier (User.name → fallback to login). */
  carrierName: string;
  /** Plate number snapshot from the claim. */
  vehiclePlate: string;
  /** Period start in `YYYY-MM-DD` (rendered as-is — already locale-neutral). */
  periodFrom: string;
  /** Period end in `YYYY-MM-DD`. */
  periodTo: string;
  /**
   * Carrier-side amount requested (EUR) — what the wniosek originally asked
   * for. Pre-formatted to a two-decimal string by the caller so the template
   * stays pure.
   */
  doplata: string;
  /**
   * Authorization threshold (EUR) for this trip length — the SOFT hint from
   * `getAuthThreshold(drivenDays)` (`Code.gs:5967`). Informational context
   * only; the system never enforces it. Pre-formatted to a two-decimal string
   * by the caller so the template stays pure. Legacy showed this as
   * "Próg autoryzacji: 500 €".
   */
  prog: string;
  /**
   * Trip length in driven working days (`dni w trasie`). Optional — rendered
   * only when the caller passes it. Pre-formatted string; matches the legacy
   * email which listed the trip length alongside the threshold.
   */
  dniWTrasie?: string;
  /** Optional verifier rationale shown above the CTA. */
  comment?: string;
  /**
   * «Korekty weryfikatora» — the diff between the carrier's original submit data
   * and the verified (currently-applied) data. Each row is a preformatted
   * `{label, from, to}` triple ("Przebieg", "8000 km", "8500 km"). Only fields
   * the verifier actually changed are present; the whole section is omitted when
   * the array is absent or empty (the verifier confirmed the data as-is).
   */
  korekty?: Array<{ label: string; from: string; to: string }>;
  /** Full URL pointing at the claim detail page (already includes APP_URL). */
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

export function AuthorizationRequestEmail(
  props: AuthorizationRequestProps,
): React.ReactElement {
  const {
    nrZgl,
    carrierName,
    vehiclePlate,
    periodFrom,
    periodTo,
    doplata,
    prog,
    dniWTrasie,
    comment,
    korekty,
    deeplink,
  } = props;

  const hasKorekty = Array.isArray(korekty) && korekty.length > 0;

  return (
    <Html lang="pl">
      <Head />
      <Preview>{`Wniosek o autoryzację kwoty Maksima: ${nrZgl}`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Heading
              as="h1"
              style={{
                fontSize: 20,
                margin: 0,
                color: ink,
                fontWeight: 700,
              }}
            >
              Wniosek o autoryzację: {nrZgl}
            </Heading>
            <Text style={{ ...labelStyle, marginTop: 6 }}>MAGGuarantee</Text>
          </Section>

          <Hr style={{ borderColor: border, margin: 0 }} />

          <Section style={sectionStyle}>
            <Text style={labelStyle}>Przewoźnik</Text>
            <Text style={valueStyle}>{carrierName}</Text>

            <Text style={labelStyle}>Ciągnik</Text>
            <Text style={valueStyle}>{vehiclePlate}</Text>

            <Text style={labelStyle}>Okres wniosku</Text>
            <Text style={valueStyle}>
              {periodFrom} → {periodTo}
            </Text>

            {dniWTrasie ? (
              <>
                <Text style={labelStyle}>Dni w trasie</Text>
                <Text style={valueStyle}>{dniWTrasie}</Text>
              </>
            ) : null}

            <Text style={labelStyle}>Dopłata (kwota wnioskowana)</Text>
            <Text style={valueStyle}>{doplata} EUR</Text>

            <Text style={labelStyle}>Próg autoryzacji</Text>
            <Text style={valueStyle}>{prog} EUR</Text>
          </Section>

          {comment ? (
            <>
              <Hr style={{ borderColor: border, margin: 0 }} />
              <Section style={sectionStyle}>
                <Text style={labelStyle}>Komentarz weryfikatora</Text>
                <Text
                  style={{
                    ...valueStyle,
                    whiteSpace: 'pre-line',
                    fontWeight: 400,
                  }}
                >
                  {comment}
                </Text>
              </Section>
            </>
          ) : null}

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
                  <Text key={k.label} style={{ ...valueStyle, margin: '0 0 6px' }}>
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
            <Text
              style={{
                fontSize: 12,
                color: inkMuted,
                margin: '12px 0 0',
              }}
            >
              Lub skopiuj link: {deeplink}
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: 0 }} />

          <Section style={sectionStyle}>
            <Text
              style={{ fontSize: 12, color: inkMuted, margin: 0 }}
            >
              Ta wiadomość została wygenerowana automatycznie przez system
              MAGGuarantee. Jeśli nie spodziewałeś się tego maila, zignoruj
              go.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default AuthorizationRequestEmail;
