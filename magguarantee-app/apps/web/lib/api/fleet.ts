// Typed API wrappers for /api/v1/fleet/*.
//
// `GET /fleet/my` is the carrier-scoped aggregate that backs every form
// dropdown (vehicles / drivers / trailers) on the new-claim and
// new-delegation pages. The carrier identity is taken from the JWT.

import type { MyFleetResponse } from '@magguarantee/shared';

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
