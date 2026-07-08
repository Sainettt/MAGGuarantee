/**
 * Pure formatter for the Google Chat wyjazd-notification message.
 *
 * Produces EXACTLY six lines (no trailing newline), per the locked contract
 * in docs/16-jobs-and-integrations.md#google-chat-notifications:
 *
 *   ZESTAW: <plateNumber> / <trailerPlate> / <sideNumber?> / <gpsMobilePhone>
 *   KIEROWCA: <driverName> / <driverPhone>
 *   WYJAZD: <departureAt DD/MM/YYYY HH:MM> / <departureCountry> / <departurePostalCode>
 *   ZJAZD: <plannedReturnAt DD/MM/YYYY> / <returnCountry> / <returnPostalCode>
 *   ZESPÓŁ PROWADZĄCY: <planista> / <dispatcher 1> / <dispatcher 2> / …
 *   OPIEKUN: <opiekun>
 *
 * The two leading lines (`ZESTAW` / `KIEROWCA`) were added 2026-06-17 to match
 * the real chat screen confirmed by the user. Phase 11 rework: the team line is
 * `planista / <every dispatcher name of the vehicle's dispatch TEAM>`. The
 * legacy `weryfikator` slot was REMOVED (the role is no longer per-wyjazd; see
 * docs/16-jobs-and-integrations.md).
 *
 * Rules:
 *   - Dates are rendered in TZ Europe/Warsaw.
 *   - `departureAt` carries a time (HH:MM); `plannedReturnAt` is date-only.
 *   - ZESTAW joins the present segments with ` / `. `sideNumber` AND
 *     `gpsMobilePhone` are nullable — when null/blank their segment is OMITTED
 *     (no empty slot, no double slash), the same rule as the ZESPÓŁ line.
 *     `plateNumber` and `trailerPlate` are always present.
 *   - KIEROWCA renders `<name> / <phone>`; the driver is always present
 *     (`Delegation.driverId` is NOT NULL), so there is no em-dash fallback —
 *     the builder resolves name/phone from the snapshot, falling back to the
 *     driver relation.
 *   - The ZESPÓŁ line joins ONLY the present names with ` / ` — the planista or
 *     any dispatcher may be absent (null/empty) and is simply omitted (no empty
 *     slot, no double slash). If the team is empty and there is no planista the
 *     value after the colon is empty.
 *   - `opiekun` falls back to the em dash `—` when absent.
 *
 * This module is intentionally framework-free so it can be unit-tested in
 * isolation — it is the primary tested piece of the chat feature.
 */

const WARSAW_TZ = 'Europe/Warsaw';
export const OPIEKUN_FALLBACK = '—';

export interface WyjazdMessageContext {
  /** `Vehicle.plateNumber` — tractor plate (always present). */
  plateNumber: string;
  /** `Delegation.trailer.plateNumber` — trailer plate (always present). */
  trailerPlate: string;
  /**
   * `Vehicle.sideNumber` (NrBoczny) — nullable. When null/blank its ZESTAW
   * segment is omitted (no empty slot, no double slash).
   */
  sideNumber: string | null;
  /**
   * `Vehicle.gpsMobilePhone` — tracker device id. Nullable again since 2026-07
   * (not every vehicle carries a GPS device). When null/blank its ZESTAW
   * segment is omitted gracefully (no empty slot, no double slash).
   */
  gpsMobilePhone: string | null;
  /**
   * Driver display name — `Delegation.driverNameSnapshot` with a fallback to
   * `driver.firstName + ' ' + driver.lastName`, resolved by the context
   * builder. Always present (the delegation always has a driver).
   */
  driverName: string;
  /**
   * Driver phone — `Delegation.driverPhoneSnapshot` with a fallback to
   * `driver.phone`, resolved by the context builder. Always present.
   */
  driverPhone: string;
  /** Full departure timestamp (rendered with date + time). */
  departureAt: Date;
  departureCountry: string;
  departurePostalCode: string;
  /** Planned return — date-only (rendered without time). */
  plannedReturnAt: Date;
  returnCountry: string;
  returnPostalCode: string;
  /** `Vehicle.planner.name` — may be null/absent. */
  planista: string | null;
  /**
   * Phase 11 — the names of ALL dispatchers on the vehicle's dispatch TEAM
   * (`Vehicle.dispatchTeam.dispatchers[].name`). May be empty (team unassigned
   * or has no members); individual null/blank names are dropped by the
   * formatter. Replaces the single `dyspozytor` field.
   */
  dyspozytorzy: (string | null)[];
  /** `Carrier.opiekun.name` — falls back to `—` when null/absent. */
  opiekun: string | null;
}

/** Build the 6-line Google Chat message text from the assembled context. */
export function formatWyjazdMessage(ctx: WyjazdMessageContext): string {
  // ZESTAW — tractor / trailer / [side number, omitted if blank] / device id.
  // Same omit-when-blank rule as the ZESPÓŁ line: no empty slot, no `//`.
  const zestaw = [
    ctx.plateNumber,
    ctx.trailerPlate,
    ctx.sideNumber,
    ctx.gpsMobilePhone,
  ]
    .map((n) => (n ?? '').trim())
    .filter((n) => n.length > 0)
    .join(' / ');

  // Phase 11 — planista + every team dispatcher; weryfikator removed. Blank /
  // null names are dropped (no empty slot, no double slash).
  const team = [ctx.planista, ...ctx.dyspozytorzy]
    .map((n) => (n ?? '').trim())
    .filter((n) => n.length > 0)
    .join(' / ');

  const opiekun = (ctx.opiekun ?? '').trim() || OPIEKUN_FALLBACK;

  return [
    `ZESTAW: ${zestaw}`,
    `KIEROWCA: ${ctx.driverName} / ${ctx.driverPhone}`,
    `WYJAZD: ${formatDateTimeWarsaw(ctx.departureAt)} / ${ctx.departureCountry} / ${ctx.departurePostalCode}`,
    `ZJAZD: ${formatDateWarsaw(ctx.plannedReturnAt)} / ${ctx.returnCountry} / ${ctx.returnPostalCode}`,
    `ZESPÓŁ PROWADZĄCY: ${team}`,
    `OPIEKUN: ${opiekun}`,
  ].join('\n');
}

/** `DD/MM/YYYY HH:MM` in Europe/Warsaw. */
export function formatDateTimeWarsaw(date: Date): string {
  const p = warsawParts(date);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** `DD/MM/YYYY` in Europe/Warsaw (date-only). */
export function formatDateWarsaw(date: Date): string {
  const p = warsawParts(date);
  return `${p.day}/${p.month}/${p.year}`;
}

interface WarsawParts {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
}

/**
 * Decompose a `Date` into zero-padded Warsaw-local calendar parts via
 * `Intl.DateTimeFormat` (handles DST + the offset correctly, no manual
 * arithmetic — the canonical approach in this codebase). `hourCycle: 'h23'`
 * keeps midnight as `00` rather than `24`.
 */
function warsawParts(date: Date): WarsawParts {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: WARSAW_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    day: pick('day'),
    month: pick('month'),
    year: pick('year'),
    hour: pick('hour'),
    minute: pick('minute'),
  };
}
