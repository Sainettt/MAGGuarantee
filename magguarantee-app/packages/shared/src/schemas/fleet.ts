// Phase 3 — Fleet aggregates DTO contracts.
//
// Source of truth for `/api/v1/fleet/my` per docs/13-api-design.md§Fleet.
// Returns the carrier's own active vehicles, drivers, trailers in one shot
// so the new-claim form / new-delegation form can populate dropdowns
// without three separate round-trips (collapses three legacy `getMyFleet*`
// calls into one).
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
