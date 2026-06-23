/**
 * Phase 9 — account-created notification. GAS analog: `sendAccountCreatedEmail`.
 *
 * Security: the temporary password is delivered to the admin on-screen
 * (out-of-band) and is NEVER emailed. This message only confirms the account
 * exists, states the login, and links to the sign-in page; `mustChangePassword`
 * forces a password change on first login.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { sectionStyle } from './_theme';
import { Cta, Field, MailLayout } from './MailLayout';

export interface AccountCreatedProps {
  /** Display name of the new user. */
  name: string;
  /** Login the user signs in with. */
  loginName: string;
  /** Sign-in page URL (already includes APP_URL). */
  loginUrl: string;
}

export function AccountCreatedEmail({
  name,
  loginName,
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
          Administrator utworzył dla Ciebie konto w systemie MAGGuarantee.
        </Text>
        <Field label="Login">{loginName}</Field>
        <Text style={{ margin: '0 0 4px' }}>
          Hasło tymczasowe przekaże Ci administrator. Przy pierwszym logowaniu
          system poprosi o ustawienie nowego hasła.
        </Text>
      </Section>
      <Cta href={loginUrl} label="Zaloguj się" />
    </MailLayout>
  );
}

export default AccountCreatedEmail;
