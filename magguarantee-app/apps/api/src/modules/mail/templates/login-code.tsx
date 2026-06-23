/**
 * Phase 9 — 2FA login-code email. Promotes the inline HTML that used to live
 * in `MailService.buildHtml` into a proper React-Email template. One-time code
 * shown big-and-centered. GAS analog: the login-code path.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { colors, sectionStyle } from './_theme';
import { MailLayout } from './MailLayout';

export interface LoginCodeProps {
  code: string;
  ttlMinutes?: number;
}

const codeStyle: React.CSSProperties = {
  backgroundColor: colors.ink,
  color: '#ffffff',
  fontSize: 36,
  fontWeight: 700,
  letterSpacing: 12,
  textAlign: 'center',
  padding: '20px',
  borderRadius: 10,
  margin: '8px 0 16px',
};

export function LoginCodeEmail({
  code,
  ttlMinutes = 10,
}: LoginCodeProps): React.ReactElement {
  return (
    <MailLayout title="Kod weryfikacyjny" preview="Twój kod logowania do MAGGuarantee">
      <Section style={sectionStyle}>
        <Text style={{ fontSize: 14, color: colors.inkMuted, margin: '0 0 4px' }}>
          Twój jednorazowy kod logowania:
        </Text>
        <Text style={codeStyle}>{code}</Text>
        <Text style={{ fontSize: 12, color: colors.inkMuted, margin: 0 }}>
          Kod ważny przez <strong>{ttlMinutes} minut</strong>. Nie udostępniaj
          go nikomu. Jeśli to nie Ty próbujesz się zalogować, zignoruj tę
          wiadomość.
        </Text>
      </Section>
    </MailLayout>
  );
}

export default LoginCodeEmail;
