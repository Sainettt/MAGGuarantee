// Typed wrappers for /api/v1/integrations/* (VIES, Biała Lista). Schemas
// shipped by api-agent in `@magguarantee/shared`. If endpoints are not yet
// deployed (api-agent ships them in parallel), the wrappers gracefully
// degrade to `INTEGRATION_UNAVAILABLE` so the consuming form keeps working.

import type {
  ViesLookupResponse,
  WhiteListResponse,
  WhiteListSearchResponse,
} from '@magguarantee/shared';

import { apiJson, ApiResponseError } from './client';
import { toQuery } from './query';

export type ViesResult = ViesLookupResponse;
export type WhitelistResult = WhiteListResponse;
export type WhitelistSearchResult = WhiteListSearchResponse;

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

/**
 * Look up a Polish company in the Biała Lista MF registry by NIP. Returns
 * the canonical name, address, declared bank accounts and VAT status —
 * used to auto-fill the carrier create/edit form.
 *
 * Non-Polish NIPs / NIPs outside the MF registry return `{ found: false }`;
 * callers should fall back to VIES + manual entry.
 */
export function checkWhitelistSearch(
  nip: string,
): Promise<WhitelistSearchResult | IntegrationUnavailable> {
  return callOrUnavailable(
    apiJson<WhitelistSearchResult>(
      `/integrations/whitelist/search${toQuery({ nip })}`,
      { method: 'GET' },
    ),
  );
}
