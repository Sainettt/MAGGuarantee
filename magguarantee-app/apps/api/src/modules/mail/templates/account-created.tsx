/**
 * Phase 9 — account-created notification. GAS analog: `sendAccountCreatedEmail`.
 *
 * The temporary password IS included in this email: the admin who provisions
 * an account (especially for a carrier) has no out-of-band channel to deliver
 * it. It is a one-time password and `mustChangePassword=true` forces a change
 * on first login.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { colors, sectionStyle } from './_theme';
import { Cta, Field, MailLayout } from './MailLayout';

export interface AccountCreatedProps {
  /** Display name of the new user. */
  name: string;
  /** Login the user signs in with. */
  loginName: string;
  /** One-time temporary password (must be changed on first login). */
  temporaryPassword: string;
  /** Sign-in page URL (already includes APP_URL). */
  loginUrl: string;
}

const credStyle: React.CSSProperties = {
  backgroundColor: colors.surfaceMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 18,
  fontWeight: 700,
  letterSpacing: 1,
  textAlign: 'center',
  padding: '12px 16px',
  margin: '0 0 12px',
};

export function AccountCreatedEmail({
  name,
  loginName,
  temporaryPassword,
  loginUrl,
}: AccountCreatedProps): React.ReactElement {
  return (
    <MailLayout
      title="Konto utworzone"
      preview="Twoje konto w MAGGuarantee zostało utworzone"
    >
      <Section style={sectionStyle}>
        <Text style={{ margin: '0 0 12px' }}>Witaj {name},</Text>
        <Text style={{ margin: '0 0 12px' }}>
          Administrator utworzył dla Ciebie konto w systemie MAGGuarantee. Dane
          do logowania:
        </Text>
        <Field label="Login">{loginName}</Field>
        <Text style={{ ...sectionStyle, padding: 0, margin: '0 0 4px' }}>
          Hasło tymczasowe:
        </Text>
        <Text style={credStyle}>{temporaryPassword}</Text>
        <Text style={{ fontSize: 13, color: colors.inkMuted, margin: 0 }}>
          Ze względów bezpieczeństwa system poprosi o ustawienie nowego hasła
          przy pierwszym logowaniu. Nie udostępniaj tego hasła nikomu.
        </Text>
      </Section>
      <Cta href={loginUrl} label="Zaloguj się" />
    </MailLayout>
  );
}

export default AccountCreatedEmail;
