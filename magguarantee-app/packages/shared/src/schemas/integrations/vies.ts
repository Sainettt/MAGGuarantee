// VIES VAT lookup contract.
//
// Wire surface for `POST /api/v1/integrations/vies/check` (body
// `{ country, vat }`) per docs/13-api-design.md#external-integrations and the
// upstream REST API at https://ec.europa.eu/taxation_customs/vies/rest-api.
//
// The VAT number used to travel in the URL path (`GET /vies/:country/:vat`),
// which put it in every access/proxy log line. Since the 2026-09-14 logging
// audit (item 2) it travels in the request body; the lookup stays read-only.
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
 * Country code field of the VIES lookup body. Two-letter ISO 3166-1 alpha-2,
 * uppercase. Upstream rejects mismatched casing; we normalize on the way in.
 */
export const ViesCountrySchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/, 'Country must be a 2-letter ISO code');
export type ViesCountry = z.infer<typeof ViesCountrySchema>;

/**
 * VAT number field of the VIES lookup body. VIES accepts digits only
 * (sometimes with internal letters for IE/NL), 8–12 chars typical. We allow
 * 4–14 to be permissive.
 */
export const ViesVatSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{4,14}$/, 'VAT must be 4–14 alphanumeric characters');
export type ViesVat = z.infer<typeof ViesVatSchema>;

/** Request body for `POST /integrations/vies/check`. */
export const ViesCheckBodySchema = z
  .object({
    country: ViesCountrySchema,
    vat: ViesVatSchema,
  })
  .strict();
export type ViesCheckBody = z.infer<typeof ViesCheckBodySchema>;

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
