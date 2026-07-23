/**
 * Vehicle-removal admin digest (vehicle-status rework, Step B — Part 3).
 *
 * ONE digest per ACTIVE admin per cron run, listing every LIVE vehicle whose
 * derived lifecycle status is `do_usuniecia` (idle ≥ the shared threshold, i.e.
 * ≥29 calendar days since its last return). The cron re-sends every N days
 * (`VEHICLE_REMOVAL_ALERT_REPEAT_DAYS`) until the vehicle leaves the
 * `do_usuniecia` bucket (a new wyjazd / deactivation / removal).
 *
 * Recipient resolves to the admin's PERSONAL `User.email`. Modeled on the
 * Phase-9 `MailLayout` chrome (mirror of `guarantee-opiekun-digest.tsx`).
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { colors, labelStyle, sectionStyle } from './_theme';
import { MailLayout } from './MailLayout';

/** One overdue-for-removal vehicle row. */
export interface VehicleRemovalAdminRow {
  plateNumber: string;
  /** Internal side number (`Vehicle.sideNumber`), or `null` when unset. */
  sideNumber: string | null;
  /** Display name of the owning carrier. */
  carrierName: string;
  /** Calendar days since the idle anchor (≥ the removal threshold). */
  daysSinceReturn: number;
  /** Formatted idle anchor date (dd.MM.yyyy) — last return or vehicle creation. */
  anchorLabel: string;
}

export interface VehicleRemovalAdminProps {
  /** Admin display name. */
  adminName: string;
  /** Formatted "today" (dd.MM.yyyy) for the subject/preview. */
  dateLabel: string;
  /** The idle-day threshold that puts a vehicle into `do_usuniecia` (≥ this). */
  thresholdDays: number;
  /** Every vehicle currently due for removal review. Never empty when sent. */
  rows: VehicleRemovalAdminRow[];
}

const cell: React.CSSProperties = {
  fontSize: 14,
  color: colors.ink,
  padding: '4px 12px 4px 0',
  lineHeight: 1.4,
};

function daysLabel(n: number): string {
  // Values are always ≥ the removal threshold (≥29), so the "dni" plural is
  // correct; keep the `1 dzień` guard for defensiveness.
  return n === 1 ? '1 dzień' : `${n} dni`;
}

export function VehicleRemovalAdminEmail({
  adminName,
  dateLabel,
  thresholdDays,
  rows,
}: VehicleRemovalAdminProps): React.ReactElement {
  return (
    <MailLayout
      title="Pojazdy do usunięcia"
      preview={`Pojazdy do usunięcia — ${dateLabel} (${rows.length})`}
      tone="danger"
    >
      <Section style={sectionStyle}>
        <Text style={{ margin: '0 0 8px' }}>Witaj {adminName},</Text>
        <Text style={{ margin: '0 0 4px' }}>
          Poniższe pojazdy są nieaktywne co najmniej {thresholdDays} dni
          kalendarzowych (status „do usunięcia”) na dzień {dateLabel}. Zweryfikuj,
          czy powinny zostać usunięte z systemu.
        </Text>
      </Section>

      <Section style={sectionStyle}>
        <Text
          style={{ ...labelStyle, color: colors.danger, margin: '0 0 4px' }}
        >
          Pojazdy do usunięcia ({rows.length})
        </Text>
        {rows.map((r) => (
          <Text key={r.plateNumber} style={cell}>
            <span style={{ fontWeight: 600 }}>{r.plateNumber}</span>
            {r.sideNumber ? ` (${r.sideNumber})` : ''}
            {' — '}
            {r.carrierName}
            {' · od '}
            {r.anchorLabel}
            {' · '}
            <span style={{ color: colors.danger, fontWeight: 600 }}>
              {daysLabel(r.daysSinceReturn)} bez wyjazdu
            </span>
          </Text>
        ))}
      </Section>
    </MailLayout>
  );
}

export default VehicleRemovalAdminEmail;
