// Wave 3 — Vehicles DTO contracts.
//
// Source of truth for `/api/v1/vehicles/*` per docs/13-api-design.md#vehicles
// and docs/04-data-model.md (Vehicle invariants: composite (carrierId, plateNumber)
// uniqueness; plannerId → role=planista; dispatcherId → role=dyspozytor).

import { z } from 'zod';

import {
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';

// ─── Field primitives ────────────────────────────────────

const PlateSchema = z.string().min(2).max(16);
const CertificateLSchema = z.enum(['L1', 'L2', 'L3']);
const EuroNormSchema = z.enum(['III', 'IV', 'V', 'VI']);
const VehicleTypeSchema = z.enum(['MEGA', 'STD', 'COIL']);

const vehicleAttributeFields = {
  plannerId: UuidSchema.optional(),
  dispatcherId: UuidSchema.optional(),
  brand: emptyStringToUndefined(z.string().max(64).optional()),
  model: emptyStringToUndefined(z.string().max(64).optional()),
  year: z.number().int().min(1900).max(2100).optional(),
  notes: emptyStringToUndefined(z.string().max(2_000).optional()),
  certificateL: CertificateLSchema.optional(),
  euro: EuroNormSchema.optional(),
  adrClasses: z.array(z.string().max(16)).max(20).optional(),
  gps: z.boolean().optional(),
  fuelCard: z.boolean().optional(),
  type: VehicleTypeSchema.optional(),
  gb: z.boolean().optional(),
  it: z.boolean().optional(),
  fr: z.boolean().optional(),
  agreement: z.boolean().optional(),
  contract: z.boolean().optional(),
  rateDe: z.number().nonnegative().optional(),
  rateUe: z.number().nonnegative().optional(),
  rateExport: z.number().nonnegative().optional(),
  rateImport: z.number().nonnegative().optional(),
  wasteAllowed: z.boolean().optional(),
  wasteCountries: z.array(z.string().max(8)).max(64).optional(),
  cabotageDe: z.boolean().optional(),
  cabotageFr: z.boolean().optional(),
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
  .strict();
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
    certificateL: CertificateLSchema.nullable().optional(),
    euro: EuroNormSchema.nullable().optional(),
    adrClasses: z.array(z.string().max(16)).max(20).optional(),
    gps: z.boolean().optional(),
    fuelCard: z.boolean().optional(),
    type: VehicleTypeSchema.nullable().optional(),
    gb: z.boolean().nullable().optional(),
    it: z.boolean().nullable().optional(),
    fr: z.boolean().nullable().optional(),
    agreement: z.boolean().nullable().optional(),
    contract: z.boolean().nullable().optional(),
    rateDe: z.number().nonnegative().nullable().optional(),
    rateUe: z.number().nonnegative().nullable().optional(),
    rateExport: z.number().nonnegative().nullable().optional(),
    rateImport: z.number().nonnegative().nullable().optional(),
    wasteAllowed: z.boolean().optional(),
    wasteCountries: z.array(z.string().max(8)).max(64).optional(),
    cabotageDe: z.boolean().optional(),
    cabotageFr: z.boolean().optional(),
    gpsMobilePhone: emptyStringToUndefined(
      z.string().max(32).nullable().optional(),
    ),
    nextInspectionDate: emptyStringToUndefined(
      IsoDateSchema.nullable().optional(),
    ),
    sideNumber: emptyStringToUndefined(
      z.string().max(16).nullable().optional(),
    ),
  })
  .strict();
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
  certificateL: CertificateLSchema.nullable(),
  euro: EuroNormSchema.nullable(),
  adrClasses: z.array(z.string()),
  gps: z.boolean(),
  fuelCard: z.boolean(),
  type: VehicleTypeSchema.nullable(),
  gb: z.boolean().nullable(),
  it: z.boolean().nullable(),
  fr: z.boolean().nullable(),
  agreement: z.boolean().nullable(),
  contract: z.boolean().nullable(),
  rateDe: z.number().nullable(),
  rateUe: z.number().nullable(),
  rateExport: z.number().nullable(),
  rateImport: z.number().nullable(),
  wasteAllowed: z.boolean(),
  wasteCountries: z.array(z.string()),
  cabotageDe: z.boolean(),
  cabotageFr: z.boolean(),
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
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type VehicleDto = z.infer<typeof VehicleDtoSchema>;
