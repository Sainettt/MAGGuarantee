// Wave 3 — Vehicles DTO contracts.
//
// Source of truth for `/api/v1/vehicles/*` per docs/13-api-design.md#vehicles
// and docs/04-data-model.md (Vehicle invariants: composite (carrierId, plateNumber)
// uniqueness; plannerId → role=planista; dispatcherId → role=dyspozytor).
//
// ── Umowa / cabotage attachments ─────────────────────────
// The legacy `Vehicle.contract` boolean was dropped (migration 2026-05). The
// umowa is now a scanned file, stored in MinIO and tracked via
// `VehicleAttachment` rows. The Vehicle create/edit modal is therefore a
// `multipart/form-data` endpoint — files arrive as separate parts, not in the
// JSON body. As a result the conditional "umowa screenshot required" rule
// CANNOT be expressed in the body Zod schema below (Zod only sees the scalar
// fields). It is enforced at the service layer instead — see
// `VehiclesService` and the rule documented under
// docs/13-api-design.md#vehicles. The schemas here validate ONLY the
// non-file form fields.

import { z } from 'zod';

import {
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';

// ─── Field primitives ────────────────────────────────────

const PlateSchema = z.string().min(2).max(16);

/**
 * EURO emission norm. Restricted to `V` / `VI` — the legacy `III` / `IV`
 * variants were removed (DB `enum EuroNorm` now `{ V VI }`). MAGTRANS no
 * longer onboards trucks below EURO V.
 */
export const EuroNormSchema = z.enum(['V', 'VI']);
export type EuroNorm = z.infer<typeof EuroNormSchema>;

const VehicleTypeSchema = z.enum(['MEGA', 'STD', 'COIL']);

const vehicleAttributeFields = {
  plannerId: UuidSchema,
  dispatcherId: UuidSchema,
  notes: emptyStringToUndefined(z.string().max(2_000).optional()),
  /**
   * REQUIRED — Vehicle.certificateL is NOT NULL.
   * Converted from enum L1/L2/L3 to Boolean in
   * 20260515130307_vehicle_certificate_l_to_boolean.
   */
  certificateL: z.boolean(),
  /** REQUIRED — Vehicle.euro is NOT NULL since phase3_blocks. */
  euro: EuroNormSchema,
  gps: z.boolean().default(false),
  fuelCard: z.boolean().optional().default(false),
  /** REQUIRED — Vehicle.type is NOT NULL since phase3_blocks. */
  type: VehicleTypeSchema,
  gb: z.boolean().optional(),
  it: z.boolean().optional(),
  fr: z.boolean().optional(),
  /** Porozumienie. The legacy `contract` (Umowa) boolean was dropped — the
   *  umowa is now a scanned file (VehicleAttachment category=contract). */
  agreement: z.boolean().optional(),
  // EUR/km rates are required at vehicle creation — admin must enter all four
  // before the carrier can submit a claim against this truck. Zero is a valid
  // value ("free haulage" / promotional rate) and remains accepted; the
  // missing-rate guard kicks in only when the field is left blank.
  rateDe: z.number().nonnegative(),
  rateUe: z.number().nonnegative(),
  rateExport: z.number().nonnegative(),
  rateImport: z.number().nonnegative(),
  wasteAllowed: z.boolean().optional(),
  wasteCountries: z.array(z.string().max(8)).max(64).optional(),
  cabotageDe: z.boolean().optional(),
  cabotageFr: z.boolean().optional(),
  /**
   * ADR cargo permit flag. Pure boolean — no attachment is required for it.
   * The ADR certificate scan (świadectwo ADR) moved to the Driver as a
   * `DriverAttachment` (2026-05-29); the vehicle keeps only this checkbox.
   */
  adr: z.boolean().optional(),
  /**
   * Conditional: NOT NULL only when `gps=true` (kept nullable in the column;
   * the `vehicle_gps_device_when_gps_on` CHECK constraint enforces it). The
   * Zod-side `.refine(...)` below makes the same rule visible to the API
   * layer so we 422 instead of bouncing off a Postgres constraint error.
   */
  gpsMobilePhone: emptyStringToUndefined(z.string().max(32).optional()),
  sideNumber: emptyStringToUndefined(z.string().max(16).optional()),
};

// ─── Create ──────────────────────────────────────────────

export const CreateVehicleSchema = z
  .object({
    carrierId: UuidSchema,
    plateNumber: PlateSchema,
    active: z.boolean().optional(),
    ...vehicleAttributeFields,
  })
  .strict()
  .refine((d) => !d.gps || (d.gpsMobilePhone && d.gpsMobilePhone.length > 0), {
    message: 'gpsMobilePhone wymagany gdy gps=true',
    path: ['gpsMobilePhone'],
  });
export type CreateVehicleDto = z.infer<typeof CreateVehicleSchema>;

// ─── Update ──────────────────────────────────────────────

export const UpdateVehicleSchema = z
  .object({
    plateNumber: PlateSchema.optional(),
    active: z.boolean().optional(),
    plannerId: UuidSchema.nullable().optional(),
    dispatcherId: UuidSchema.nullable().optional(),
    notes: emptyStringToUndefined(z.string().max(2_000).nullable().optional()),
    // The following five fields are NOT NULL since phase3_blocks. PATCH
    // accepts an update (omit means "do not touch") but cannot null them.
    certificateL: z.boolean().optional(),
    euro: EuroNormSchema.optional(),
    type: VehicleTypeSchema.optional(),
    rateDe: z.number().nonnegative().optional(),
    rateUe: z.number().nonnegative().optional(),
    rateExport: z.number().nonnegative().optional(),
    rateImport: z.number().nonnegative().optional(),
    gps: z.boolean().optional(),
    fuelCard: z.boolean().optional(),
    gb: z.boolean().nullable().optional(),
    it: z.boolean().nullable().optional(),
    fr: z.boolean().nullable().optional(),
    agreement: z.boolean().nullable().optional(),
    wasteAllowed: z.boolean().optional(),
    wasteCountries: z.array(z.string().max(8)).max(64).optional(),
    cabotageDe: z.boolean().optional(),
    cabotageFr: z.boolean().optional(),
    /** ADR cargo permit flag — pure boolean, no attachment required. */
    adr: z.boolean().optional(),
    /**
     * Nullable in the column — but iff `gps=true` it must be set. The cross-
     * field rule is enforceable here only when both `gps` and `gpsMobilePhone`
     * are present in the patch; partial updates fall through to the Postgres
     * CHECK constraint which raises 500 → service maps to 422.
     */
    gpsMobilePhone: emptyStringToUndefined(
      z.string().max(32).nullable().optional(),
    ),
    sideNumber: emptyStringToUndefined(
      z.string().max(16).nullable().optional(),
    ),
    /**
     * Attachment ids to soft-delete as part of this update (multipart field
     * `removeAttachmentIds`). New files arrive as separate file parts; this
     * list names existing attachments to remove. Web sends it as a JSON-
     * encoded string part — the controller coerces it before validation.
     */
    removeAttachmentIds: z.array(UuidSchema).max(64).optional(),
  })
  .strict()
  .refine(
    (d) =>
      // Only enforce when both fields are part of the patch — partial
      // updates (gps alone or gpsMobilePhone alone) defer to the DB CHECK.
      d.gps === undefined ||
      !d.gps ||
      (d.gpsMobilePhone !== undefined && d.gpsMobilePhone !== null && d.gpsMobilePhone.length > 0),
    {
      message: 'gpsMobilePhone wymagany gdy gps=true',
      path: ['gpsMobilePhone'],
    },
  );
export type UpdateVehicleDto = z.infer<typeof UpdateVehicleSchema>;

// ─── Filters ─────────────────────────────────────────────

export const VehicleFiltersSchema = z
  .object({
    carrierId: UuidSchema.optional(),
    plannerId: UuidSchema.optional(),
    dispatcherId: UuidSchema.optional(),
    active: z.coerce.boolean().optional(),
    q: z.string().min(1).max(64).optional(),
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type VehicleFilters = z.infer<typeof VehicleFiltersSchema>;

// ─── Daily km (Phase 7 REWORK #3 — weryfikator km-board) ──
//
// REWORK 2026-06-12 #3 (docs/20-phase-7-eksport-weryfikator.md §0′): the
// former per-vehicle route-status board («w trasie» / «zjechał») is absorbed
// by a DAILY km list. The `weryfikator` role records, per (vehicle, day),
// either `drove` (moved, km>0) or `idle` («nie jeździ», checked-but-stood,
// km null). No row for a day = «not checked» (`nieznany`). This is the source
// of truth for claim mileage (`Σ VehicleDailyKm.km` over the period).
//
// Storage is a single row per (vehicleId, date) — `@@unique([vehicleId, date])`
// — written via UPSERT, so re-stamping a day overwrites the previous mark
// (NOT append-only, unlike the removed route-status log).
//
// The `@magguarantee/shared` package is intentionally dependency-free (zod
// only) and cannot import the database package, so the DB enums
// `VehicleDayState { drove, idle }` and `VehicleStatusSource { manual, gps }`
// are mirrored here as Zod enums — same convention as `DelegationStatusSchema`.
// Keep these lists in lockstep with packages/database/prisma/schema.prisma.

/**
 * Per-day vehicle state a weryfikator/admin may set (mirror of the Prisma
 * `VehicleDayState` enum). `drove` ⇒ the truck moved (`km > 0` required);
 * `idle` ⇒ checked and stood (`km` must be null). The «not checked» state is
 * the ABSENCE of a row, not an enum value, so it is deliberately absent here.
 */
export const VehicleDayStateSchema = z.enum(['drove', 'idle']);
export type VehicleDayState = z.infer<typeof VehicleDayStateSchema>;

/**
 * Origin of a daily-km row (mirror of the Prisma `VehicleStatusSource` enum).
 * `manual` = stamped by a weryfikator/admin; `gps` = future external tracking
 * service (no associated user). The PUT endpoint always records `manual`;
 * `source` appears only on the read DTOs.
 */
export const VehicleStatusSourceSchema = z.enum(['manual', 'gps']);
export type VehicleStatusSourceValue = z.infer<typeof VehicleStatusSourceSchema>;

/**
 * Derived per-vehicle motion status for the km-board / km-report header — the
 * two stored states plus `nieznany` («not checked in the period»). Computed at
 * read time from the LATEST-by-date row in the period (`drove` ⇒ `w_ruchu`,
 * `idle` ⇒ `nie_jezdzi`, no row ⇒ `nieznany`) and NOT persisted. Use
 * `deriveVehicleMotionStatus(...)` to compute it consistently.
 */
export const VehicleMotionStatusSchema = z.enum([
  'w_ruchu',
  'nie_jezdzi',
  'nieznany',
]);
export type VehicleMotionStatus = z.infer<typeof VehicleMotionStatusSchema>;

/**
 * Derives a vehicle's read-time motion status from the LATEST-by-date daily-km
 * state in the period. `null` (no row in the period) ⇒ `nieznany`. Shared by
 * the api board/report builders and the web header so both compute it
 * identically (per docs/20 §0′ «Производный статус»).
 */
export function deriveVehicleMotionStatus(
  latestState: VehicleDayState | null,
): VehicleMotionStatus {
  if (latestState === 'drove') return 'w_ruchu';
  if (latestState === 'idle') return 'nie_jezdzi';
  return 'nieznany';
}

/**
 * PUT /vehicles/:id/daily-km — body for a weryfikator/admin to UPSERT one
 * (vehicle, day) mark. Invariants (also re-checked server-side so a bypassed
 * pipe still 422s rather than violating a constraint):
 *  - `state='drove'` ⇒ `km` required and `> 0`.
 *  - `state='idle'`  ⇒ `km` must be absent/null (the vehicle stood).
 * `.strict()` rejects stray fields. The server records `source='manual'`,
 * `notedById=caller`; when `state='drove'` it bumps
 * `Vehicle.lastDroveAt = max(lastDroveAt, date)` in the same transaction.
 */
export const SetVehicleDailyKmSchema = z
  .object({
    date: IsoDateSchema,
    state: VehicleDayStateSchema,
    km: z.number().int().nonnegative().max(9_999_999).optional(),
    notes: emptyStringToUndefined(z.string().max(2_000).optional()),
  })
  .strict()
  .refine((d) => d.state !== 'drove' || (d.km !== undefined && d.km > 0), {
    message: 'km_required_when_drove',
    path: ['km'],
  })
  .refine((d) => d.state !== 'idle' || d.km === undefined, {
    message: 'km_forbidden_when_idle',
    path: ['km'],
  });
export type SetVehicleDailyKmDto = z.infer<typeof SetVehicleDailyKmSchema>;

/**
 * Query for `GET /vehicles/:id/daily-km` — the per-vehicle history modal. Both
 * bounds are date-only (`YYYY-MM-DD`) and optional; when omitted the api
 * returns the full history. `from <= to` when both present.
 */
export const VehicleDailyKmHistoryQuerySchema = z
  .object({
    from: IsoDateSchema.optional(),
    to: IsoDateSchema.optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'date_order',
    path: ['to'],
  });
export type VehicleDailyKmHistoryQuery = z.infer<
  typeof VehicleDailyKmHistoryQuerySchema
>;

/**
 * Query for `DELETE /vehicles/:id/daily-km` — clears ONE (vehicle, day) mark so
 * the cell returns to «not checked» (row absence). The day to clear is a
 * required date-only (`YYYY-MM-DD`) query param, matching the GET history
 * query style. `.strict()` rejects stray fields. The delete is idempotent:
 * clearing an already-absent cell still succeeds (204), so no `to`/`from`
 * window applies — exactly one day is targeted.
 */
export const DeleteVehicleDailyKmQuerySchema = z
  .object({
    date: IsoDateSchema,
  })
  .strict();
export type DeleteVehicleDailyKmQuery = z.infer<
  typeof DeleteVehicleDailyKmQuerySchema
>;

/**
 * Query for the weekly km-board / km-report. Accepts EITHER an ISO week
 * (`YYYY-Www`, e.g. `2026-W24`) OR a `from` Monday (`YYYY-MM-DD`). When both
 * are absent the api defaults to the current ISO week. `.strict()` rejects
 * stray fields; the week is always resolved to a Monday-anchored 7-day window
 * server-side (see `resolveWeekWindow` in the km-board service).
 */
const IsoWeekSchema = z
  .string()
  .regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, 'expected ISO week YYYY-Www');
export const KmBoardQuerySchema = z
  .object({
    week: IsoWeekSchema.optional(),
    from: IsoDateSchema.optional(),
  })
  .strict();
export type KmBoardQuery = z.infer<typeof KmBoardQuerySchema>;

// ─── Daily km — response DTOs ────────────────────────────

const DailyKmNotedBySchema = z
  .object({
    id: UuidSchema,
    name: z.string().nullable(),
  })
  .nullable();

/**
 * One stored daily-km mark — used by `PUT /vehicles/:id/daily-km` (the saved
 * row) and `GET /vehicles/:id/daily-km` (history, newest-first). `km` is null
 * for `idle` rows; `notedBy` is null for GPS-sourced rows.
 */
export const VehicleDailyKmDtoSchema = z.object({
  id: UuidSchema,
  vehicleId: UuidSchema,
  date: IsoDateSchema,
  state: VehicleDayStateSchema,
  km: z.number().int().nullable(),
  source: VehicleStatusSourceSchema,
  notedBy: DailyKmNotedBySchema,
  notes: z.string().nullable(),
  updatedAt: IsoDateTimeSchema,
});
export type VehicleDailyKmDto = z.infer<typeof VehicleDailyKmDtoSchema>;

/**
 * One day-cell on the weekly km-board — the mark for a (vehicle, day) or the
 * absence of one (`state=null` ⇒ «not checked»). Keyed to a `date` within the
 * resolved 7-day window.
 */
export const VehicleKmCellDtoSchema = z.object({
  date: IsoDateSchema,
  state: VehicleDayStateSchema.nullable(),
  km: z.number().int().nullable(),
  notes: z.string().nullable(),
});
export type VehicleKmCellDto = z.infer<typeof VehicleKmCellDtoSchema>;

/**
 * One row of the weekly km-board / km-report — `GET /vehicles/km-board` and
 * `GET /vehicles/km-report`. A vehicle plus its 7 day-cells, the period km
 * sum, and the derived motion status. Identity columns mirror the former
 * route board (carrier + opiekun + planner + sideNumber + plateNumber).
 *
 *  - `carrier` — the carrier itself (`vehicle.carrier`, `{ id, name }` where
 *    `name` is `carrier.user.name`).
 *  - `opiekun` — the carrier's opiekun (`vehicle.carrier.opiekun`, a `User`).
 *  - `cells` — 7 entries, one per day of the resolved Monday-anchored window,
 *    in chronological order.
 *  - `kmSum` — `Σ km` over `drove` cells in the window.
 *  - `motionStatus` — derived from the latest-by-date cell (`w_ruchu` /
 *    `nie_jezdzi` / `nieznany`).
 */
export const VehicleKmBoardItemDtoSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
  sideNumber: z.string().nullable(),
  carrier: z
    .object({ id: UuidSchema, name: z.string().nullable() })
    .nullable(),
  opiekun: z
    .object({ id: UuidSchema, name: z.string().nullable() })
    .nullable(),
  planner: z.string().nullable(),
  cells: z.array(VehicleKmCellDtoSchema),
  kmSum: z.number().int().nonnegative(),
  motionStatus: VehicleMotionStatusSchema,
});
export type VehicleKmBoardItemDto = z.infer<typeof VehicleKmBoardItemDtoSchema>;

/**
 * Envelope for the weekly km-board / km-report — the resolved Monday-anchored
 * window plus the per-vehicle rows. `weekStart` / `weekEnd` are date-only.
 */
export const VehicleKmBoardDtoSchema = z.object({
  weekStart: IsoDateSchema,
  weekEnd: IsoDateSchema,
  items: z.array(VehicleKmBoardItemDtoSchema),
});
export type VehicleKmBoardDto = z.infer<typeof VehicleKmBoardDtoSchema>;

// ─── Attachments ─────────────────────────────────────────

/**
 * Category of a Vehicle attachment, mirroring the DB
 * `enum VehicleAttachmentCategory`:
 *  - `contract`    — scanned umowa (replaces the legacy `Vehicle.contract`)
 *  - `cabotage_de` — German cabotage permit screenshot
 *  - `cabotage_fr` — French cabotage permit screenshot
 *
 * The `adr` value was removed 2026-05-29 — the ADR certificate scan moved to
 * the Driver (świadectwo ADR) as a `DriverAttachment`. The `Vehicle.adr`
 * boolean stays as the permit flag but no longer requires an attachment.
 */
export const VehicleAttachmentCategorySchema = z.enum([
  'contract',
  'cabotage_de',
  'cabotage_fr',
]);
export type VehicleAttachmentCategory = z.infer<
  typeof VehicleAttachmentCategorySchema
>;

/**
 * Public attachment DTO. NOTE: `storageKey` is deliberately omitted — it is
 * an internal MinIO object key and never leaves the API. Clients download
 * bytes via `GET /vehicles/:id/attachments/:attachmentId/download`.
 */
export const VehicleAttachmentDtoSchema = z.object({
  id: UuidSchema,
  vehicleId: UuidSchema,
  category: VehicleAttachmentCategorySchema,
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  uploadedById: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type VehicleAttachmentDto = z.infer<typeof VehicleAttachmentDtoSchema>;

// ─── Response DTO ────────────────────────────────────────

export const VehicleDtoSchema = z.object({
  id: UuidSchema,
  carrierId: UuidSchema,
  plateNumber: z.string(),
  active: z.boolean(),
  notes: z.string().nullable(),
  certificateL: z.boolean(),
  euro: EuroNormSchema,
  gps: z.boolean(),
  fuelCard: z.boolean(),
  type: VehicleTypeSchema,
  gb: z.boolean().nullable(),
  it: z.boolean().nullable(),
  fr: z.boolean().nullable(),
  agreement: z.boolean().nullable(),
  rateDe: z.number().nullable(),
  rateUe: z.number().nullable(),
  rateExport: z.number().nullable(),
  rateImport: z.number().nullable(),
  wasteAllowed: z.boolean(),
  wasteCountries: z.array(z.string()),
  cabotageDe: z.boolean(),
  cabotageFr: z.boolean(),
  /** Default false in DB — always present on the wire. Pure permit flag; no
   *  attachment is tied to it. */
  adr: z.boolean(),
  /** Nullable per Revert #2 — required iff `gps=true` (CHECK enforces). */
  gpsMobilePhone: z.string().nullable(),
  sideNumber: z.string().nullable(),
  lastDroveAt: IsoDateTimeSchema.nullable(),
  plannerId: UuidSchema.nullable(),
  planner: z
    .object({
      id: UuidSchema,
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  dispatcherId: UuidSchema.nullable(),
  dispatcher: z
    .object({
      id: UuidSchema,
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  carrier: z
    .object({
      id: UuidSchema,
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  /** Non-deleted umowa/cabotage attachments for this vehicle. */
  attachments: z.array(VehicleAttachmentDtoSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type VehicleDto = z.infer<typeof VehicleDtoSchema>;
