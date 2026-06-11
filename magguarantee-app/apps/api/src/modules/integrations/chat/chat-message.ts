/**
 * Pure formatter for the Google Chat wyjazd-notification message.
 *
 * Produces EXACTLY four lines (no trailing newline), per the locked contract
 * in docs/16-jobs-and-integrations.md#google-chat-notifications:
 *
 *   WYJAZD: <departureAt DD/MM/YYYY HH:MM> / <departureCountry> / <departurePostalCode>
 *   ZJAZD: <plannedReturnAt DD/MM/YYYY> / <returnCountry> / <returnPostalCode>
 *   ZESPÓŁ PROWADZĄCY: <planista> / <dyspozytor> / <weryfikator>
 *   OPIEKUN: <opiekun>
 *
 * Rules:
 *   - Dates are rendered in TZ Europe/Warsaw.
 *   - `departureAt` carries a time (HH:MM); `plannedReturnAt` is date-only.
 *   - The ZESPÓŁ line joins ONLY the present team names with ` / ` — any of
 *     planista / dyspozytor / weryfikator may be absent (null/empty) and is
 *     simply omitted (no empty slot, no double slash). If all three are
 *     absent the value after the colon is empty.
 *   - `opiekun` falls back to the em dash `—` when absent.
 *
 * This module is intentionally framework-free so it can be unit-tested in
 * isolation — it is the primary tested piece of the chat feature.
 */

const WARSAW_TZ = 'Europe/Warsaw';
export const OPIEKUN_FALLBACK = '—';

export interface WyjazdMessageContext {
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
  /** `Vehicle.dispatcher.name` — may be null/absent. */
  dyspozytor: string | null;
  /** Single active weryfikator's name — may be null/absent. */
  weryfikator: string | null;
  /** `Carrier.opiekun.name` — falls back to `—` when null/absent. */
  opiekun: string | null;
}

/** Build the 4-line Google Chat message text from the assembled context. */
export function formatWyjazdMessage(ctx: WyjazdMessageContext): string {
  const team = [ctx.planista, ctx.dyspozytor, ctx.weryfikator]
    .map((n) => (n ?? '').trim())
    .filter((n) => n.length > 0)
    .join(' / ');

  const opiekun = (ctx.opiekun ?? '').trim() || OPIEKUN_FALLBACK;

  return [
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
