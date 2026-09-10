/**
 * "An employee tried to sign in and has no role yet" — one mail per admin
 * (docs/24 §4).
 *
 * This is NOT an error report. Four stanowiska are deliberately left out of the
 * stanowisko → role mapping because the people holding them need different
 * access: CONTROLLING is two people, one `weryfikator` and one `pracownik`; a
 * couple of `eksport` users sit among the HANDEL planners. Those three roles
 * gate wniosek verification and money, so they are never granted by job title —
 * this mail is how an admin learns that a specific person is waiting for one.
 *
 * De-duplicated per (employee, stanowisko) for 24 h by the directory service,
 * so a colleague retrying the login button does not fan out a second round.
 *
 * Recipient resolves to the admin's personal `User.email`. Design:
 * docs/22-email-design.md.
 */
import * as React from 'react';

import { Cta, DataSection, FieldRow, MailLayout, Note, Paragraph } from './MailLayout';

export interface SsoAccessRequestedProps {
  /** Admin display name. */
  adminName: string;
  /** Who tried to sign in. */
  employeeName: string;
  employeeEmail: string;
  /** Polish label of their stanowisko, or null when MAGSpace has none set. */
  stanowiskoName: string | null;
  /** Stable MAGSpace code, shown so the admin can find it in the mapping table. */
  stanowiskoCode: string | null;
  /** Formatted attempt time (dd.MM.yyyy HH:mm). */
  attemptedAtLabel: string;
  /**
   * Deep link to the SSO admin screen (`/employee/sso`), where the refused
   * sign-in is listed with a one-step «Nadaj dostęp» action.
   */
  ssoUrl: string;
}

export function SsoAccessRequestedEmail({
  adminName,
  employeeName,
  employeeEmail,
  stanowiskoName,
  stanowiskoCode,
  attemptedAtLabel,
  ssoUrl,
}: SsoAccessRequestedProps): React.ReactElement {
  const stanowiskoLabel = stanowiskoName
    ? `${stanowiskoName}${stanowiskoCode ? ` (${stanowiskoCode})` : ''}`
    : 'Brak przypisanego stanowiska w MAGSpace';

  return (
    <MailLayout
      preview={`${employeeName} czeka na rolę w MAGGuarantee`}
      overline="Dostęp"
      title="Pracownik czeka na przyznanie roli"
      badge={{ tone: 'warning', label: 'Wymaga decyzji' }}
    >
      <Paragraph>Witaj {adminName},</Paragraph>
      <Paragraph>
        Poniższa osoba próbowała zalogować się przez Google. Jest aktywnym
        pracownikiem w MAGSpace, ale jej stanowisko nie ma przypisanej roli w
        MAGGuarantee, więc logowanie zostało odrzucone.
      </Paragraph>

      <DataSection heading="Pracownik">
        <FieldRow label="Imię i nazwisko" value={employeeName} />
        <FieldRow label="E-mail" value={employeeEmail} />
        <FieldRow label="Stanowisko" value={stanowiskoLabel} />
        <FieldRow label="Próba logowania" value={attemptedAtLabel} />
      </DataSection>

      <Paragraph>
        Aby przyznać dostęp, otwórz ekran „Logowanie Google”, kliknij „Nadaj
        dostęp” przy tej osobie i wybierz rolę. Konto zostanie założone (albo
        przywrócone) i będzie zarządzane przez MAGSpace — logowanie przez Google
        zadziała od razu, a konto zostanie automatycznie wyłączone w dniu
        zwolnienia pracownika.
      </Paragraph>

      <Cta href={ssoUrl} label="Nadaj dostęp" />
      <Note>
        Jeżeli całe to stanowisko powinno dostawać tę samą rolę, dodaj je zamiast
        tego do mapowania „Stanowisko → Rola”. Ten e-mail nie powtórzy się dla
        tej samej osoby przez 24 godziny.
      </Note>
    </MailLayout>
  );
}

export default SsoAccessRequestedEmail;
