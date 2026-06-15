// Phase 3 / Phase 5 — Fleet aggregates DTO contracts.
//
// Source of truth for `/api/v1/fleet/my` (Phase 3) and `/api/v1/fleet/opiekun`
// (Phase 5) per docs/13-api-design.md§Fleet.
//
// `/fleet/my` returns the carrier's own active vehicles, drivers, trailers in
// one shot so the new-claim form / new-delegation form can populate dropdowns
// without three separate round-trips (collapses three legacy `getMyFleet*`
// calls into one).
//
// `/fleet/opiekun` returns per-carrier fleet aggregates for the opiekun
// dashboard — carrier identity + vehicle classification buckets (jezdzace /
// stojace / nieaktywne / potencjalne) mirroring `Code.gs:2733-2820`
// (`getOpiekunFleet`). Admin callers see every carrier, opiekun callers see
// only carriers where `Carrier.opiekunId === user.sub`.
//
// Slim list shapes are reused by other endpoints when only a "picker" view
// is needed; the full per-domain DTOs live in `vehicles.ts` / `drivers.ts`
// / `trailers.ts` and are returned by the dedicated CRUD endpoints.

import { z } from 'zod';

import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from './common';

// ─── Slim list-item shapes ───────────────────────────────

/**
 * Picker-friendly vehicle row: just enough to render `<select>` options,
 * group by carrier and decide whether the row is eligible for selection
 * (`active` + `gps`).
 *
 * Phase 6.4 — enriched (ADDITIVE) with a curated, NON-SENSITIVE field set so
 * the planista/dyspozytor read-only fleet detail modals render from the list
 * payload they already hold (docs/14-design-system.md §6.4.2). The added
 * fields ALSO widen the carrier `/fleet/my` payload — acceptable: every added
 * field is non-sensitive and the carrier owns its own fleet.
 *
 * HARD EXCLUSION (§6.4.2): NEVER add `rateDe`/`rateUe`/`rateExport`/
 * `rateImport` — planista/dyspozytor must not see pricing. `gpsMobilePhone`
 * keeps its exact (misnamed) field name — it is the GPS tracker device ID,
 * NOT a phone number (docs/19-known-quirks.md #2). `lastDroveAt` is
 * display-only here (#11).
 */
export const VehicleListItemSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
  active: z.boolean(),
  type: z.enum(['MEGA', 'STD', 'COIL']).nullable(),
  sideNumber: z.string().nullable(),
  // ── Phase 6.4 additive fields (§6.4.2) ──
  euro: z.enum(['V', 'VI']),
  certificateL: z.boolean(),
  gps: z.boolean(),
  /** GPS tracker device ID (misnamed column — quirk #2). NOT a phone number. */
  gpsMobilePhone: z.string().nullable(),
  fuelCard: z.boolean(),
  agreement: z.boolean().nullable(),
  adr: z.boolean(),
  wasteAllowed: z.boolean(),
  wasteCountries: z.array(z.string()),
  cabotageDe: z.boolean(),
  cabotageFr: z.boolean(),
  gb: z.boolean().nullable(),
  it: z.boolean().nullable(),
  fr: z.boolean().nullable(),
  /** Display-only (quirk #11). ISO datetime; null when never reported. */
  lastDroveAt: IsoDateTimeSchema.nullable(),
  notes: z.string().nullable(),
});
export type VehicleListItem = z.infer<typeof VehicleListItemSchema>;

export const DriverListItemSchema = z.object({
  id: UuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  active: z.boolean(),
  /** ISO date — used to flag drivers whose license is about to expire. */
  licenseExpiry: IsoDateSchema.nullable(),
  // ── Phase 6.4 additive fields (§6.4.2) — NO `bankAccount` ──
  phone2: z.string().nullable(),
  email: z.string().nullable(),
  idDocumentNumber: z.string(),
  adr: z.boolean(),
  notes: z.string().nullable(),
});
export type DriverListItem = z.infer<typeof DriverListItemSchema>;

export const TrailerListItemSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
  active: z.boolean(),
  trailerTypeId: UuidSchema,
  trailerTypeName: z.string(),
  // ── Phase 6.4 additive fields (§6.4.2) ──
  belts: z.boolean().nullable(),
  beltsCount: z.number().int().nullable(),
  mats: z.boolean().nullable(),
  matsCount: z.number().int().nullable(),
  innerLength: z.number().nullable(),
  innerWidth: z.number().nullable(),
  innerHeight: z.number().nullable(),
  capacity: z.number().nullable(),
  airSuspension: z.boolean().nullable(),
  certXl: z.boolean().nullable(),
  multilock: z.boolean().nullable(),
  notes: z.string().nullable(),
});
export type TrailerListItem = z.infer<typeof TrailerListItemSchema>;

// ─── GET /fleet/my ───────────────────────────────────────

/**
 * Query params for `GET /fleet/my`.
 *
 * - `includeInactive`: when `true`, the response includes `active=false`
 *   rows. Default `false` (active-only) — matches the new-delegation use
 *   case where you can only register trips on operational vehicles. The
 *   new-claim form opts in (`includeInactive=true`) because a wniosek may
 *   legitimately reference a vehicle that was active during the period
 *   and got deactivated afterwards but before the carrier submitted.
 */
export const MyFleetQuerySchema = z
  .object({
    includeInactive: z
      .union([z.boolean(), z.literal('true'), z.literal('false')])
      .transform((v) => v === true || v === 'true')
      .optional()
      .default(false),
  })
  .strict();
export type MyFleetQuery = z.infer<typeof MyFleetQuerySchema>;

/**
 * Response for `GET /fleet/my` (carrier role) — three lists in one
 * payload. The service filters to `carrierId = currentUser.carrierId`
 * and `active = true` by default; pass `?includeInactive=true` to also
 * receive deactivated rows (used by the new-claim form so historical
 * vehicles remain selectable for past-period claims).
 */
export const MyFleetResponseSchema = z.object({
  vehicles: z.array(VehicleListItemSchema),
  drivers: z.array(DriverListItemSchema),
  trailers: z.array(TrailerListItemSchema),
});
export type MyFleetResponse = z.infer<typeof MyFleetResponseSchema>;

// ─── GET /fleet/opiekun ──────────────────────────────────

/**
 * Query params for `GET /fleet/opiekun`. Currently empty — the response is
 * always the full opiekun-scoped (or admin-wide) carrier list. Kept as a
 * dedicated schema so future filters (e.g. `?carrierId=...` to drill down)
 * can land without churning the controller wiring.
 */
export const OpiekunFleetQuerySchema = z.object({}).strict();
export type OpiekunFleetQuery = z.infer<typeof OpiekunFleetQuerySchema>;

/**
 * Per-carrier vehicle classification — mirrors the four buckets from
 * `Code.gs:2825-2865` (`statyJezdzace`, `statyStojace7d`, `statyNieaktywne`,
 * `potencjalneAuta`).
 *
 *  - `jezdzace`   — `Vehicle.active=true` AND (no `lastDroveAt` OR
 *                   `lastDroveAt` within the last 7 days). Mirrors the
 *                   legacy "no data = assume driving" default.
 *  - `stojace`    — `Vehicle.active=true` AND `lastDroveAt` is older than
 *                   7 days.
 *  - `nieaktywne` — `Vehicle.active=false`.
 *  - `potencjalne` — `max(0, Carrier.numberOfVehicle ?? 0 − total)`. KREPTD
 *                    headroom; "potential" trucks the carrier could add
 *                    under their license.
 *  - `total`      — sum of jezdzace+stojace+nieaktywne (vehicles registered
 *                   in the system; equivalent to `vehicles.length` in legacy).
 */
export const OpiekunCarrierVehicleStatsSchema = z.object({
  jezdzace: z.number().int().nonnegative(),
  stojace: z.number().int().nonnegative(),
  nieaktywne: z.number().int().nonnegative(),
  potencjalne: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type OpiekunCarrierVehicleStats = z.infer<
  typeof OpiekunCarrierVehicleStatsSchema
>;

/**
 * Machine-readable "attention" reasons surfaced to the opiekun on the fleet
 * dashboard. Derived from the shared carrier-readiness computation
 * (`CarrierReadinessService` in the api):
 *
 *  - `incompleteFleet` — the carrier is missing at least one of an active
 *    vehicle / trailer / driver. The carrier cannot register a delegation
 *    until the fleet is complete.
 *  - `adrDocMissing`   — the carrier has at least one active ADR vehicle but
 *    no active ADR document on file. The carrier cannot register a delegation
 *    until the ADR document is uploaded.
 *
 * Unlike the carrier-facing eligibility flag (`canCreateDelegation`), the
 * opiekun DOES see the breakdown so they can chase the missing items. An
 * empty array means nothing requires attention (the carrier is ready).
 */
export const CarrierAttentionReasonSchema = z.enum([
  'incompleteFleet',
  'adrDocMissing',
]);
export type CarrierAttentionReason = z.infer<
  typeof CarrierAttentionReasonSchema
>;

/**
 * Per-carrier row in the opiekun fleet aggregate. Identity (id/login/nazwa/
 * firma/nip/aktywny/liczbaWypisow) + the four-bucket vehicle classification +
 * the readiness `attentionReasons` flags.
 *
 * `liczbaWypisow` here is the carrier's KREPTD entry count — the column is
 * named `Carrier.numberOfVehicle` in the Prisma schema (per
 * docs/12-database-schema.md). The wire field keeps the Polish term used in
 * the legacy spreadsheet + UI labels for continuity with the carrier-form
 * field.
 *
 * `attentionReasons` is an additive (non-breaking) field — empty array means
 * the carrier is ready and nothing requires the opiekun's attention.
 */
export const OpiekunCarrierStatsSchema = z.object({
  carrierId: UuidSchema,
  login: z.string(),
  nazwa: z.string().nullable(),
  firma: z.string().nullable(),
  nip: z.string(),
  aktywny: z.boolean(),
  liczbaWypisow: z.number().int().nonnegative().nullable(),
  vehicles: OpiekunCarrierVehicleStatsSchema,
  attentionReasons: z.array(CarrierAttentionReasonSchema),
});
export type OpiekunCarrierStats = z.infer<typeof OpiekunCarrierStatsSchema>;

/**
 * Totals across all returned carriers — pre-aggregated by the API so the
 * dashboard doesn't need to re-sum client-side. `liczbaPrzewoznikow` mirrors
 * `Code.gs:2875` (`stats.liczbaPrzewoznikow`).
 */
export const OpiekunFleetTotalsSchema = z.object({
  liczbaPrzewoznikow: z.number().int().nonnegative(),
  vehicles: OpiekunCarrierVehicleStatsSchema,
});
export type OpiekunFleetTotals = z.infer<typeof OpiekunFleetTotalsSchema>;

/**
 * Response for `GET /fleet/opiekun`. Admin callers receive every (non-soft-
 * deleted) carrier; opiekun callers receive only carriers where
 * `Carrier.opiekunId === user.sub` (filtered server-side — the guard does
 * not gate this endpoint since it's a list-of-many, not a single-resource
 * lookup).
 */
export const OpiekunFleetResponseSchema = z.object({
  carriers: z.array(OpiekunCarrierStatsSchema),
  totals: OpiekunFleetTotalsSchema,
});
export type OpiekunFleetResponse = z.infer<typeof OpiekunFleetResponseSchema>;

// ─── GET /fleet/planista ─────────────────────────────────

/**
 * Response for `GET /fleet/planista` (planista role) — read-only fleet view.
 * Mirrors `Code.gs:3650-3657` (`getPlanistaFleet` return): the planista sees
 * the vehicles they plan (`Vehicle.plannerId === user.sub`) plus the drivers
 * and trailers belonging to the carriers who own those vehicles. Three lists
 * in one payload — same shape as `MyFleetResponseSchema` so the panel reuses
 * the carrier picker rendering.
 *
 * The legacy `carriers` field (a login-list, "ile przewoźników obsługuje")
 * is intentionally OMITTED: it's a UI-only informational count the panel can
 * derive client-side (vehicles grouped by carrier) and exposing raw logins
 * adds no value over the per-vehicle data already returned. Reinstate as
 * `z.array(z.string())` only if a concrete UI need surfaces.
 *
 * Phase 6.4 — the planista panel now also surfaces a KPI strip + an
 * idle-vehicle highlight list, IDENTICAL to the dyspozytor panel. Rather than
 * duplicating the stat/stojacy shapes, `PlanistaFleetResponseSchema` REUSES
 * `DyspozytorFleetStatsSchema` + `DyspozytorStojacyItemSchema`. Those are
 * declared below in the dyspozytor section, so the planista response schema is
 * itself declared AFTER them (see "GET /fleet/planista — response" near the
 * bottom of this file) to keep the const-before-use order.
 */

// ─── GET /fleet/dyspozytor ───────────────────────────────

/**
 * Dyspozytor KPI strip counters — maps 1:1 to the legacy `stats` object in
 * `Code.gs:3758-3764` (`getDyspozytorFleet` return). Key names are kept
 * verbatim so the dyspozytor panel's KPI strip reads them directly.
 *
 *  - `liczbaAut`        — total vehicles assigned to this dyspozytor
 *                         (`Vehicle.dispatcherId === user.sub`).
 *  - `autaAktywne`      — `Vehicle.active=true`.
 *  - `autaJezdzace`     — active AND (no `lastDroveAt` OR within last 7 days);
 *                         mirrors the legacy "no data = assume driving" default.
 *  - `autaStojace7dni`  — active AND `lastDroveAt` older than 7 days.
 *  - `autaNieaktywne`   — `Vehicle.active=false`.
 *  - `liczbaKierowcow`  — drivers of the dyspozytor's carriers.
 *  - `liczbaNaczep`     — trailers of the dyspozytor's carriers.
 *
 * Note `autaJezdzace + autaStojace7dni === autaAktywne`, and
 * `autaAktywne + autaNieaktywne === liczbaAut` (legacy invariant).
 */
export const DyspozytorFleetStatsSchema = z.object({
  liczbaAut: z.number().int().nonnegative(),
  autaAktywne: z.number().int().nonnegative(),
  autaJezdzace: z.number().int().nonnegative(),
  autaStojace7dni: z.number().int().nonnegative(),
  autaNieaktywne: z.number().int().nonnegative(),
  liczbaKierowcow: z.number().int().nonnegative(),
  liczbaNaczep: z.number().int().nonnegative(),
});
export type DyspozytorFleetStats = z.infer<typeof DyspozytorFleetStatsSchema>;

/**
 * One "auto stojące > 7 dni" highlight row in the dyspozytor panel — the
 * idle-vehicle list the dyspozytor needs to chase. Mirrors the per-vehicle
 * push in `Code.gs:3744`.
 *
 * Field naming follows `VehicleListItemSchema` for continuity: `plateNumber`
 * (legacy `nrRej`) and `lastDroveAt` (legacy `ostatnioJezdzilo`). `daysIdle`
 * is the legacy `dniBezJazdy` floor-division of the gap since `lastDroveAt`;
 * `lastDroveAt` is nullable to cover vehicles that never reported a drive yet
 * still surfaced here. `carrierLogin` / `plannerName` map to the legacy
 * `przewoznikLogin` / `planista` columns.
 */
export const DyspozytorStojacyItemSchema = z.object({
  plateNumber: z.string(),
  carrierLogin: z.string(),
  lastDroveAt: z.string().nullable(),
  daysIdle: z.number().int(),
  plannerName: z.string().nullable(),
});
export type DyspozytorStojacyItem = z.infer<typeof DyspozytorStojacyItemSchema>;

/**
 * Response for `GET /fleet/dyspozytor` (dyspozytor role) — read-only fleet
 * view + KPI stats + idle-vehicle highlight list. Mirrors `Code.gs:3749-3766`
 * (`getDyspozytorFleet` return). The vehicles/drivers/trailers lists reuse the
 * same slim item shapes as `/fleet/my` and `/fleet/planista`; `stats` and
 * `stojaceList` are the dyspozytor-specific extras.
 *
 * Scope is server-side: the API filters vehicles to
 * `Vehicle.dispatcherId === user.sub` and derives drivers/trailers from the
 * owning carriers — there is no client filter param (matching the delegations
 * scope, which is also JWT-driven).
 */
export const DyspozytorFleetResponseSchema = z.object({
  vehicles: z.array(VehicleListItemSchema),
  drivers: z.array(DriverListItemSchema),
  trailers: z.array(TrailerListItemSchema),
  stats: DyspozytorFleetStatsSchema,
  stojaceList: z.array(DyspozytorStojacyItemSchema),
});
export type DyspozytorFleetResponse = z.infer<
  typeof DyspozytorFleetResponseSchema
>;

// ─── GET /fleet/planista — response ──────────────────────

/**
 * Response for `GET /fleet/planista` (planista role) — read-only fleet view +
 * KPI stats + idle-vehicle highlight list. Declared here (after the dyspozytor
 * schemas) so it can REUSE `DyspozytorFleetStatsSchema` +
 * `DyspozytorStojacyItemSchema` rather than duplicating them — the planista
 * panel computes the SAME 7-day classification over its plannerId-scoped fleet
 * (the stat/stojacy semantics are identical across planista + dyspozytor;
 * docs/14-design-system.md §6.4). The doc block above (`GET /fleet/planista`)
 * explains why this const lives down here instead of next to its peers.
 */
export const PlanistaFleetResponseSchema = z.object({
  vehicles: z.array(VehicleListItemSchema),
  drivers: z.array(DriverListItemSchema),
  trailers: z.array(TrailerListItemSchema),
  stats: DyspozytorFleetStatsSchema,
  stojaceList: z.array(DyspozytorStojacyItemSchema),
});
export type PlanistaFleetResponse = z.infer<typeof PlanistaFleetResponseSchema>;
