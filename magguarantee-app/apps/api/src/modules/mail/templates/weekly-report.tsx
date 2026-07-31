/**
 * Weekly summary report. GAS analog: `sendWeeklyReport` (`Code.gs:7056`),
 * which mailed the admin a flat all-time tally every Monday.
 *
 * This version keeps the same numbers but splits what the legacy report
 * conflated: what HAPPENED during the reported week vs what is sitting in the
 * queue right now. The payout sum gets its own panel — it is the number the
 * admin opens the mail for.
 *
 * Fed by the Monday cron in `modules/weekly-report/`.
 * Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { colors } from './_theme';
import {
  AmountPanel,
  DataSection,
  FieldRow,
  MailLayout,
  Paragraph,
} from './MailLayout';

export interface WeeklyReportRow {
  label: string;
  value: string;
}

export interface WeeklyReportProps {
  /** Human label for the reporting window, e.g. `20–26.07.2026`. */
  weekLabel: string;
  /**
   * What happened during the window: submitted / accepted / rejected +
   * «Uznane reklamacje» (count · Σ kwota — money owed ON TOP of the payout panel,
   * which sums freshly-accepted wnioski only). Rendered generically as
   * label/value pairs, so the cron owns the row list.
   */
  rows: WeeklyReportRow[];
  /** What is open right now, regardless of when it arrived. */
  backlogRows: WeeklyReportRow[];
  /** Pre-formatted payout total for the window, e.g. `1 234,56 €`. */
  payoutTotal: string;
  /** Dashboard URL (already includes APP_URL). */
  deeplink: string;
}

export function WeeklyReportEmail({
  weekLabel,
  rows,
  backlogRows,
  payoutTotal,
  deeplink,
}: WeeklyReportProps): React.ReactElement {
  return (
    <MailLayout
      preview={`Raport tygodniowy: ${weekLabel}`}
      overline="Raport"
      title="Raport tygodniowy"
      badge={{ tone: 'neutral', label: weekLabel }}
      cta={{ href: deeplink, label: 'Otwórz panel' }}
    >
      <Paragraph>
        Podsumowanie tygodnia {weekLabel} w systemie MAGGuarantee.
      </Paragraph>

      <AmountPanel
        label="Suma dopłat (zaakceptowane w tym tygodniu)"
        value={payoutTotal}
      />

      <DataSection heading="W tym tygodniu">
        {rows.map((r) => (
          <FieldRow key={r.label} label={r.label} value={r.value} />
        ))}
      </DataSection>

      <DataSection heading="Stan bieżący">
        {backlogRows.map((r) => (
          <FieldRow key={r.label} label={r.label} value={r.value} />
        ))}
      </DataSection>

      <Paragraph style={{ fontSize: 13, color: colors.muted }}>
        Wiadomość wewnętrzna — nie przesyłaj przewoźnikom.
      </Paragraph>
    </MailLayout>
  );
}

export default WeeklyReportEmail;
