/**
 * Guarantee Watchdog #18 — opiekun daily digest (plan §6).
 *
 * ONE digest per opiekun per day, grouped by carrier, with two sections:
 *   - "Zbliżające się terminy" — his carriers' vehicles due today (D-3 / D-1).
 *   - "Naruszenia" — episodes newly recorded as violated today (violationSentAt
 *     was null, i.e. this is the first digest to report the breach).
 *
 * Recipient resolves to the opiekun's PERSONAL User.email (not the DAF-OW@
 * group). Design: docs/22-email-design.md.
 */
import * as React from 'react';

import { colors, eyebrowStyle, fontFamily } from './_theme';
import { Block, MailLayout, Paragraph } from './MailLayout';

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

const AMBER = '#8A5A16';

const rowStyle: React.CSSProperties = {
  margin: '0 0 6px 0',
  fontFamily,
  fontSize: 14,
  lineHeight: '20px',
  color: colors.ink,
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
      <p
        style={{
          margin: '14px 0 6px 0',
          fontFamily,
          fontSize: 15,
          lineHeight: '20px',
          fontWeight: 'bold',
          color: colors.ink,
        }}
      >
        {group.carrierName}
      </p>
      {group.rows.map((r) => (
        <p key={r.plateNumber} style={rowStyle}>
          <span style={{ fontWeight: 'bold' }}>{r.plateNumber}</span>
          {' — '}
          {r.anchorLabel}
          {r.anchorSource === 'agreement' ? ' (objęcie gwarancją)' : ' (zjazd)'}
          {' → termin '}
          {r.deadlineLabel}
          {' · '}
          <span style={{ color: accent, fontWeight: 'bold' }}>
            {daysLabel(r.daysLeft)}
          </span>
        </p>
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
      preview={`Gwarancje — ${dateLabel}`}
      overline="Gwarancje"
      title="Przypomnienia i naruszenia"
    >
      <Paragraph>Witaj {opiekunName},</Paragraph>
      <Paragraph>
        Poniżej podsumowanie obowiązku zgłaszania wyjazdów dla Twoich
        przewoźników na dzień {dateLabel}.
      </Paragraph>

      <Block>
        <p style={{ ...eyebrowStyle, color: AMBER, margin: '4px 0 4px 0' }}>
          Zbliżające się terminy
        </p>
        {dueSoon.length > 0 ? (
          dueSoon.map((g) => (
            <CarrierGroup key={g.carrierName} group={g} accent={AMBER} />
          ))
        ) : (
          <p style={{ ...rowStyle, color: colors.text }}>Brak.</p>
        )}
      </Block>

      <Block>
        <p style={{ ...eyebrowStyle, color: colors.brand, margin: '4px 0 4px 0' }}>
          Naruszenia (zarejestrowane dziś)
        </p>
        {violations.length > 0 ? (
          violations.map((g) => (
            <CarrierGroup key={g.carrierName} group={g} accent={colors.brand} />
          ))
        ) : (
          <p style={{ ...rowStyle, color: colors.text }}>Brak.</p>
        )}
      </Block>
    </MailLayout>
  );
}

export default GuaranteeOpiekunDigestEmail;
