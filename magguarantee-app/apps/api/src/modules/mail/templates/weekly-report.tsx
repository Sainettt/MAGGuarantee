/**
 * Weekly summary report. GAS analog: `sendWeeklyReport`. Template only in this
 * slice; the Monday cron job that feeds it is a separate cron TODO
 * (docs/16-jobs-and-integrations.md). Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { DataSection, FieldRow, MailLayout } from './MailLayout';

export interface WeeklyReportRow {
  label: string;
  value: string;
}

export interface WeeklyReportProps {
  /** Human label for the reporting window, e.g. `16–22.06.2026`. */
  weekLabel: string;
  rows: WeeklyReportRow[];
  /** Dashboard URL (already includes APP_URL). */
  deeplink: string;
}

export function WeeklyReportEmail({
  weekLabel,
  rows,
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
      <DataSection heading="Podsumowanie">
        {rows.map((r) => (
          <FieldRow key={r.label} label={r.label} value={r.value} />
        ))}
      </DataSection>
    </MailLayout>
  );
}

export default WeeklyReportEmail;
