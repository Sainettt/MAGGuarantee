/**
 * Vehicle-removal admin digest (vehicle-status rework, Step B — Part 3).
 *
 * ONE digest per ACTIVE admin per cron run, listing every LIVE vehicle whose
 * derived lifecycle status is `do_usuniecia` (idle ≥ the shared threshold, i.e.
 * ≥29 calendar days since its last return). The cron re-sends every N days
 * (`VEHICLE_REMOVAL_ALERT_REPEAT_DAYS`) until the vehicle leaves the
 * `do_usuniecia` bucket (a new wyjazd / deactivation / removal).
 *
 * Recipient resolves to the admin's PERSONAL `User.email`. Design:
 * docs/22-email-design.md.
 */
import * as React from 'react';

import { colors, eyebrowStyle, fontFamily } from './_theme';
import { Block, MailLayout, Paragraph } from './MailLayout';

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

const rowStyle: React.CSSProperties = {
  margin: '0 0 6px 0',
  fontFamily,
  fontSize: 14,
  lineHeight: '20px',
  color: colors.ink,
};

function daysLabel(n: number): string {
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
      preview={`Pojazdy do usunięcia — ${dateLabel} (${rows.length})`}
      overline="Flota"
      title="Pojazdy do usunięcia"
      badge={{ tone: 'danger', label: `${rows.length} do przeglądu` }}
    >
      <Paragraph>Witaj {adminName},</Paragraph>
      <Paragraph>
        Poniższe pojazdy są nieaktywne co najmniej {thresholdDays} dni
        kalendarzowych (status „do usunięcia”) na dzień {dateLabel}. Zweryfikuj,
        czy powinny zostać usunięte z systemu.
      </Paragraph>

      <Block>
        <p style={{ ...eyebrowStyle, color: colors.brand, margin: '4px 0 10px 0' }}>
          Pojazdy do usunięcia ({rows.length})
        </p>
        {rows.map((r) => (
          <p key={r.plateNumber} style={rowStyle}>
            <span style={{ fontWeight: 'bold' }}>{r.plateNumber}</span>
            {r.sideNumber ? ` (${r.sideNumber})` : ''}
            {' — '}
            {r.carrierName}
            {' · od '}
            {r.anchorLabel}
            {' · '}
            <span style={{ color: colors.brand, fontWeight: 'bold' }}>
              {daysLabel(r.daysSinceReturn)} bez wyjazdu
            </span>
          </p>
        ))}
      </Block>
    </MailLayout>
  );
}

export default VehicleRemovalAdminEmail;
