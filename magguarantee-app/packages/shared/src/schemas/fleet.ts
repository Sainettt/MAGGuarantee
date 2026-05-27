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

import { IsoDateSchema, UuidSchema } from './common';

// ─── Slim list-item shapes ───────────────────────────────

/**
 * Picker-friendly vehicle row: just enough to render `<select>` options,
 * group by carrier and decide whether the row is eligible for selection
 * (`active` + `gps`).
 */
export const VehicleListItemSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
  active: z.boolean(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  type: z.enum(['MEGA', 'STD', 'COIL']).nullable(),
  sideNumber: z.string().nullable(),
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
});
export type DriverListItem = z.infer<typeof DriverListItemSchema>;

export const TrailerListItemSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
  active: z.boolean(),
  trailerTypeId: UuidSchema,
  trailerTypeName: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
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
 * Per-carrier row in the opiekun fleet aggregate. Identity (id/login/nazwa/
 * firma/nip/aktywny/liczbaWypisow) + the four-bucket vehicle classification.
 *
 * `liczbaWypisow` here is the carrier's KREPTD entry count — the column is
 * named `Carrier.numberOfVehicle` in the Prisma schema (per
 * docs/12-database-schema.md). The wire field keeps the Polish term used in
 * the legacy spreadsheet + UI labels for continuity with the carrier-form
 * field.
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
