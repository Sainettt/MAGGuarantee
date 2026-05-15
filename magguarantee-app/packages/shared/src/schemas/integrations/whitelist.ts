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

// ─── Search-by-NIP ────────────────────────────────────────
//
// Wire surface for `GET /api/v1/integrations/whitelist/search?nip=...`
// per docs/13-api-design.md#external-integrations and the upstream REST
// API at https://wl-api.mf.gov.pl/api/search/nip/{NIP}.
//
// Use-case: auto-fill of carrier company data (name, address, account
// numbers) once the user enters a Polish NIP — saves the carrier-creation
// form from manual transcription and keeps records aligned with the MF
// register. Non-Polish NIPs return `{ found: false }`; that is NOT an
// error, the caller is expected to fall back to manual entry.

/**
 * Query params for `/whitelist/search`. We deliberately reuse the same
 * NIP shape as `TaxIdSchema` would in the carriers DTO — the upstream
 * only knows about Polish NIPs but we don't pre-validate strictly here;
 * any non-conformant value just yields `{ found: false }`.
 *
 * Length bounds mirror `TaxIdSchema` (5..20) so the form can post the
 * raw input without trimming the country prefix first. The strict
 * 10-digit format check is left to the upstream registry.
 */
export const WhiteListSearchQuerySchema = z
  .object({
    nip: z.string().min(5).max(20),
  })
  .strict();
export type WhiteListSearchQuery = z.infer<typeof WhiteListSearchQuerySchema>;

/**
 * Stable response DTO for `/whitelist/search`.
 *
 *   - `found`: convenience flag — `true` iff upstream returned a non-null
 *     subject. `false` covers both `result.subject = null` (NIP unknown)
 *     and upstream `404` (NIP outside the MF registry, e.g. foreign).
 *   - `name`, `address`, `accountNumbers`, `statusVat`: flattened from
 *     `result.subject`. `address` picks `residenceAddress` first, then
 *     falls back to `workingAddress` per the MF schema.
 *   - `accountNumbers`: array of digit-strings as MF returns them. The
 *     consumer doesn't know which is EUR vs PLN — we don't try to guess.
 *   - `requestId` / `requestDateTime`: MF audit metadata. Kept verbatim
 *     in case we ever need to attach proof of due-diligence to a claim.
 *   - `cachedAt`: our Redis timestamp; `null` on a fresh fetch.
 */
export const WhiteListSearchResponseSchema = z.object({
  found: z.boolean(),
  nip: z.string(),
  name: z.string().nullable(),
  address: z.string().nullable(),
  accountNumbers: z.array(z.string()),
  statusVat: z.string().nullable(),
  requestId: z.string().nullable(),
  requestDateTime: z.string().nullable(),
  cachedAt: IsoDateTimeSchema.nullable(),
});
export type WhiteListSearchResponse = z.infer<
  typeof WhiteListSearchResponseSchema
>;
