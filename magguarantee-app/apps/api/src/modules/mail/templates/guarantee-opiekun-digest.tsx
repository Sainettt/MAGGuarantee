/**
 * Guarantee Watchdog #18 — opiekun daily digest (plan §6).
 *
 * ONE digest per opiekun per day, grouped by carrier, with two sections:
 *   - "Zbliżające się terminy" — his carriers' vehicles due today (D-3 / D-1).
 *   - "Naruszenia" — episodes newly recorded as violated today (violationSentAt
 *     was null, i.e. this is the first digest to report the breach).
 *
 * Recipient resolves to the opiekun's PERSONAL User.email (not the DAF-OW@
 * group). Modeled on the Phase-9 `MailLayout` chrome.
 */
import { Section, Text } from '@react-email/components';
import * as React from 'react';

import { colors, labelStyle, sectionStyle } from './_theme';
import { MailLayout } from './MailLayout';

/** One vehicle row within a carrier group. */
export interface GuaranteeOpiekunVehicleRow {
  plateNumber: string;
  /** Formatted anchor date (dd.MM.yyyy). */
  anchorLabel: string;
  anchorSource: 'zjechal' | 'agreement';
  /** Formatted deadline date (dd.MM.yyyy). */
  deadlineLabel: string;
  /** Working days left (signed; < 0 in the violations section). */
  daysLeft: number;
}

/** A carrier's grouped rows for one digest section. */
export interface GuaranteeOpiekunCarrierGroup {
  carrierName: string;
  rows: GuaranteeOpiekunVehicleRow[];
}

export interface GuaranteeOpiekunDigestProps {
  /** Opiekun display name. */
  opiekunName: string;
  /** Formatted "today" (dd.MM.yyyy) for the subject/preview. */
  dateLabel: string;
  /** Carriers with vehicles approaching the deadline today (D-3 / D-1). */
  dueSoon: GuaranteeOpiekunCarrierGroup[];
  /** Carriers with episodes newly recorded as violated today. */
  violations: GuaranteeOpiekunCarrierGroup[];
}

const cell: React.CSSProperties = {
  fontSize: 14,
  color: colors.ink,
  padding: '4px 12px 4px 0',
  lineHeight: 1.4,
};

function daysLabel(n: number): string {
  if (n < 0) return 'po terminie';
  if (n === 1) return 'zostaje 1 dzień roboczy';
  if (n >= 2 && n <= 4) return `zostają ${n} dni robocze`;
  return `zostaje ${n} dni roboczych`;
}

function CarrierGroup({
  group,
  accent,
}: {
  group: GuaranteeOpiekunCarrierGroup;
  accent: string;
}): React.ReactElement {
  return (
    <>
      <Text
        style={{
          fontSize: 15,
          fontWeight: 700,
          margin: '12px 0 4px',
          color: colors.ink,
        }}
      >
        {group.carrierName}
      </Text>
      {group.rows.map((r) => (
        <Text key={r.plateNumber} style={cell}>
          <span style={{ fontWeight: 600 }}>{r.plateNumber}</span>
          {' — '}
          {r.anchorLabel}
          {r.anchorSource === 'agreement' ? ' (objęcie gwarancją)' : ' (zjazd)'}
          {' → termin '}
          {r.deadlineLabel}
          {' · '}
          <span style={{ color: accent, fontWeight: 600 }}>
            {daysLabel(r.daysLeft)}
          </span>
        </Text>
      ))}
    </>
  );
}

export function GuaranteeOpiekunDigestEmail({
  opiekunName,
  dateLabel,
  dueSoon,
  violations,
}: GuaranteeOpiekunDigestProps): React.ReactElement {
  return (
    <MailLayout
      title="Gwarancje: przypomnienia i naruszenia"
      preview={`Gwarancje — ${dateLabel}`}
      tone="brand"
    >
      <Section style={sectionStyle}>
        <Text style={{ margin: '0 0 8px' }}>Witaj {opiekunName},</Text>
        <Text style={{ margin: '0 0 4px' }}>
          Poniżej podsumowanie obowiązku zgłaszania wyjazdów dla Twoich
          przewoźników na dzień {dateLabel}.
        </Text>
      </Section>

      <Section style={sectionStyle}>
        <Text style={{ ...labelStyle, color: colors.warning, margin: '0 0 4px' }}>
          Zbliżające się terminy
        </Text>
        {dueSoon.length > 0 ? (
          dueSoon.map((g) => (
            <CarrierGroup key={g.carrierName} group={g} accent={colors.warning} />
          ))
        ) : (
          <Text style={{ ...cell, color: colors.inkMuted }}>Brak.</Text>
        )}
      </Section>

      <Section style={sectionStyle}>
        <Text style={{ ...labelStyle, color: colors.danger, margin: '0 0 4px' }}>
          Naruszenia (zarejestrowane dziś)
        </Text>
        {violations.length > 0 ? (
          violations.map((g) => (
            <CarrierGroup key={g.carrierName} group={g} accent={colors.danger} />
          ))
        ) : (
          <Text style={{ ...cell, color: colors.inkMuted }}>Brak.</Text>
        )}
      </Section>
    </MailLayout>
  );
}

export default GuaranteeOpiekunDigestEmail;
