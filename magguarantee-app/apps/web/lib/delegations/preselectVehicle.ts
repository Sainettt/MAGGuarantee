// UWAGI #3 (2026-10-22) — the carrier dashboard's «Zgłoś wyjazd» CTA
// (<GuaranteeStatusRow>) deep-links to `/carrier/delegations/new?vehicleId=<id>`.
// This is the pure decision behind that preselect: given the raw URL value and
// the carrier's (active-only) fleet, return the tractor id to put into the
// form's `vehicleId`, or `null` to leave the field alone.
//
// Extracted from the page so it is unit-testable: vitest here is node-only
// with no React plugin (see vitest.config.ts).

/**
 * Raw `searchParams[key]` as Next.js hands it to a page — a repeated key
 * (`?vehicleId=a&vehicleId=b`) arrives as an array.
 */
export type SearchParamValue = string | string[] | null | undefined;

/**
 * Returns `param` when it names a vehicle in `vehicles`, otherwise `null`
 * (missing, empty, or unknown — e.g. a deactivated tractor or a stale link
 * from another carrier's fleet). The caller ignores `null` silently: the
 * select keeps whatever the draft / defaults put there.
 *
 * A repeated key resolves to its first value, mirroring
 * `URLSearchParams.get()`.
 */
export function pickPreselectedVehicleId(
  param: SearchParamValue,
  vehicles: ReadonlyArray<{ id: string }>,
): string | null {
  const id = Array.isArray(param) ? param[0] : param;
  if (!id) return null;
  return vehicles.some((v) => v.id === id) ? id : null;
}
