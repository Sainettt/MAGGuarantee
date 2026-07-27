/**
 * Account-created notification. GAS analog: `sendAccountCreatedEmail`.
 *
 * The temporary password IS included in this email: the admin who provisions
 * an account (especially for a carrier) has no out-of-band channel to deliver
 * it. It is a one-time password and `mustChangePassword=true` forces a change
 * on first login. Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { colors, eyebrowStyle } from './_theme';
import {
  Block,
  CodePanel,
  DataSection,
  FieldRow,
  MailLayout,
  Paragraph,
} from './MailLayout';

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

export function AccountCreatedEmail({
  name,
  loginName,
  temporaryPassword,
  loginUrl,
}: AccountCreatedProps): React.ReactElement {
  return (
    <MailLayout
      preview="Twoje konto w MAGGuarantee zostało utworzone"
      overline="Twoje konto"
      title="Konto utworzone"
      cta={{ href: loginUrl, label: 'Zaloguj się' }}
    >
      <Paragraph>Witaj {name},</Paragraph>
      <Paragraph>
        Administrator utworzył dla Ciebie konto w systemie MAGGuarantee. Dane do
        logowania:
      </Paragraph>

      <DataSection heading="Dane logowania">
        <FieldRow label="Login" value={loginName} />
      </DataSection>

      <Block pad="4px 32px 6px 32px">
        <p style={eyebrowStyle}>Hasło tymczasowe</p>
      </Block>
      <CodePanel value={temporaryPassword} variant="light" size={18} letterSpacing={1} />

      <Paragraph style={{ fontSize: 13, color: colors.muted }}>
        Ze względów bezpieczeństwa system poprosi o ustawienie nowego hasła przy
        pierwszym logowaniu. Nie udostępniaj tego hasła nikomu.
      </Paragraph>
    </MailLayout>
  );
}

export default AccountCreatedEmail;
