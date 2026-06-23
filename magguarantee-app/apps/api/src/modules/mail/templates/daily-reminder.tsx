/**
 * Phase 9 — daily reminder for claims stuck awaiting verification. GAS analog:
 * `sendDailyReminders`. Template only in this slice; the BullMQ scheduled job
 * that feeds it is a separate cron TODO (docs/16-jobs-and-integrations.md).
 */
import { Hr, Section, Text } from '@react-email/components';
import * as React from 'react';

import { colors, hrStyle, labelStyle, sectionStyle } from './_theme';
import { Cta, MailLayout } from './MailLayout';

export interface DailyReminderItem {
  nrZgl: string;
  vehiclePlate: string;
  daysWaiting: number;
}

export interface DailyReminderProps {
  items: DailyReminderItem[];
  /** Verification panel URL (already includes APP_URL). */
  deeplink: string;
}

export function DailyReminderEmail({
  items,
  deeplink,
}: DailyReminderProps): React.ReactElement {
  return (
    <MailLayout
      title="Wnioski oczekujące na weryfikację"
      preview={`${items.length} wniosków czeka na weryfikację`}
      tone="warning"
    >
      <Section style={sectionStyle}>
        <Text style={{ margin: '0 0 12px' }}>
          Poniższe wnioski oczekują na weryfikację dłużej niż zakładany termin:
        </Text>
      </Section>
      {items.map((it, i) => (
        <React.Fragment key={it.nrZgl}>
          {i > 0 ? <Hr style={hrStyle} /> : null}
          <Section style={sectionStyle}>
            <Text style={{ fontWeight: 600, margin: '0 0 2px' }}>
              {it.nrZgl}
            </Text>
            <Text style={{ ...labelStyle, margin: 0 }}>
              {it.vehiclePlate} · oczekuje {it.daysWaiting} dni
            </Text>
          </Section>
        </React.Fragment>
      ))}
      {items.length === 0 ? (
        <Section style={sectionStyle}>
          <Text style={{ color: colors.inkMuted, margin: 0 }}>
            Brak zaległych wniosków.
          </Text>
        </Section>
      ) : null}
      <Cta href={deeplink} label="Otwórz panel weryfikacji" tone="warning" />
    </MailLayout>
  );
}

export default DailyReminderEmail;
