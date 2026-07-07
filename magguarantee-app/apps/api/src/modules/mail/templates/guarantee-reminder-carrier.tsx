/**
 * Guarantee Watchdog #17 — carrier wyjazd reminder (plan §6).
 *
 * Sent by the daily cron (07:10 Warsaw) when one or more of a carrier's
 * guaranteed vehicles are approaching their wyjazd deadline (D-3 / D-1). ONE
 * email per carrier per day, listing every vehicle due today. Carriers get NO
 * violation mail — only reminders (client decision, plan §9.2).
 *
 * Intro states the obligation (report a wyjazd within N Polish WORKING days of
 * the last return). Table columns: Nr rej. | Ostatni zjazd / Objęcie gwarancją |
 * Termin | Pozostało dni roboczych. CTA "Zgłoś wyjazd" deeplinks to the carrier
 * delegation form. Modeled on the Phase-9 `MailLayout` chrome.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { colors, labelStyle, sectionStyle } from './_theme';
import { Cta, MailLayout } from './MailLayout';

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

const cellHead: React.CSSProperties = {
  ...labelStyle,
  padding: '0 12px 6px 0',
  textAlign: 'left',
};

const cell: React.CSSProperties = {
  fontSize: 14,
  color: colors.ink,
  padding: '6px 12px 6px 0',
  borderTop: `1px solid ${colors.border}`,
  verticalAlign: 'top',
};

/** Polish plural for "dni roboczych" — cardinal-safe for the small counts here. */
function workingDaysLeftLabel(n: number): string {
  // 1 → "1 dzień roboczy", 2–4 → "N dni robocze", else → "N dni roboczych".
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
      title="Przypomnienie: zgłoś wyjazd"
      preview={`Zgłoś wyjazd — ${rows.length} pojazd(ów)`}
      tone="warning"
    >
      <Section style={sectionStyle}>
        <Text style={{ margin: '0 0 8px' }}>Witaj {carrierName},</Text>
        <Text style={{ margin: '0 0 12px' }}>
          Przypominamy, że dla pojazdów objętych porozumieniem (gwarancją)
          należy zgłosić wyjazd w ciągu {deadlineWorkingDays} dni roboczych od
          ostatniego zjazdu. Poniższe pojazdy zbliżają się do terminu:
        </Text>
      </Section>

      <Section style={sectionStyle}>
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
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
                <td style={{ ...cell, fontWeight: 700 }}>{r.plateNumber}</td>
                <td style={cell}>
                  {r.anchorLabel}
                  <span style={{ color: colors.inkMuted }}>
                    {r.anchorSource === 'agreement'
                      ? ' (objęcie gwarancją)'
                      : ' (zjazd)'}
                  </span>
                </td>
                <td style={cell}>{r.deadlineLabel}</td>
                <td style={{ ...cell, color: colors.warning, fontWeight: 600 }}>
                  {workingDaysLeftLabel(r.daysLeft)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Cta href={deeplink} label="Zgłoś wyjazd" tone="brand" />
    </MailLayout>
  );
}

export default GuaranteeReminderCarrierEmail;
