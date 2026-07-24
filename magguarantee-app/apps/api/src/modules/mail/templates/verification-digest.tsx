/**
 * Verification-SLA daily digest email template.
 *
 * Net-new for the pracownik verification-SLA "attention" feature
 * (docs/21-pracownik-verification-sla.md §5). Rendered to HTML via
 * `@react-email/render` inside `MailService.sendVerificationDigest()`; the
 * caller builds a matching plain-text fallback so non-HTML clients (and
 * Mailhog's text pane) stay usable.
 *
 * Modeled structurally on `maksim-confirmation-request.tsx` — same brand color
 * (#dc2626 from docs/14-design-system.md §"MAGTRANS RED"), no images, no
 * remote assets. Lists `overdue` rows first (red) then `dueSoon` (amber),
 * each with nrZgl, carrier, plate, and the working-days-left label.
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

/** One claim row in the digest. `workingDaysLeft` is signed (negative = overdue). */
export interface VerificationDigestRow {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** Display name of the carrier (User.name → fallback to login). */
  carrierName: string;
  /** Plate number snapshot from the claim. */
  vehiclePlate: string;
  /** Signed Polish-working-days remaining (`< 0` = overdue). */
  workingDaysLeft: number;
}

export interface VerificationDigestProps {
  /** Overdue claims (workingDaysLeft < 0), most overdue first. */
  overdue: VerificationDigestRow[];
  /** Due-soon claims (0..3 working days left), most urgent first. */
  dueSoon: VerificationDigestRow[];
  /** Full URL to the pracownik dashboard (already includes APP_URL). */
  deeplink: string;
}

const brand = '#dc2626';
const amber = '#b45309';
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

const groupHeadingStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  margin: '0 0 8px',
};

const rowStyle: React.CSSProperties = {
  fontSize: 14,
  color: ink,
  margin: '0 0 6px',
  lineHeight: 1.4,
};

const tagStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
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

/**
 * Polish working-days-left label per row. Overdue rows ("po terminie") never
 * show a number; due-soon rows show «{n} dni robocze» (the dueSoon bucket is
 * always `0..3`, so plural «dni robocze» is correct here).
 */
export function workingDaysLabel(workingDaysLeft: number): string {
  if (workingDaysLeft < 0) return 'po terminie';
  return `${workingDaysLeft} dni robocze`;
}

function DigestRow({
  row,
  accent,
}: {
  row: VerificationDigestRow;
  accent: string;
}): React.ReactElement {
  return (
    <Text style={rowStyle}>
      <span style={{ fontWeight: 700 }}>{row.nrZgl}</span>
      {' — '}
      {row.carrierName}
      {' · '}
      {row.vehiclePlate}
      {' · '}
      <span style={{ ...tagStyle, color: accent }}>
        {workingDaysLabel(row.workingDaysLeft)}
      </span>
    </Text>
  );
}

export function VerificationDigestEmail(
  props: VerificationDigestProps,
): React.ReactElement {
  const { overdue, dueSoon, deeplink } = props;
  const total = overdue.length + dueSoon.length;

  return (
    <Html lang="pl">
      <Head />
      <Preview>{`Weryfikacja zgłoszeń — ${total} wymaga uwagi`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Heading
              as="h1"
              style={{ fontSize: 20, margin: 0, color: ink, fontWeight: 700 }}
            >
              Zgłoszenia do weryfikacji
            </Heading>
            <Text style={{ ...labelStyle, marginTop: 6 }}>
              MAGGuarantee — dzienny przegląd
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: 0 }} />

          {overdue.length > 0 ? (
            <Section style={sectionStyle}>
              <Text style={{ ...groupHeadingStyle, color: brand }}>
                Po terminie ({overdue.length})
              </Text>
              {overdue.map((row) => (
                <DigestRow key={row.nrZgl} row={row} accent={brand} />
              ))}
            </Section>
          ) : null}

          {dueSoon.length > 0 ? (
            <Section style={sectionStyle}>
              <Text style={{ ...groupHeadingStyle, color: amber }}>
                Zbliża się termin ({dueSoon.length})
              </Text>
              {dueSoon.map((row) => (
                <DigestRow key={row.nrZgl} row={row} accent={amber} />
              ))}
            </Section>
          ) : null}

          <Hr style={{ borderColor: border, margin: 0 }} />

          <Section style={{ ...sectionStyle, textAlign: 'center' }}>
            <Button href={deeplink} style={buttonStyle}>
              Otwórz panel weryfikacji
            </Button>
            <Text style={{ fontSize: 12, color: inkMuted, margin: '12px 0 0' }}>
              Lub skopiuj link: {deeplink}
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: 0 }} />

          <Section style={sectionStyle}>
            <Text style={{ fontSize: 12, color: inkMuted, margin: 0 }}>
              Ta wiadomość została wygenerowana automatycznie przez system
              MAGGuarantee. Otrzymujesz ją jako pracownik odpowiedzialny za
              weryfikację zgłoszeń.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default VerificationDigestEmail;
