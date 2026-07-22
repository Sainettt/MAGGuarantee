// Helpers for `<input type="datetime-local">` <-> API ISO conversion, shared by
// the weryfikator's `/in-transit` and `/returned` dialogs (Step 2 of the
// "precise departure/return times" feature).
//
// ⚠️ Two DIFFERENT storage conventions coexist on the wire, so read carefully:
//
//   • `Delegation.departureAt` is a TRUE UTC instant — the carrier's create form
//     stores `new Date(localWallClock).toISOString()`, and the panel renders it
//     back in browser-local (`formatDateTime`). To show its wall-clock in a
//     picker we must LOCAL-CONVERT (`isoToDatetimeLocal`) — the same offset the
//     display applies — so the widget shows exactly the reported departure time.
//
//   • `Delegation.actualDepartureAt` / `actualReturnAt` are wall-clock LABELED
//     UTC — the verifier types a wall-clock and we append `:00Z`
//     (`datetimeLocalToApiIso`), because the api derives `timeFrom`/`timeTo` as
//     the raw `HH:mm` of the datetime's `T`-part (`toISOString().slice(11,16)`).
//     So their wall-clock IS the raw `T`-part (`actualIsoToDatetimeLocal` slices,
//     never local-converts — that would re-add the offset).
//
// Sending the verifier's wall-clock verbatim (never `toISOString()`, which would
// tz-shift the hour) keeps a punctual outing's derived time == the reported one.

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateToDatetimeLocal(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/**
 * TRUE-UTC ISO instant (e.g. `Delegation.departureAt`) → local wall-clock
 * `YYYY-MM-DDTHH:mm` for a `datetime-local` input. Mirrors `formatDateTime`, so
 * the picker shows the same reported time the verifier sees on the trip card.
 */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateToDatetimeLocal(d);
}

/** Current local wall-clock as `YYYY-MM-DDTHH:mm` (max/now bound for the guard). */
export function nowDatetimeLocal(): string {
  return dateToDatetimeLocal(new Date());
}

/**
 * Wall-clock-as-UTC ISO (e.g. `Delegation.actualDepartureAt`) → its wall-clock
 * `YYYY-MM-DDTHH:mm`. Raw `T`-part slice — these were written as wall-clock+`Z`,
 * so local-converting would wrongly re-add the timezone offset.
 */
export function actualIsoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

/**
 * `datetime-local` value (`YYYY-MM-DDTHH:mm`, no tz) → the api's
 * `z.string().datetime()` shape by appending `:00Z`. Sends the wall-clock the
 * verifier typed VERBATIM (see the header note) — `2026-08-01T08:30` →
 * `2026-08-01T08:30:00Z`. Empty input → empty string (the caller gate rejects).
 */
export function datetimeLocalToApiIso(value: string): string {
  if (!value) return '';
  // Normalise away any seconds a browser might append when a `step` is set.
  return `${value.slice(0, 16)}:00Z`;
}
