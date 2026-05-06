// Phase 3 — Claims DTO contracts.
//
// Source of truth for `/api/v1/claims/*` per docs/13-api-design.md#claims
// and the `Claim` model in packages/database/prisma/schema.prisma:305+.
//
// Carriers submit claims; pracownik / admin verify and decide; perevoznik
// can file a `reklamacja` against a decided claim. The carrier identity
// is derived server-side from the JWT — never accepted in the body.

import { z } from 'zod';

import {
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';

// ─── Enums (mirror Prisma — kept as zod enums for runtime parity) ──

/**
 * Mirror of Prisma `ClaimStatus`. The legacy GAS used the labels
 * (with spaces and Polish characters) directly; on the wire we use the
 * underscored TypeScript identifiers — Prisma's `@map(...)` translates
 * to the DB enum literal at the storage layer.
 */
export const ClaimStatusSchema = z.enum([
  'NA_WERYFIKACJI',
  'ZAAKCEPTOWANO',
  'ODRZUCONO',
  'REKLAMACJA',
  'OCZEKUJE_NA_AUTORYZACJE',
  'AUTORYZACJA_KWOTA_MAKSIMA',
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

// ─── Field primitives ────────────────────────────────────

/** `HH:mm` — 00:00 .. 23:59. Empty string ⇒ undefined for form inputs. */
const HhMmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm in 00:00–23:59');

/** Mileage / km values — stored as Decimal(10,2) in DB. */
const MileageSchema = z.number().nonnegative().max(9_999_999);

/** Hours adjustment — non-negative, capped at the longest realistic stop. */
const HoursAdjustedSchema = z.number().min(0).max(24 * 366);

// ─── Submit (carrier creates a wniosek) ──────────────────

/**
 * POST /claims — body shape per docs/13-api-design.md§"Submit claim".
 *
 * Notes:
 * - `carrierId` is **derived from the JWT** — not accepted from the body.
 * - `vehicleId` ownership is enforced by `CarrierOwnershipGuard`.
 * - `mileage` (legacy `przebieg`) is the actual driven km.
 * - `amountRequested` is what the carrier asks (legacy `KwotaWnioskowana`).
 * - `plannerId`/`opiekunId` are derived server-side from the vehicle's planner
 *   and the carrier's opiekun — clients do not send them.
 */
export const SubmitClaimSchema = z
  .object({
    vehicleId: UuidSchema,
    /** Optional snapshot links — set if the carrier picked them in the form. */
    trailerId: emptyStringToUndefined(UuidSchema.optional()),
    driverId: emptyStringToUndefined(UuidSchema.optional()),

    dateStart: IsoDateSchema,
    dateEnd: IsoDateSchema,
    timeFrom: emptyStringToUndefined(HhMmSchema.optional()),
    timeTo: emptyStringToUndefined(HhMmSchema.optional()),

    mileage: MileageSchema,
    amountRequested: z.number().nonnegative().max(9_999_999),
    hoursAdjusted: HoursAdjustedSchema.optional().default(0),

    comment: emptyStringToUndefined(z.string().max(2_000).optional()),
    orderNumber: emptyStringToUndefined(z.string().max(64).optional()),
    orderDate: emptyStringToUndefined(IsoDateSchema.optional()),

    /** Optional pre-uploaded attachment IDs (auth screenshot, photos, etc.). */
    attachmentIds: z.array(UuidSchema).max(20).optional(),
  })
  .strict()
  .refine((v) => v.dateStart <= v.dateEnd, {
    message: 'dateStart must be on or before dateEnd',
    path: ['dateStart'],
  });
export type SubmitClaimDto = z.infer<typeof SubmitClaimSchema>;

// ─── Preview (server-side live preview) ──────────────────

/**
 * POST /claims/:nrZgl/preview — slim subset of `SubmitClaimSchema` covering
 * just the inputs that affect the km-calc breakdown. Carrier identity and
 * vehicle ownership are enforced at the route guard, not the schema.
 */
export const PreviewClaimSchema = z
  .object({
    vehicleId: UuidSchema,
    dateStart: IsoDateSchema,
    dateEnd: IsoDateSchema,
    timeFrom: emptyStringToUndefined(HhMmSchema.optional()),
    timeTo: emptyStringToUndefined(HhMmSchema.optional()),
    mileage: MileageSchema,
    hoursAdjusted: HoursAdjustedSchema.optional().default(0),
  })
  .strict()
  .refine((v) => v.dateStart <= v.dateEnd, {
    message: 'dateStart must be on or before dateEnd',
    path: ['dateStart'],
  });
export type PreviewClaimDto = z.infer<typeof PreviewClaimSchema>;

// ─── Reklamacja ──────────────────────────────────────────

/**
 * POST /claims/:nrZgl/reklamacja — a carrier disputes a decided claim.
 * `kwotaReklamacji` is the new amount the carrier is now asking for.
 */
export const SubmitReklamacjaSchema = z
  .object({
    tresc: z.string().min(1).max(4_000),
    kwotaReklamacji: z.number().nonnegative().max(9_999_999),
  })
  .strict();
export type SubmitReklamacjaDto = z.infer<typeof SubmitReklamacjaSchema>;

// ─── km-calc breakdown row (mirror of MonthBreakdown in domain/km-calc) ──

/**
 * Wire shape for one month in the breakdown column on `Claim.breakdown`
 * (Json) and as returned by `/preview`. Matches the `MonthBreakdown`
 * interface in `domain/km-calc.ts` — kept as a separate Zod schema so
 * the wire contract is independent of the engine's TS types.
 *
 * The TS type alias here is `MonthBreakdownDto` to avoid colliding with
 * the engine's `MonthBreakdown` interface which is also re-exported
 * from `@magguarantee/shared`.
 */
export const MonthBreakdownSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  workingDays: z.number().nonnegative(),
  kmPerDay: z.number().nonnegative(),
  ratePerKm: z.number().nonnegative(),
  kmInMonth: z.number().nonnegative(),
});
export type MonthBreakdownDto = z.infer<typeof MonthBreakdownSchema>;

export const KmCalcBreakdownSchema = z.object({
  totalDays: z.number().nonnegative(),
  kmGuaranteed: z.number().nonnegative(),
  ratePerKmEffective: z.number().nonnegative(),
  breakdown: z.array(MonthBreakdownSchema),
});
export type KmCalcBreakdown = z.infer<typeof KmCalcBreakdownSchema>;

// ─── Preview response ────────────────────────────────────

export const PreviewClaimResponseSchema = z.object({
  kmGuaranteed: z.number().nonnegative(),
  kmDifference: z.number(), // can be negative if mileage > guaranteed
  paymentEur: z.number().nonnegative(),
  ratePerKmEffective: z.number().nonnegative(),
  breakdown: KmCalcBreakdownSchema,
});
export type PreviewClaimResponse = z.infer<typeof PreviewClaimResponseSchema>;

// ─── Filters (list / cursor pagination) ──────────────────

export const ClaimFiltersSchema = z
  .object({
    status: ClaimStatusSchema.optional(),
    carrierId: UuidSchema.optional(),
    vehicleId: UuidSchema.optional(),
    /** ISO date — match claims whose `dateStart` is on or after. */
    from: IsoDateSchema.optional(),
    /** ISO date — match claims whose `dateEnd` is on or before. */
    to: IsoDateSchema.optional(),
    q: z.string().min(1).max(64).optional(),
    /** Cursor is the `nrZgl` of the previous page tail (string, not UUID). */
    cursor: z.string().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type ClaimFilters = z.infer<typeof ClaimFiltersSchema>;

// ─── Mini-references (vehicle / carrier / user) ──────────

const CarrierMiniSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
});

const VehicleMiniSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
});

const UserMiniSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
});

const ClaimAttachmentDtoSchema = z.object({
  id: UuidSchema,
  url: z.string(),
  mimeType: z.string().nullable(),
  size: z.number().int().nonnegative().nullable(),
  uploadedById: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type ClaimAttachmentDto = z.infer<typeof ClaimAttachmentDtoSchema>;

// ─── Full Claim DTO (response) ───────────────────────────

/**
 * Full Claim record returned by `GET /claims/:nrZgl` and `POST /claims`.
 * Mirrors the shape persisted by Prisma `Claim` — Decimal columns surface
 * as numbers on the wire (the API layer narrows them).
 */
export const ClaimDtoSchema = z.object({
  id: UuidSchema,
  nrZgl: z.string(),

  carrierId: UuidSchema,
  carrier: CarrierMiniSchema.nullable(),

  vehicleId: UuidSchema.nullable(),
  vehicle: VehicleMiniSchema.nullable(),
  vehiclePlateSnapshot: z.string(),

  dateStart: IsoDateTimeSchema,
  dateEnd: IsoDateTimeSchema,
  timeFrom: z.string().nullable(),
  timeTo: z.string().nullable(),

  drivenDays: z.number().nullable(),
  mileage: z.number().nullable(),
  kmPerDay: z.number().nullable(),
  kmGuaranteed: z.number().nullable(),
  kmDifference: z.number().nullable(),
  paymentEur: z.number().nullable(),
  ratePerKmEffective: z.number().nullable(),
  breakdown: KmCalcBreakdownSchema.nullable(),

  status: ClaimStatusSchema,
  statusChangedAt: IsoDateTimeSchema.nullable(),
  decidedById: UuidSchema.nullable(),
  decidedBy: UserMiniSchema.nullable(),

  comment: z.string().nullable(),
  orderNumber: z.string().nullable(),
  orderDate: IsoDateSchema.nullable(),

  authorizationRequired: z.boolean(),
  authorizationDescription: z.string().nullable(),
  authorizationToken: z.string().nullable(),
  authorizationDecidedAt: IsoDateTimeSchema.nullable(),

  amountRequested: z.number().nullable(),
  amountApproved: z.number().nullable(),
  margin: z.number().nullable(),
  amountMaximum: z.number().nullable(),

  reklamacjaSubmitted: z.boolean(),
  reklamacjaText: z.string().nullable(),
  reklamacjaResponse: z.string().nullable(),
  reklamacjaAmount: z.number().nullable(),
  hoursAdjusted: z.boolean(),
  statusBeforeReklamacja: ClaimStatusSchema.nullable(),
  origDateStart: IsoDateTimeSchema.nullable(),
  origDateEnd: IsoDateTimeSchema.nullable(),
  origMileage: z.number().nullable(),

  authScreenshotUrl: z.string().nullable(),
  attachments: z.array(ClaimAttachmentDtoSchema),

  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ClaimDto = z.infer<typeof ClaimDtoSchema>;

// ─── Slim list-item DTO ──────────────────────────────────

/**
 * Compact projection used by `GET /claims` lists — keeps payloads small
 * for table views. Exposes the carrier-relevant flags so the UI can show
 * status pills and reklamacja chevrons without a second round-trip.
 */
export const ClaimListItemSchema = z.object({
  id: UuidSchema,
  nrZgl: z.string(),
  status: ClaimStatusSchema,
  carrierId: UuidSchema,
  carrierName: z.string().nullable(),
  vehiclePlate: z.string(),
  dateStart: IsoDateTimeSchema,
  dateEnd: IsoDateTimeSchema,
  drivenDays: z.number().nullable(),
  mileage: z.number().nullable(),
  kmGuaranteed: z.number().nullable(),
  kmDifference: z.number().nullable(),
  paymentEur: z.number().nullable(),
  amountRequested: z.number().nullable(),
  amountApproved: z.number().nullable(),
  authorizationRequired: z.boolean(),
  reklamacjaSubmitted: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type ClaimListItem = z.infer<typeof ClaimListItemSchema>;
