// Typed wrappers for /api/v1/integrations/* (VIES, Biała Lista). Schemas
// shipped by api-agent in `@magguarantee/shared`. If endpoints are not yet
// deployed (api-agent ships them in parallel), the wrappers gracefully
// degrade to `INTEGRATION_UNAVAILABLE` so the consuming form keeps working.
//
// All three lookups are POST with a JSON body (audit 2026-08-14 §2): NIP, VAT
// numbers and bank accounts are business identifiers that must not travel in
// URLs, where they end up in access logs, request-logger `url` fields, proxy
// logs and the browser history.

import type {
  ViesLookupResponse,
  WhiteListResponse,
  WhiteListSearchResponse,
} from '@magguarantee/shared';

import { apiJson, ApiResponseError } from './client';

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

/** `POST /integrations/vies/check` — EU VAT number validation. */
export function checkVies(
  country: string,
  vat: string,
): Promise<ViesResult | IntegrationUnavailable> {
  return callOrUnavailable(
    apiJson<ViesResult>('/integrations/vies/check', {
      method: 'POST',
      json: { country, vat },
    }),
  );
}

/** `POST /integrations/whitelist/check` — is `account` declared for `nip`? */
export function checkWhitelist(
  nip: string,
  account: string,
): Promise<WhitelistResult | IntegrationUnavailable> {
  return callOrUnavailable(
    apiJson<WhitelistResult>('/integrations/whitelist/check', {
      method: 'POST',
      json: { nip, account },
    }),
  );
}

/**
 * `POST /integrations/whitelist/search` — look up a Polish company in the
 * Biała Lista MF registry by NIP. Returns the canonical name, address,
 * declared bank accounts and VAT status — used to auto-fill the carrier
 * create/edit form.
 *
 * Non-Polish NIPs / NIPs outside the MF registry return `{ found: false }`;
 * callers should fall back to VIES + manual entry.
 */
export function checkWhitelistSearch(
  nip: string,
): Promise<WhitelistSearchResult | IntegrationUnavailable> {
  return callOrUnavailable(
    apiJson<WhitelistSearchResult>('/integrations/whitelist/search', {
      method: 'POST',
      json: { nip },
    }),
  );
}
