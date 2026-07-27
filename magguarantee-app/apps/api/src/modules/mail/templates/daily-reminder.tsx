/**
 * Daily reminder for claims stuck awaiting verification. GAS analog:
 * `sendDailyReminders`. Template only in this slice; the BullMQ scheduled job
 * that feeds it is a separate cron TODO (docs/16-jobs-and-integrations.md).
 *
 * Design: docs/22-email-design.md.
 */
import * as React from 'react';

import {
  DataSection,
  FieldRow,
  MailLayout,
  Paragraph,
} from './MailLayout';

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
      preview={`${items.length} wniosków czeka na weryfikację`}
      overline="Przypomnienie"
      title="Wnioski oczekujące na weryfikację"
      badge={
        items.length > 0
          ? { tone: 'warning', label: `${items.length} oczekuje` }
          : undefined
      }
      cta={{ href: deeplink, label: 'Otwórz panel weryfikacji' }}
    >
      <Paragraph>
        Poniższe wnioski oczekują na weryfikację dłużej niż zakładany termin:
      </Paragraph>

      {items.length > 0 ? (
        <DataSection heading="Oczekujące wnioski">
          {items.map((it) => (
            <FieldRow
              key={it.nrZgl}
              label={it.nrZgl}
              value={`${it.vehiclePlate} · oczekuje ${it.daysWaiting} dni`}
            />
          ))}
        </DataSection>
      ) : (
        <Paragraph>Brak zaległych wniosków.</Paragraph>
      )}
    </MailLayout>
  );
}

export default DailyReminderEmail;
