// GPS tracker contract — wire format owned by the shared package.
//
// Per docs/16-jobs-and-integrations.md#gps-tracker-статус-ожидает-доступа-к-api
// and docs/13-api-design.md#external-integrations.
//
// The provider interface in `apps/api/src/modules/integrations/gps/gps.types.ts`
// imports these types directly so the position shape is defined ONCE.

import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from '../common';

/**
 * Single GPS fix for one vehicle.
 *
 * Fields:
 *   - `vehicleId`: our UUID — always present.
 *   - `plateNumber`: denormalised so UI can render without an extra lookup.
 *   - `recordedAt`: ISO timestamp from the vendor / mock generator.
 *   - `fetchedAt`: ISO timestamp when WE captured the fix into Redis.
 *   - `source`: 'mock' | 'vendor' so admin / dev tooling can spot mock data.
 */
export const GpsPositionSchema = z.object({
  vehicleId: UuidSchema,
  plateNumber: z.string(),
  lat: z.number(),
  lng: z.number(),
  speedKmh: z.number().nullable(),
  headingDeg: z.number().min(0).max(359).nullable(),
  recordedAt: IsoDateTimeSchema,
  fetchedAt: IsoDateTimeSchema,
  ignitionOn: z.boolean().nullable(),
  odometerKm: z.number().nullable(),
  source: z.enum(['mock', 'vendor']),
});
export type GpsPosition = z.infer<typeof GpsPositionSchema>;

/**
 * `GET /api/v1/integrations/gps/positions/:vehicleId` response envelope.
 *
 * `stale: true` means we did NOT have a fresh in-cache fix — the optional
 * `position` is the last-known one (may itself be null on cold start).
 * Frontend renders a "data may be outdated" badge in that case.
 */
export const GpsPositionResponseSchema = z.object({
  position: GpsPositionSchema.nullable(),
  stale: z.boolean(),
  lastFetchedAt: IsoDateTimeSchema.nullable(),
});
export type GpsPositionResponse = z.infer<typeof GpsPositionResponseSchema>;

/**
 * `GET /api/v1/integrations/gps/positions` response envelope.
 *
 * `stale: true` ⇔ AT LEAST ONE position in the page was served from
 * the last-known fallback rather than the fresh-cache layer. Per-item
 * staleness is not exposed; it would be expensive and the UI only needs
 * a fleet-wide hint.
 */
export const GpsPositionListResponseSchema = z.object({
  items: z.array(GpsPositionSchema),
  stale: z.boolean(),
  lastFetchedAt: IsoDateTimeSchema.nullable(),
});
export type GpsPositionListResponse = z.infer<
  typeof GpsPositionListResponseSchema
>;

/**
 * `GET /api/v1/integrations/gps/trips/:vehicleId?from=...&to=...` is a Phase
 * 11+ feature. The schema is shipped now so the wire contract is locked, but
 * the api-side endpoint returns 501 Not Implemented until the vendor SDK
 * lands.
 */
export const GpsTripSchema = z.object({
  vehicleId: UuidSchema,
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema.nullable(),
  startLat: z.number(),
  startLng: z.number(),
  endLat: z.number().nullable(),
  endLng: z.number().nullable(),
  distanceKm: z.number().nonnegative(),
});
export type GpsTrip = z.infer<typeof GpsTripSchema>;

export const GpsTripsQuerySchema = z
  .object({
    from: IsoDateTimeSchema,
    to: IsoDateTimeSchema,
  })
  .strict();
export type GpsTripsQuery = z.infer<typeof GpsTripsQuerySchema>;
