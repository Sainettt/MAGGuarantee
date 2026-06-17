// Typed API wrappers for /api/v1/fleet/*.
//
// `GET /fleet/my` is the carrier-scoped aggregate that backs every form
// dropdown (vehicles / drivers / trailers) on the new-claim and
// new-delegation pages. The carrier identity is taken from the JWT.

import type {
  DyspozytorFleetResponse,
  MyFleetResponse,
  PlanistaFleetResponse,
} from '@magguarantee/shared';

import { apiJson } from './client';

export interface GetMyFleetOptions {
  /**
   * Include `active=false` rows. Default `false`. Carrier panel uses this
   * for the new-claim form so a vehicle that was active during the period
   * but got deactivated afterwards stays selectable.
   */
  includeInactive?: boolean;
}

export function getMyFleet(
  opts: GetMyFleetOptions = {},
): Promise<MyFleetResponse> {
  const params = new URLSearchParams();
  if (opts.includeInactive) params.set('includeInactive', 'true');
  const qs = params.toString();
  const path = qs ? `/fleet/my?${qs}` : '/fleet/my';
  return apiJson<MyFleetResponse>(path, { method: 'GET' });
}

/**
 * `GET /fleet/planista` (planista / admin) — the read-only fleet the planista
 * plans: vehicles where `Vehicle.plannerId === user.sub`, plus the drivers and
 * trailers of the owning carriers. Three slim lists in one payload. Scope is
 * server-side (JWT identity); there is no client filter param.
 */
export function getPlanistaFleet(): Promise<PlanistaFleetResponse> {
  return apiJson<PlanistaFleetResponse>('/fleet/planista', { method: 'GET' });
}

/**
 * `GET /fleet/dyspozytor` (dyspozytor / admin) — the read-only fleet the
 * dispatcher operates: vehicles assigned to the dispatcher's TEAM
 * (`Vehicle.dispatchTeamId === user.teamId`; Phase 11), plus
 * drivers/trailers of the owning carriers, a KPI `stats` block and the
 * `stojaceList` idle-vehicle highlight rows. Scope is server-side (JWT
 * identity); there is no client filter param.
 */
export function getDyspozytorFleet(): Promise<DyspozytorFleetResponse> {
  return apiJson<DyspozytorFleetResponse>('/fleet/dyspozytor', {
    method: 'GET',
  });
}
