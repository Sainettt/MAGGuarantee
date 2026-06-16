/**
 * Password-reset code email template.
 *
 * Rendered to HTML via `@react-email/render` inside
 * `MailService.sendPasswordReset()`. A plain-text fallback is generated
 * alongside by the caller so non-HTML clients see the same code.
 *
 * Visual language mirrors the 2FA login-code email and the authorization
 * request: MAGTRANS RED brand (#dc2626), no remote assets, predictable in
 * Outlook + Gmail. The code is shown big-and-centered exactly like the 2FA
 * email so users recognise the pattern.
 */
import {
  Body,
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

export interface PasswordResetProps {
  /** 6-digit reset code. */
  code: string;
  /** Code validity in minutes (mirrors the Redis TTL, default 10). */
  ttlMinutes: number;
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
  maxWidth: 480,
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

const codeStyle: React.CSSProperties = {
  backgroundColor: brand,
  color: '#ffffff',
  fontSize: 34,
  fontWeight: 700,
  letterSpacing: 10,
  textAlign: 'center',
  padding: '18px',
  borderRadius: 10,
  margin: '8px 0 16px',
};

export function PasswordResetEmail(
  props: PasswordResetProps,
): React.ReactElement {
  const { code, ttlMinutes } = props;
  return (
    <Html lang="pl">
      <Head />
      <Preview>{`Kod resetu hasła MAGGuarantee: ${code}`}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Heading
              as="h1"
              style={{ fontSize: 20, margin: 0, color: ink, fontWeight: 700 }}
            >
              Reset hasła
            </Heading>
            <Text style={{ ...labelStyle, marginTop: 6 }}>MAGGuarantee</Text>
          </Section>

          <Hr style={{ borderColor: border, margin: 0 }} />

          <Section style={sectionStyle}>
            <Text style={{ fontSize: 14, color: inkMuted, margin: '0 0 8px' }}>
              Otrzymaliśmy prośbę o zresetowanie hasła. Wpisz poniższy kod, aby
              ustawić nowe hasło:
            </Text>
            <Text style={codeStyle}>{code}</Text>
            <Text
              style={{
                fontSize: 12,
                color: inkMuted,
                textAlign: 'center',
                margin: 0,
              }}
            >
              Kod ważny przez <b>{ttlMinutes} minut</b>. Nie udostępniaj go
              nikomu.
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: 0 }} />

          <Section style={sectionStyle}>
            <Text style={{ fontSize: 12, color: inkMuted, margin: 0 }}>
              Jeśli to nie Ty prosiłeś o reset hasła, zignoruj tę wiadomość —
              Twoje hasło pozostanie bez zmian.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordResetEmail;
