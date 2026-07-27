/**
 * Verification-SLA daily digest email template.
 *
 * Net-new for the pracownik verification-SLA "attention" feature
 * (docs/21-pracownik-verification-sla.md §5). Rendered to HTML via
 * `@react-email/render` inside `MailService.sendVerificationDigest()`; the
 * caller builds a matching plain-text fallback so non-HTML clients (and
 * Mailhog's text pane) stay usable.
 *
 * Design: docs/22-email-design.md. Lists `overdue` rows first (red) then
 * `dueSoon` (amber), each with nrZgl, carrier, plate, and the working-days-left
 * label.
 */
import * as React from 'react';

import { colors, eyebrowStyle, fontFamily } from './_theme';
import { Block, MailLayout } from './MailLayout';

/** Amber used for the "due soon" group (matches the reference pending badge). */
const AMBER = '#8A5A16';

/** One claim row in the digest. `workingDaysLeft` is signed (negative = overdue). */
export interface VerificationDigestRow {
  /** Numer zgłoszenia, e.g. `GWA/001/05/26`. */
  nrZgl: string;
  /** Display name of the carrier (User.name → fallback to login). */
  carrierName: string;
  /** Plate number snapshot from the claim. */
  vehiclePlate: string;
  /** Signed Polish-working-days remaining (`< 0` = overdue). */
  workingDaysLeft: number;
}

export interface VerificationDigestProps {
  /** Overdue claims (workingDaysLeft < 0), most overdue first. */
  overdue: VerificationDigestRow[];
  /** Due-soon claims (0..3 working days left), most urgent first. */
  dueSoon: VerificationDigestRow[];
  /** Full URL to the pracownik dashboard (already includes APP_URL). */
  deeplink: string;
}

/**
 * Polish working-days-left label per row. Overdue rows ("po terminie") never
 * show a number; due-soon rows show «{n} dni robocze» (the dueSoon bucket is
 * always `0..3`, so plural «dni robocze» is correct here).
 */
export function workingDaysLabel(workingDaysLeft: number): string {
  if (workingDaysLeft < 0) return 'po terminie';
  return `${workingDaysLeft} dni robocze`;
}

function DigestRow({
  row,
  accent,
}: {
  row: VerificationDigestRow;
  accent: string;
}): React.ReactElement {
  return (
    <p
      style={{
        margin: '0 0 6px 0',
        fontFamily,
        fontSize: 14,
        lineHeight: '20px',
        color: colors.ink,
      }}
    >
      <span style={{ fontWeight: 'bold' }}>{row.nrZgl}</span>
      {' — '}
      {row.carrierName}
      {' · '}
      {row.vehiclePlate}
      {' · '}
      <span style={{ color: accent, fontWeight: 'bold' }}>
        {workingDaysLabel(row.workingDaysLeft)}
      </span>
    </p>
  );
}

export function VerificationDigestEmail(
  props: VerificationDigestProps,
): React.ReactElement {
  const { overdue, dueSoon, deeplink } = props;
  const total = overdue.length + dueSoon.length;

  return (
    <MailLayout
      preview={`Weryfikacja zgłoszeń — ${total} wymaga uwagi`}
      overline="Dzienny przegląd"
      title="Zgłoszenia do weryfikacji"
      badge={{ tone: 'warning', label: `${total} wymaga uwagi` }}
      cta={{ href: deeplink, label: 'Otwórz panel weryfikacji' }}
      note="Otrzymujesz tę wiadomość jako pracownik odpowiedzialny za weryfikację zgłoszeń."
    >
      {overdue.length > 0 ? (
        <Block>
          <p style={{ ...eyebrowStyle, color: colors.brand, margin: '4px 0 10px 0' }}>
            Po terminie ({overdue.length})
          </p>
          {overdue.map((row) => (
            <DigestRow key={row.nrZgl} row={row} accent={colors.brand} />
          ))}
        </Block>
      ) : null}

      {dueSoon.length > 0 ? (
        <Block>
          <p style={{ ...eyebrowStyle, color: AMBER, margin: '4px 0 10px 0' }}>
            Zbliża się termin ({dueSoon.length})
          </p>
          {dueSoon.map((row) => (
            <DigestRow key={row.nrZgl} row={row} accent={AMBER} />
          ))}
        </Block>
      ) : null}
    </MailLayout>
  );
}

export default VerificationDigestEmail;
