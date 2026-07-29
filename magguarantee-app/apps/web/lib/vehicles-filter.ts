// Shared contract for the `/employee/vehicles` list filters that travel in the
// URL — the KPI-tile drill-down (docs/14 §15).
//
// The vehicles page treats the query string as the SOURCE OF TRUTH for the two
// deep-linkable filters (status + carrier), so a tile link, a manual edit of the
// `<Select>` and the back button all end up in the same state. `q` (search)
// deliberately stays component-local: typing must not push history entries.
//
// Keeping the param names + the parser here means the producers (KPI tiles on
// «Moja opieka», the per-carrier card stats) and the consumer (the vehicles
// page) can never drift on spelling.

import {
  VehicleLifecycleStatusSchema,
  type VehicleLifecycleStatus,
} from '@magguarantee/shared';

/** `?status=` — one `VehicleLifecycleStatus`; anything else is ignored. */
export const VEHICLE_STATUS_PARAM = 'status';

/** `?carrier=` — a carrier id (the same value the carrier `<Select>` holds). */
export const VEHICLE_CARRIER_PARAM = 'carrier';

/** The five buckets, in the order the filter `<Select>` lists them. */
export const VEHICLE_STATUS_OPTIONS: readonly VehicleLifecycleStatus[] = [
  'aktywna',
  'stojaca',
  'nieaktywna',
  'do_usuniecia',
  'wylaczona',
];

/**
 * Narrows a raw `?status=` value to a known lifecycle status. An unknown /
 * missing value yields `null` (= no status filter) rather than an error — a
 * hand-edited URL should degrade to the unfiltered list, not blow up the page.
 */
export function parseVehicleStatusParam(
  raw: string | null | undefined,
): VehicleLifecycleStatus | null {
  const parsed = VehicleLifecycleStatusSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Builds a link into the vehicles list pre-filtered by status and/or carrier.
 * Empty options produce the bare list path (no dangling `?`).
 */
export function vehiclesListHref(options: {
  status?: VehicleLifecycleStatus | null;
  carrierId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (options.status) params.set(VEHICLE_STATUS_PARAM, options.status);
  if (options.carrierId) params.set(VEHICLE_CARRIER_PARAM, options.carrierId);
  const qs = params.toString();
  return qs ? `/employee/vehicles?${qs}` : '/employee/vehicles';
}
