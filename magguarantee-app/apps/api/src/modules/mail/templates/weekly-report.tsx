/**
 * Phase 9 — weekly summary report. GAS analog: `sendWeeklyReport`. Template
 * only in this slice; the Monday cron job that feeds it is a separate cron
 * TODO (docs/16-jobs-and-integrations.md).
 */
import { Column, Row, Section, Text } from '@react-email/components';
import * as React from 'react';

import { colors, labelStyle, sectionStyle } from './_theme';
import { Cta, MailLayout } from './MailLayout';

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
      title="Raport tygodniowy"
      preview={`Raport tygodniowy: ${weekLabel}`}
    >
      <Section style={sectionStyle}>
        <Text style={{ ...labelStyle, margin: '0 0 12px' }}>{weekLabel}</Text>
        {rows.map((r) => (
          <Row key={r.label} style={{ marginBottom: 8 }}>
            <Column style={{ color: colors.inkMuted, fontSize: 14 }}>
              {r.label}
            </Column>
            <Column
              style={{
                textAlign: 'right',
                fontWeight: 700,
                fontSize: 15,
                color: colors.ink,
              }}
            >
              {r.value}
            </Column>
          </Row>
        ))}
      </Section>
      <Cta href={deeplink} label="Otwórz panel" />
    </MailLayout>
  );
}

export default WeeklyReportEmail;
