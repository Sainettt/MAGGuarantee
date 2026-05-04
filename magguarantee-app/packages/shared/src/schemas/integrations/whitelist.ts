// Biała Lista MF (Polish white-list) contract.
//
// Wire surface for `GET /api/v1/integrations/whitelist?nip=...&account=...`
// per docs/13-api-design.md#external-integrations and the upstream REST API
// at https://wl-api.mf.gov.pl/api/check.
//
// Upstream returns a wrapper `{ result: { accountAssigned, ... }, requestId }`.
// We flatten the useful subset onto a stable DTO and keep `requestId` so
// admin tooling can correlate against MF's audit trail if needed.

import { z } from 'zod';

import { IsoDateTimeSchema } from '../common';

/** Polish NIP — 10 digits. */
export const NipSchema = z.string().regex(/^\d{10}$/, 'NIP must be 10 digits');
export type Nip = z.infer<typeof NipSchema>;

/**
 * Alias of {@link NipSchema} re-exported under the more explicit name used by
 * domain forms outside the white-list module (e.g. carrier create/update DTOs
 * accept a Polish NIP). Single source of truth — any change to the regex
 * happens here and propagates everywhere.
 */
export const PolishNipSchema = NipSchema;
export type PolishNip = Nip;

/** Polish bank-account number — 26 digits (IBAN-style without country prefix). */
export const PolishBankAccountSchema = z
  .string()
  .regex(/^\d{26}$/, 'Bank account must be 26 digits');
export type PolishBankAccount = z.infer<typeof PolishBankAccountSchema>;

/**
 * Query params: nip and account (digits only). Both required.
 * `nip` may be sent with whitespace from forms — strip on receipt.
 */
export const WhiteListQuerySchema = z
  .object({
    nip: NipSchema,
    account: PolishBankAccountSchema,
  })
  .strict();
export type WhiteListQuery = z.infer<typeof WhiteListQuerySchema>;

/**
 * Stable response DTO. Notable fields:
 *   - `accountAssigned`: 'TAK' | 'NIE' | 'NIE_NA_BIALEJ_LISCIE' from upstream;
 *      we coerce to a simple boolean for UI consumption (TRUE iff TAK).
 *   - `accountAssignedRaw`: the original string for diagnostic display.
 *   - `requestId` / `requestDateTime`: MF audit handles. Keep verbatim.
 */
export const WhiteListResponseSchema = z.object({
  nip: z.string(),
  account: z.string(),
  accountAssigned: z.boolean(),
  accountAssignedRaw: z.string().nullable(),
  requestId: z.string().nullable(),
  requestDateTime: z.string().nullable(),
  cachedAt: IsoDateTimeSchema.nullable(),
});
export type WhiteListResponse = z.infer<typeof WhiteListResponseSchema>;
