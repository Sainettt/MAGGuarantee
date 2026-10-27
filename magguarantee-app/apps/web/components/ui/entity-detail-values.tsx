'use client';

// Phase 6 — shared value-formatter helpers for <EntityDetailModal> wrappers.
//
// Each entity-detail wrapper (carrier / vehicle / driver / trailer) maps its
// DTO into the generic shell's `rows` — and every wrapper renders the same
// handful of leaf value shapes: plain text, monospace codes, dates, booleans,
// string lists, and the em-dash placeholder for null/empty. These helpers were
// originally duplicated inside CarrierDetailModal; extracting them here keeps
// the four wrappers identical and DRY (docs/14-design-system.md §6.9).
//
// All helpers return a ReactNode and are rendered inside the generic shell's
// <dd> nodes — never disabled <input>s (§6.5, §6.12).

import type { ReactNode } from 'react';

import { formatDateFull, formatWallClockDate } from '@/lib/format/numbers';

/** Em-dash placeholder for null/empty values, visibly secondary (§6.5). */
export function emptyValue(): ReactNode {
  return <span className="text-text-sub">—</span>;
}

/** Plain string value; em-dash when null/empty. */
export function textValue(value: string | null | undefined): ReactNode {
  const v = value?.trim();
  return v ? v : emptyValue();
}

/** Monospace code value (login, NIP, VAT-ID, IBAN); em-dash when empty. */
export function monoValue(value: string | null | undefined): ReactNode {
  const v = value?.trim();
  return v ? <span className="font-mono">{v}</span> : emptyValue();
}

/** Date-only value rendered via the shared full-date formatter. */
export function dateValue(iso: string | null | undefined): ReactNode {
  return iso ? <span>{formatDateFull(iso)}</span> : emptyValue();
}

/**
 * Wall-clock twin of `dateValue` — for values whose calendar date IS the ISO's
 * UTC date part: wall-clock LABELLED UTC (`actualReturnAt`, and
 * `Vehicle.lastDroveAt` copied from it) and UTC-midnight date-only values
 * (docs/19 #16). Rendered via the UTC-pinned `formatWallClockDate`, so a 23:30
 * return never shows as the next day in a Warsaw browser. Never for true
 * instants — those stay on `dateValue`.
 */
export function wallClockDateValue(iso: string | null | undefined): ReactNode {
  return iso ? <span>{formatWallClockDate(iso)}</span> : emptyValue();
}

/**
 * Boolean value rendered as a localized "Tak" / "Nie" text node — never a
 * checkbox in a read-only surface (§6.5, §6.12). The caller passes the two
 * already-translated labels (`common.yes` / `common.no`) so this module stays
 * free of a `useTranslations` hook and can be a plain function.
 */
export function boolValue(
  value: boolean | null | undefined,
  yesLabel: string,
  noLabel: string,
): ReactNode {
  if (value == null) return emptyValue();
  return <span>{value ? yesLabel : noLabel}</span>;
}

/**
 * String-array value rendered as a readable comma-joined list; em-dash when
 * the array is null/empty. Used for ADR classes, destination/waste countries.
 */
export function listValue(
  values: readonly string[] | null | undefined,
): ReactNode {
  const items = (values ?? []).map((v) => v.trim()).filter(Boolean);
  return items.length > 0 ? <span>{items.join(', ')}</span> : emptyValue();
}
