/**
 * Phase 9 — account-deactivated notification. GAS analog:
 * `sendAccountDeactivatedEmail`. Informs the user their access is suspended.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { sectionStyle } from './_theme';
import { Field, MailLayout } from './MailLayout';

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
      title="Konto dezaktywowane"
      preview="Twoje konto w MAGGuarantee zostało dezaktywowane"
      tone="danger"
    >
      <Section style={sectionStyle}>
        <Text style={{ margin: '0 0 12px' }}>Szanowny Użytkowniku {name},</Text>
        <Text style={{ margin: '0 0 12px' }}>
          Informujemy, że Twoje konto w systemie MAGGuarantee zostało
          dezaktywowane. Dostęp do systemu został zablokowany.
        </Text>
        <Field label="Login">{loginName}</Field>
        <Text style={{ margin: 0 }}>
          W sprawach formalnych prosimy o kontakt z administratorem.
        </Text>
      </Section>
    </MailLayout>
  );
}

export default AccountDeactivatedEmail;
