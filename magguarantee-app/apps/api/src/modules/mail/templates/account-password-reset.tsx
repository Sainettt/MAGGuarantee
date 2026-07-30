/**
 * Admin-issued password reset. Shared by BOTH audiences (decision 2026-07-30):
 * internal users (`POST /users/:id/reset-password`) and carriers
 * (`POST /carriers/:id/reset-password`) get the same template — the copy is
 * role-neutral on purpose.
 *
 * NOT to be confused with `password-reset.tsx`, which carries the 6-digit
 * self-service code from `/login/forgot`. This one carries a temporary
 * PASSWORD an admin generated on the user's behalf.
 *
 * The temporary password IS included, for the same reason as in
 * `account-created.tsx`: the admin has no out-of-band channel to deliver it.
 * It is one-time — `mustChangePassword=true` forces a change on first login.
 * Design: docs/22-email-design.md.
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

export interface AccountPasswordResetProps {
  /** Display name of the account holder. */
  name: string;
  /** Login the user signs in with. */
  loginName: string;
  /** One-time temporary password (must be changed on first login). */
  temporaryPassword: string;
  /** Sign-in page URL (already includes APP_URL). */
  loginUrl: string;
}

export function AccountPasswordResetEmail({
  name,
  loginName,
  temporaryPassword,
  loginUrl,
}: AccountPasswordResetProps): React.ReactElement {
  return (
    <MailLayout
      preview="Hasło do Twojego konta zostało zresetowane"
      overline="Twoje konto"
      title="Hasło zresetowane"
      cta={{ href: loginUrl, label: 'Zaloguj się' }}
    >
      <Paragraph>Witaj {name},</Paragraph>
      <Paragraph>
        Administrator zresetował hasło do Twojego konta w systemie
        MAGGuarantee. Dotychczasowe hasło przestało działać — zaloguj się przy
        użyciu hasła tymczasowego poniżej.
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
        pierwszym logowaniu. Nie udostępniaj tego hasła nikomu. Jeśli reset nie
        był z Tobą uzgodniony — skontaktuj się z administratorem.
      </Paragraph>
    </MailLayout>
  );
}

export default AccountPasswordResetEmail;
