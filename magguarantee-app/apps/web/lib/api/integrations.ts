// Typed wrappers for /api/v1/integrations/* (VIES, Biała Lista). Schemas
// shipped by api-agent in `@magguarantee/shared`. If endpoints are not yet
// deployed (api-agent ships them in parallel), the wrappers gracefully
// degrade to `INTEGRATION_UNAVAILABLE` so the consuming form keeps working.

import type {
  ViesLookupResponse,
  WhiteListResponse,
} from '@magguarantee/shared';

import { apiJson, ApiResponseError } from './client';
import { toQuery } from './query';

export type ViesResult = ViesLookupResponse;
export type WhitelistResult = WhiteListResponse;

/** "Service unavailable" sentinel — caller maps to the warning badge. */
export const INTEGRATION_UNAVAILABLE = Symbol('INTEGRATION_UNAVAILABLE');
export type IntegrationUnavailable = typeof INTEGRATION_UNAVAILABLE;

async function callOrUnavailable<T>(
  promise: Promise<T>,
): Promise<T | IntegrationUnavailable> {
  try {
    return await promise;
  } catch (err) {
    // 401 → re-throw so the auth refresh interceptor can do its job.
    // Anything else (404 / 5xx / network) → "service unavailable" so the
    // form badge degrades gracefully without blocking submit.
    if (err instanceof ApiResponseError && err.status === 401) throw err;
    return INTEGRATION_UNAVAILABLE;
  }
}

export function checkVies(
  country: string,
  vat: string,
): Promise<ViesResult | IntegrationUnavailable> {
  return callOrUnavailable(
    apiJson<ViesResult>(
      `/integrations/vies/${encodeURIComponent(country)}/${encodeURIComponent(vat)}`,
      { method: 'GET' },
    ),
  );
}

export function checkWhitelist(
  nip: string,
  account: string,
): Promise<WhitelistResult | IntegrationUnavailable> {
  return callOrUnavailable(
    apiJson<WhitelistResult>(
      `/integrations/whitelist${toQuery({ nip, account })}`,
      { method: 'GET' },
    ),
  );
}
