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
  brand: emptyStringToUndefined(z.string().max(64).optional()),
  model: emptyStringToUndefined(z.string().max(64).optional()),
  year: z.number().int().min(1900).max(2100).optional(),
  notes: emptyStringToUndefined(z.string().max(2_000).optional()),
  /**
   * REQUIRED — Vehicle.certificateL is NOT NULL.
   * Converted from enum L1/L2/L3 to Boolean in
   * 20260515130307_vehicle_certificate_l_to_boolean.
   */
  certificateL: z.boolean(),
  /** REQUIRED — Vehicle.euro is NOT NULL since phase3_blocks. */
  euro: EuroNormSchema,
  adrClasses: z.array(z.string().max(16)).max(20).optional(),
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
   * Conditional: NOT NULL only when `gps=true` (kept nullable in the column;
   * the `vehicle_gps_device_when_gps_on` CHECK constraint enforces it). The
   * Zod-side `.refine(...)` below makes the same rule visible to the API
   * layer so we 422 instead of bouncing off a Postgres constraint error.
   */
  gpsMobilePhone: emptyStringToUndefined(z.string().max(32).optional()),
  nextInspectionDate: emptyStringToUndefined(IsoDateSchema.optional()),
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
    brand: emptyStringToUndefined(z.string().max(64).nullable().optional()),
    model: emptyStringToUndefined(z.string().max(64).nullable().optional()),
    year: z.number().int().min(1900).max(2100).nullable().optional(),
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
    adrClasses: z.array(z.string().max(16)).max(20).optional(),
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
    /**
     * Nullable in the column — but iff `gps=true` it must be set. The cross-
     * field rule is enforceable here only when both `gps` and `gpsMobilePhone`
     * are present in the patch; partial updates fall through to the Postgres
     * CHECK constraint which raises 500 → service maps to 422.
     */
    gpsMobilePhone: emptyStringToUndefined(
      z.string().max(32).nullable().optional(),
    ),
    nextInspectionDate: emptyStringToUndefined(
      IsoDateSchema.nullable().optional(),
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

// ─── Attachments ─────────────────────────────────────────

/**
 * Category of a Vehicle attachment, mirroring the DB
 * `enum VehicleAttachmentCategory`:
 *  - `contract`    — scanned umowa (replaces the legacy `Vehicle.contract`)
 *  - `cabotage_de` — German cabotage permit screenshot
 *  - `cabotage_fr` — French cabotage permit screenshot
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
  brand: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().int().nullable(),
  notes: z.string().nullable(),
  certificateL: z.boolean(),
  euro: EuroNormSchema,
  adrClasses: z.array(z.string()),
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
  /** Nullable per Revert #2 — required iff `gps=true` (CHECK enforces). */
  gpsMobilePhone: z.string().nullable(),
  nextInspectionDate: IsoDateSchema.nullable(),
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
