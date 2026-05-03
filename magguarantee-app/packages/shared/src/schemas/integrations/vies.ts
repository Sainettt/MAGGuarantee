// VIES VAT lookup contract.
//
// Wire surface for `GET /api/v1/integrations/vies/:country/:vat` per
// docs/13-api-design.md#external-integrations and the upstream REST API
// at https://ec.europa.eu/taxation_customs/vies/rest-api.
//
// We expose a *stable subset* of the upstream payload — countryCode, vatNumber,
// valid, name, address, requestDate. Extra upstream fields are passed through
// as `raw` so admin/diag tooling can still see them, but the documented
// contract is the typed properties.
//
// Field semantics:
//   - `valid`: VIES authoritative — false means VAT not active in that country
//     on `requestDate`. UI uses this to gate carrier creation.
//   - `name` / `address`: trader info. Upstream often returns `'---'` for
//     countries that don't disclose (DE for example) — we keep the literal.
//   - `requestDate`: ISO date returned by VIES (NOT our cache time).

import { z } from 'zod';

import { IsoDateSchema, IsoDateTimeSchema } from '../common';

/**
 * Country code path-param for the VIES lookup. Two-letter ISO 3166-1 alpha-2,
 * uppercase. Upstream rejects mismatched casing; we normalize on the way in.
 */
export const ViesCountrySchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/, 'Country must be a 2-letter ISO code');
export type ViesCountry = z.infer<typeof ViesCountrySchema>;

/**
 * VAT number path-param. VIES accepts digits only (sometimes with internal
 * letters for IE/NL), 8–12 chars typical. We allow 4–14 to be permissive.
 */
export const ViesVatSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{4,14}$/, 'VAT must be 4–14 alphanumeric characters');
export type ViesVat = z.infer<typeof ViesVatSchema>;

/**
 * Stable response DTO. `cachedAt` is non-null for cache hits and indicates
 * when WE captured the result — used by UI to show "checked NN minutes ago".
 */
export const ViesLookupResponseSchema = z.object({
  countryCode: z.string(),
  vatNumber: z.string(),
  valid: z.boolean(),
  name: z.string().nullable(),
  address: z.string().nullable(),
  requestDate: IsoDateSchema.nullable(),
  cachedAt: IsoDateTimeSchema.nullable(),
});
export type ViesLookupResponse = z.infer<typeof ViesLookupResponseSchema>;
