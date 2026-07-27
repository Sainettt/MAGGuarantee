/**
 * Guarantee Watchdog #17 — carrier wyjazd reminder (plan §6).
 *
 * Sent by the daily cron (07:10 Warsaw) when one or more of a carrier's
 * guaranteed vehicles are approaching their wyjazd deadline (D-3 / D-1). ONE
 * email per carrier per day, listing every vehicle due today. Carriers get NO
 * violation mail — only reminders (client decision, plan §9.2).
 *
 * Design: docs/22-email-design.md. Columns: Nr rej. | Ostatni zjazd / Objęcie
 * gwarancją | Termin | Pozostało dni roboczych. CTA "Zgłoś wyjazd".
 */
import * as React from 'react';

import { colors, eyebrowStyle, fontFamily } from './_theme';
import { Block, MailLayout, Paragraph } from './MailLayout';

/** One vehicle row in the carrier reminder. */
export interface GuaranteeReminderCarrierRow {
  /** Numer rejestracyjny (plate). */
  plateNumber: string;
  /**
   * Formatted anchor date (dd.MM.yyyy). Labelled "Ostatni zjazd" when
   * `anchorSource='zjechal'`, "Objęcie gwarancją" when `='agreement'`.
   */
  anchorLabel: string;
  /** `zjechal` → last return; `agreement` → guarantee-enable date. */
  anchorSource: 'zjechal' | 'agreement';
  /** Formatted deadline date (dd.MM.yyyy). */
  deadlineLabel: string;
  /** Working days remaining (>= 0 here — carriers only get reminders). */
  daysLeft: number;
}

export interface GuaranteeReminderCarrierProps {
  carrierName: string;
  /** Deadline window in working days (config-driven; default 10). */
  deadlineWorkingDays: number;
  rows: GuaranteeReminderCarrierRow[];
  /** Deeplink to the carrier "zgłoś wyjazd" form (already includes APP_URL). */
  deeplink: string;
}

const AMBER = '#8A5A16';

const cellHead: React.CSSProperties = {
  ...eyebrowStyle,
  padding: '0 12px 8px 0',
  textAlign: 'left',
};

const cell: React.CSSProperties = {
  fontFamily,
  fontSize: 14,
  lineHeight: '20px',
  color: colors.ink,
  padding: '8px 12px 8px 0',
  borderTop: `1px solid ${colors.border}`,
  verticalAlign: 'top',
};

/** Polish plural for "dni roboczych" — cardinal-safe for the small counts here. */
function workingDaysLeftLabel(n: number): string {
  if (n === 1) return '1 dzień roboczy';
  if (n >= 2 && n <= 4) return `${n} dni robocze`;
  return `${n} dni roboczych`;
}

export function GuaranteeReminderCarrierEmail({
  carrierName,
  deadlineWorkingDays,
  rows,
  deeplink,
}: GuaranteeReminderCarrierProps): React.ReactElement {
  return (
    <MailLayout
      preview={`Zgłoś wyjazd — ${rows.length} ciągnik(ów)`}
      overline="Przypomnienie"
      title="Zgłoś wyjazd"
      badge={{ tone: 'warning', label: 'Zbliża się termin' }}
      cta={{ href: deeplink, label: 'Zgłoś wyjazd' }}
    >
      <Paragraph>Witaj {carrierName},</Paragraph>
      <Paragraph>
        Przypominamy, że dla ciągników objętych porozumieniem (gwarancją) należy
        zgłosić wyjazd w ciągu {deadlineWorkingDays} dni roboczych od ostatniego
        zjazdu. Poniższe ciągniki zbliżają się do terminu:
      </Paragraph>

      <Block>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          border={0}
          width="100%"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr>
              <th style={cellHead}>Nr rej.</th>
              <th style={cellHead}>Ostatni zjazd / Objęcie gwarancją</th>
              <th style={cellHead}>Termin</th>
              <th style={cellHead}>Pozostało</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plateNumber}>
                <td style={{ ...cell, fontWeight: 'bold' }}>{r.plateNumber}</td>
                <td style={cell}>
                  {r.anchorLabel}
                  <span style={{ color: colors.text }}>
                    {r.anchorSource === 'agreement'
                      ? ' (objęcie gwarancją)'
                      : ' (zjazd)'}
                  </span>
                </td>
                <td style={cell}>{r.deadlineLabel}</td>
                <td style={{ ...cell, color: AMBER, fontWeight: 'bold' }}>
                  {workingDaysLeftLabel(r.daysLeft)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>
    </MailLayout>
  );
}

export default GuaranteeReminderCarrierEmail;
