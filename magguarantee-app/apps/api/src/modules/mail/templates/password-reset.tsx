/**
 * Password-reset code email template.
 *
 * Rendered to HTML via `@react-email/render` inside
 * `MailService.sendPasswordReset()`. A plain-text fallback is generated
 * alongside by the caller so non-HTML clients see the same code. The code is
 * shown big-and-centered exactly like the 2FA email so users recognise the
 * pattern. Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { colors } from './_theme';
import { CodePanel, MailLayout, Paragraph } from './MailLayout';

export interface PasswordResetProps {
  /** 6-digit reset code. */
  code: string;
  /** Code validity in minutes (mirrors the Redis TTL, default 10). */
  ttlMinutes: number;
}

export function PasswordResetEmail({
  code,
  ttlMinutes,
}: PasswordResetProps): React.ReactElement {
  return (
    <MailLayout
      preview={`Kod resetu hasła MAGGuarantee: ${code}`}
      overline="Bezpieczeństwo"
      title="Reset hasła"
    >
      <Paragraph>
        Otrzymaliśmy prośbę o zresetowanie hasła. Wpisz poniższy kod, aby ustawić
        nowe hasło:
      </Paragraph>
      <CodePanel value={code} variant="brand" size={34} letterSpacing={10} />
      <Paragraph style={{ fontSize: 13, color: colors.muted }}>
        Kod ważny przez <strong style={{ color: colors.ink }}>{ttlMinutes} minut</strong>.
        Nie udostępniaj go nikomu.
      </Paragraph>
      <Paragraph style={{ fontSize: 13, color: colors.muted }}>
        Jeśli to nie Ty prosiłeś o reset hasła, zignoruj tę wiadomość — Twoje
        hasło pozostanie bez zmian.
      </Paragraph>
    </MailLayout>
  );
}

export default PasswordResetEmail;
