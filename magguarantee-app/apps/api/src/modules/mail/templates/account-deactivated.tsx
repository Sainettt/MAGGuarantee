/**
 * Account-deactivated notification. GAS analog: `sendAccountDeactivatedEmail`.
 * Informs the user their access is suspended. Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { DataSection, FieldRow, MailLayout, Paragraph } from './MailLayout';

export interface AccountDeactivatedProps {
  name: string;
  loginName: string;
}

export function AccountDeactivatedEmail({
  name,
  loginName,
}: AccountDeactivatedProps): React.ReactElement {
  return (
    <MailLayout
      preview="Twoje konto w MAGGuarantee zostało dezaktywowane"
      overline="Twoje konto"
      title="Konto dezaktywowane"
      badge={{ tone: 'danger', label: 'Dezaktywowane' }}
    >
      <Paragraph>Szanowny Użytkowniku {name},</Paragraph>
      <Paragraph>
        Informujemy, że Twoje konto w systemie MAGGuarantee zostało dezaktywowane.
        Dostęp do systemu został zablokowany.
      </Paragraph>

      <DataSection heading="Konto">
        <FieldRow label="Login" value={loginName} />
      </DataSection>

      <Paragraph>W sprawach formalnych prosimy o kontakt z administratorem.</Paragraph>
    </MailLayout>
  );
}

export default AccountDeactivatedEmail;
