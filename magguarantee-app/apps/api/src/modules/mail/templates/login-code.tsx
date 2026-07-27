/**
 * 2FA login-code email. One-time code shown big-and-centered. GAS analog: the
 * login-code path. Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { colors } from './_theme';
import { CodePanel, MailLayout, Paragraph } from './MailLayout';

export interface LoginCodeProps {
  code: string;
  ttlMinutes?: number;
}

export function LoginCodeEmail({
  code,
  ttlMinutes = 10,
}: LoginCodeProps): React.ReactElement {
  return (
    <MailLayout
      preview="Twój kod logowania do MAGGuarantee"
      overline="Logowanie"
      title="Kod weryfikacyjny"
    >
      <Paragraph>Twój jednorazowy kod logowania:</Paragraph>
      <CodePanel value={code} variant="ink" size={34} letterSpacing={10} />
      <Paragraph style={{ fontSize: 13, color: colors.muted }}>
        Kod ważny przez <strong style={{ color: colors.ink }}>{ttlMinutes} minut</strong>.
        Nie udostępniaj go nikomu. Jeśli to nie Ty próbujesz się zalogować,
        zignoruj tę wiadomość.
      </Paragraph>
    </MailLayout>
  );
}

export default LoginCodeEmail;
