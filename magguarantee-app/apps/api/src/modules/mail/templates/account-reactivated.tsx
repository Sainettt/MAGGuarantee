/**
 * Account-reactivated notification. GAS analog: `sendAccountReactivatedEmail`.
 * Informs the user access is restored. Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { DataSection, FieldRow, MailLayout, Paragraph } from './MailLayout';

export interface AccountReactivatedProps {
  name: string;
  loginName: string;
  loginUrl: string;
}

export function AccountReactivatedEmail({
  name,
  loginName,
  loginUrl,
}: AccountReactivatedProps): React.ReactElement {
  return (
    <MailLayout
      preview="Twoje konto w MAGGuarantee jest znów aktywne"
      overline="Twoje konto"
      title="Konto reaktywowane"
      badge={{ tone: 'success', label: 'Aktywne' }}
      cta={{ href: loginUrl, label: 'Zaloguj się' }}
    >
      <Paragraph>Witaj {name},</Paragraph>
      <Paragraph>
        Twoje konto w systemie MAGGuarantee zostało ponownie aktywowane. Możesz
        znów się zalogować.
      </Paragraph>

      <DataSection heading="Konto">
        <FieldRow label="Login" value={loginName} />
      </DataSection>
    </MailLayout>
  );
}

export default AccountReactivatedEmail;
