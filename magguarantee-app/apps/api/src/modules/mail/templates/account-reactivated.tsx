/**
 * Phase 9 — account-reactivated notification. GAS analog:
 * `sendAccountReactivatedEmail`. Informs the user access is restored.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { sectionStyle } from './_theme';
import { Cta, Field, MailLayout } from './MailLayout';

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
      title="Konto reaktywowane"
      preview="Twoje konto w MAGGuarantee jest znów aktywne"
      tone="success"
    >
      <Section style={sectionStyle}>
        <Text style={{ margin: '0 0 12px' }}>Witaj {name},</Text>
        <Text style={{ margin: '0 0 12px' }}>
          Twoje konto w systemie MAGGuarantee zostało ponownie aktywowane.
          Możesz znów się zalogować.
        </Text>
        <Field label="Login">{loginName}</Field>
      </Section>
      <Cta href={loginUrl} label="Zaloguj się" tone="success" />
    </MailLayout>
  );
}

export default AccountReactivatedEmail;
