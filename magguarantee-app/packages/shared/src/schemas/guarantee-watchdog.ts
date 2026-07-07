// Guarantee Watchdog — HTTP wire contracts (Guarantee Watchdog plan §5).
//
// Source of truth for the three read endpoints:
//   - GET /guarantee-compliance      — live board (admin all / opiekun scoped)
//   - GET /guarantee-compliance/me   — carrier banner/badges (own fleet)
//   - GET /guarantee-episodes        — violation archive (admin / opiekun scoped)
//
// The live board rows are computed statelessly from delegations + the shared
// `computeGuaranteeWatchdog` domain fn; the episode list reads the durable
// `GuaranteeIdleEpisode` journal. NO write endpoints in v1 (plan §5 — no manual
// episode mutation). The domain function itself lives in
// `../domain/guarantee-watchdog.ts` and is NOT re-derived here.

import { z } from 'zod';

import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from './common';

// ─── Enums (mirror the shared domain / Prisma enums) ────────

/** Live watchdog status for one vehicle (matches `GuaranteeWatchdogStatus`). */
export const GuaranteeWatchdogStatusSchema = z.enum([
  'inactive',
  'ok_active',
  'counting',
  'violated',
]);
export type GuaranteeWatchdogStatusDto = z.infer<
  typeof GuaranteeWatchdogStatusSchema
>;

/** Where the anchor came from (matches `GuaranteeAnchorSource`). */
export const GuaranteeAnchorSourceSchema = z.enum(['zjechal', 'agreement']);
export type GuaranteeAnchorSourceDto = z.infer<
  typeof GuaranteeAnchorSourceSchema
>;

/** Persisted episode state (matches Prisma `GuaranteeEpisodeState`). */
export const GuaranteeEpisodeStateSchema = z.enum([
  'warning',
  'violated',
  'resolved',
]);
export type GuaranteeEpisodeStateDto = z.infer<
  typeof GuaranteeEpisodeStateSchema
>;

/** Why an episode was closed (matches Prisma `GuaranteeResolveReason`). */
export const GuaranteeResolveReasonSchema = z.enum([
  'wyjazd',
  'agreement_off',
  'vehicle_inactive',
]);
export type GuaranteeResolveReasonDto = z.infer<
  typeof GuaranteeResolveReasonSchema
>;

// ─── GET /guarantee-compliance (+ /me) — live board ─────────

/**
 * Slim carrier reference on a board row. Omitted on the carrier `/me` variant
 * (the caller already knows who they are).
 */
export const GuaranteeComplianceCarrierRefSchema = z.object({
  id: UuidSchema,
  name: z.string(),
});
export type GuaranteeComplianceCarrierRef = z.infer<
  typeof GuaranteeComplianceCarrierRefSchema
>;

/**
 * The OPEN idle episode backing a `counting`/`violated` row, if one has been
 * journaled yet. `null` when the counter is running but no reminder/violation
 * has fired (a first-few-days `counting` vehicle has no episode row — plan §2).
 */
export const GuaranteeOpenEpisodeRefSchema = z.object({
  id: UuidSchema,
  state: GuaranteeEpisodeStateSchema,
  violatedAt: IsoDateTimeSchema.nullable(),
  reminder3SentAt: IsoDateTimeSchema.nullable(),
  reminder1SentAt: IsoDateTimeSchema.nullable(),
});
export type GuaranteeOpenEpisodeRef = z.infer<
  typeof GuaranteeOpenEpisodeRefSchema
>;

/**
 * One live compliance row, keyed by `vehicleId` (the web joins these onto the
 * fleet rows). Anchor fields follow the domain contract: `null` for
 * `inactive`/`ok_active` (no running counter), populated for
 * `counting`/`violated`.
 */
export const GuaranteeComplianceItemSchema = z.object({
  vehicleId: UuidSchema,
  plateNumber: z.string(),
  sideNumber: z.string().nullable(),
  /** Present on the admin/opiekun board; absent on the carrier `/me` variant. */
  carrier: GuaranteeComplianceCarrierRefSchema.optional(),
  anchorAt: IsoDateSchema.nullable(),
  anchorSource: GuaranteeAnchorSourceSchema.nullable(),
  deadlineAt: IsoDateSchema.nullable(),
  daysLeft: z.number().int().nullable(),
  state: GuaranteeWatchdogStatusSchema,
  openEpisode: GuaranteeOpenEpisodeRefSchema.nullable(),
});
export type GuaranteeComplianceItem = z.infer<
  typeof GuaranteeComplianceItemSchema
>;

/** Summary counters shown atop the board (plan §5). */
export const GuaranteeComplianceSummarySchema = z.object({
  /** `state === 'violated'`. */
  violated: z.number().int().nonnegative(),
  /** `state === 'counting' && daysLeft <= 3`. */
  dueSoon: z.number().int().nonnegative(),
  /** Every guaranteed vehicle in scope (all states, incl. ok_active/inactive). */
  watched: z.number().int().nonnegative(),
});
export type GuaranteeComplianceSummary = z.infer<
  typeof GuaranteeComplianceSummarySchema
>;

/** Response for `GET /guarantee-compliance` (admin/opiekun board). */
export const GuaranteeComplianceResponseSchema = z.object({
  items: z.array(GuaranteeComplianceItemSchema),
  summary: GuaranteeComplianceSummarySchema,
});
export type GuaranteeComplianceResponse = z.infer<
  typeof GuaranteeComplianceResponseSchema
>;

// ─── GET /guarantee-episodes — violation archive ────────────

/** Query-string filters for the episode archive list. */
export const GuaranteeEpisodeFiltersSchema = z
  .object({
    carrierId: UuidSchema.optional(),
    vehicleId: UuidSchema.optional(),
    state: GuaranteeEpisodeStateSchema.optional(),
    /** Opaque cursor — the episode `id` of the last row of the previous page. */
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type GuaranteeEpisodeFilters = z.infer<
  typeof GuaranteeEpisodeFiltersSchema
>;

/**
 * One row of the durable episode journal. Carries both the vehicle + carrier
 * reference (for the archive table) and every dedup/resolution flag so the
 * admin/opiekun can see the full life of a bad cycle.
 */
export const GuaranteeEpisodeDtoSchema = z.object({
  id: UuidSchema,
  vehicleId: UuidSchema,
  plateNumber: z.string().nullable(),
  sideNumber: z.string().nullable(),
  carrierId: UuidSchema,
  carrierName: z.string().nullable(),
  anchorAt: IsoDateSchema,
  anchorSource: GuaranteeAnchorSourceSchema,
  deadlineAt: IsoDateSchema,
  state: GuaranteeEpisodeStateSchema,
  reminder3SentAt: IsoDateTimeSchema.nullable(),
  reminder1SentAt: IsoDateTimeSchema.nullable(),
  violationSentAt: IsoDateTimeSchema.nullable(),
  violatedAt: IsoDateTimeSchema.nullable(),
  resolvedAt: IsoDateTimeSchema.nullable(),
  resolvedByDelegationId: UuidSchema.nullable(),
  resolvedDaysLeft: z.number().int().nullable(),
  resolvedReason: GuaranteeResolveReasonSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type GuaranteeEpisodeDto = z.infer<typeof GuaranteeEpisodeDtoSchema>;

/** Cursor-paginated envelope for `GET /guarantee-episodes`. */
export const GuaranteeEpisodeListSchema = z.object({
  items: z.array(GuaranteeEpisodeDtoSchema),
  nextCursor: UuidSchema.nullable(),
});
export type GuaranteeEpisodeListDto = z.infer<
  typeof GuaranteeEpisodeListSchema
>;
