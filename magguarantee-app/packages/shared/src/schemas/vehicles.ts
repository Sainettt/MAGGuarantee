// Wave 3 — Vehicles DTO contracts.
//
// Source of truth for `/api/v1/vehicles/*` per docs/13-api-design.md#vehicles
// and docs/04-data-model.md (Vehicle invariants: composite (carrierId, plateNumber)
// uniqueness; plannerId → role=planista; dispatchTeamId → Team (Phase 11 — the
// legacy single `dispatcherId → role=dyspozytor` FK was replaced by a Team).
//
// ── Attachments (porozumienie / gps / cabotage) ──────────
// Vehicle documents (porozumienie/agreement scan, umowa GPS, cabotage permits)
// are scanned files stored in MinIO and tracked via `VehicleAttachment` rows.
// The Vehicle create/edit modal is therefore a `multipart/form-data` endpoint —
// files arrive as separate parts, not in the JSON body. As a result the
// conditional "attachment required" rules (gps-when-device, cabotage pair)
// CANNOT be expressed in the body Zod schema below (Zod only sees the scalar
// fields). They are enforced at the service layer instead — see
// `VehiclesService` and the rules documented under
// docs/13-api-design.md#vehicles. The schemas here validate ONLY the
// non-file form fields.

import { z } from 'zod';

import {
  AdrClassSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';
import { VehicleDispatchTeamSchema } from './teams';

// ─── Field primitives ────────────────────────────────────

const PlateSchema = z.string().min(2).max(16);

/**
 * EURO emission norm. Restricted to a SINGLE value `VI` — EURO III/IV were
 * dropped 2026-05 and V was dropped 2026-07 (DB `enum EuroNorm` now `{ VI }`).
 * MAGTRANS only admits EURO VI trucks to the km-guarantee program. Create
 * defaults to `VI`.
 */
export const EuroNormSchema = z.enum(['VI']);
export type EuroNorm = z.infer<typeof EuroNormSchema>;

/**
 * Countries where a vehicle may haul waste (`Vehicle.wasteCountries`, array).
 * Mirror of the Prisma `enum WasteCountry` (the shared package cannot import
 * the database package — keep this list in lockstep with schema.prisma).
 * `LUX`/`GB` avoid ambiguous 2-letter reuse; the rest are ISO-ish shortcodes.
 */
export const WasteCountrySchema = z.enum([
  'DE',
  'NL',
  'AT',
  'BE',
  'LUX',
  'FR',
  'GB',
  'IT',
  'CZ',
  'PL',
]);
export type WasteCountry = z.infer<typeof WasteCountrySchema>;

const VehicleTypeSchema = z.enum(['MEGA', 'STD', 'COIL']);

/**
 * Delegation-driven vehicle lifecycle status — the READ-TIME classification of
 * a LIVE vehicle (there is no stored status column). Zod mirror of the pure
 * `VehicleLifecycleStatus` union in `@magguarantee/shared`'s
 * `domain/vehicle-status.ts` (keep the two in lockstep):
 *
 *   - `wylaczona`    — `Vehicle.active=false` (manual deactivation, clock off).
 *   - `aktywna`      — active AND a non-terminal delegation
 *                      (zgloszony/gotowy/w_trasie) exists.
 *   - `stojaca`      — active, no active delegation, idle 0–14 calendar days.
 *   - `nieaktywna`   — …idle 15–28 calendar days.
 *   - `do_usuniecia` — …idle ≥29 calendar days (overdue for removal review).
 *
 * Days are CALENDAR days (Europe/Warsaw) from the anchor
 * `max(actualReturnAt over zjechał) ?? Vehicle.createdAt`. Reused by both the
 * full `VehicleDto` and the slim fleet list items (per-row badge).
 */
export const VehicleLifecycleStatusSchema = z.enum([
  'wylaczona',
  'aktywna',
  'stojaca',
  'nieaktywna',
  'do_usuniecia',
]);

const vehicleAttributeFields = {
  /**
   * REQUIRED on create (docs/29 R7) — the vehicle's first planista, set
   * directly in the create form. Service-side: an ACTIVE `planista`; the api
   * opens the `create` row of the planista journal in the same insert. Every
   * later change goes through a transfer request — `PATCH` refuses the field.
   */
  plannerId: UuidSchema,
  /**
   * Phase 11 — the dispatch TEAM this vehicle is assigned to (replaces the
   * legacy single `dispatcherId`). REQUIRED on create — every vehicle must be
   * attached to a team. The DB column stays nullable (legacy rows may be
   * unassigned), but the API contract mandates it here. Service-side: must
   * reference an ACTIVE `Team`.
   */
  dispatchTeamId: UuidSchema,
  notes: emptyStringToUndefined(z.string().max(2_000).optional()),
  /**
   * REQUIRED — Vehicle.certificateL is NOT NULL.
   * Converted from enum L1/L2/L3 to Boolean in
   * 20260515130307_vehicle_certificate_l_to_boolean.
   */
  certificateL: z.boolean(),
  /** Vehicle.euro is NOT NULL; the sole admitted value is `VI` (defaults to VI). */
  euro: EuroNormSchema.optional().default('VI'),
  fuelCard: z.boolean().optional().default(false),
  /**
   * Fuel-card detail fields. Populated only when `fuelCard=true`
   * (cross-field-enforced by `vehicleFuelCardRefine` + the service). Nullable/
   * optional so an omitted / empty part parses; the service normalises them to
   * null when `fuelCard=false`.
   *  - number — EXACTLY 16 digits
   *  - expiry — ISO date (`YYYY-MM-DD`, `@db.Date`)
   *  - pin    — 4–6 digits
   */
  fuelCardNumber: emptyStringToUndefined(
    z.string().regex(/^\d{16}$/, 'fuelCardNumber musi mieć dokładnie 16 cyfr').optional(),
  ),
  fuelCardExpiry: emptyStringToUndefined(IsoDateSchema.optional()),
  fuelCardPin: emptyStringToUndefined(
    z.string().regex(/^\d{4,6}$/, 'fuelCardPin musi mieć 4–6 cyfr').optional(),
  ),
  /** REQUIRED — Vehicle.type is NOT NULL since phase3_blocks. */
  type: VehicleTypeSchema,
  gb: z.boolean().optional(),
  it: z.boolean().optional(),
  fr: z.boolean().optional(),
  /** Porozumienie flag. The porozumienie scan (when present) is tracked as a
   *  `VehicleAttachment` (category=agreement) — SOFT, never save-blocking. */
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
  /** Typed enum array (was free-text). `wasteAllowed=true ⇒ ≥1` (refine). */
  wasteCountries: z.array(WasteCountrySchema).max(64).optional(),
  cabotageDe: z.boolean().optional(),
  cabotageFr: z.boolean().optional(),
  /**
   * ADR cargo permit flag. `adr=true ⇒ adrClasses ≥1` (refine + service). The
   * ADR certificate scan (świadectwo ADR) lives on the Driver as a
   * `DriverAttachment` (2026-05-29); the vehicle keeps only this checkbox.
   */
  adr: z.boolean().optional(),
  /** ADR top-level classes ("1".."9"). Meaningful only when `adr=true`. */
  adrClasses: z.array(AdrClassSchema).max(9).optional(),
  /**
   * Tracker device id — OPTIONAL, nullable again since 2026-07 (not every
   * vehicle carries a GPS device at create time). When a NON-EMPTY value is
   * present the service requires a live `gps` VehicleAttachment (umowa GPS
   * scan). Empty parts coerce to undefined.
   */
  gpsMobilePhone: emptyStringToUndefined(z.string().min(1).max(32).optional()),
  sideNumber: emptyStringToUndefined(z.string().max(16).optional()),
};

// ─── Cross-field refinements (shared by create + update) ──

/**
 * `fuelCard=true ⇒ fuelCardNumber + fuelCardExpiry + fuelCardPin` all present.
 * Applied to both create and update object schemas; the service additionally
 * asserts the post-patch effective state (Zod can't see a partial PATCH).
 */
export const vehicleFuelCardRefine = (
  d: {
    fuelCard?: boolean;
    fuelCardNumber?: string | null;
    fuelCardExpiry?: string | null;
    fuelCardPin?: string | null;
  },
  ctx: z.RefinementCtx,
): void => {
  if (d.fuelCard !== true) return;
  const missing = (v: string | null | undefined): boolean =>
    v === undefined || v === null || v === '';
  if (missing(d.fuelCardNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fuelCardNumber wymagany gdy fuelCard=true',
      path: ['fuelCardNumber'],
    });
  }
  if (missing(d.fuelCardExpiry)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fuelCardExpiry wymagany gdy fuelCard=true',
      path: ['fuelCardExpiry'],
    });
  }
  if (missing(d.fuelCardPin)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fuelCardPin wymagany gdy fuelCard=true',
      path: ['fuelCardPin'],
    });
  }
};

/** Shared message for the HARD `fuelCard ⇒ agreement` rule — kept in lockstep
 *  with the service's `CROSS_FIELD_MESSAGES.fuelCardAgreement`. */
const FUEL_CARD_AGREEMENT_MESSAGE =
  'Karta paliwowa wymaga zaznaczenia porozumienia';

/**
 * HARD cross-field rule: `fuelCard=true ⇒ agreement=true`. A vehicle carrying a
 * fuel card MUST also have the porozumienie FLAG set — no exceptions,
 * save-blocking (422). Issued on `path: ['fuelCard']` (the field the operator
 * toggled to trigger it). `agreement` is `Boolean?` — NULL is treated as false.
 *
 * This is the CREATE variant: an absent/null `agreement` is treated as false
 * (create fills the whole object), so `fuelCard=true` with `agreement` omitted
 * correctly fails. On UPDATE the object is partial and this convention does NOT
 * hold — the update superRefine uses a both-present guard (mirroring the
 * gb/it/fr rule) so a partial PATCH `{fuelCard:true}` on a vehicle whose stored
 * `agreement=true` parses cleanly; the authoritative post-patch check lives in
 * the service (`_crossFieldViolations` over `_effectiveState`), which covers the
 * stored-agreement edge exactly.
 *
 * This is the HARD gate on the FLAG only. It is UNRELATED to the derived, SOFT
 * `fuelCardBlocked` badge (missing porozumienie SCAN) — that stays untouched; a
 * missing scan never blocks a save.
 */
export const vehicleFuelCardAgreementRefine = (
  d: { fuelCard?: boolean; agreement?: boolean | null },
  ctx: z.RefinementCtx,
): void => {
  if (d.fuelCard === true && d.agreement !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: FUEL_CARD_AGREEMENT_MESSAGE,
      path: ['fuelCard'],
    });
  }
};

/** `wasteAllowed=true ⇒ wasteCountries ≥1`; `adr=true ⇒ adrClasses ≥1`. */
export const vehicleWasteAdrRefine = (
  d: {
    wasteAllowed?: boolean;
    wasteCountries?: string[];
    adr?: boolean;
    adrClasses?: string[];
  },
  ctx: z.RefinementCtx,
): void => {
  if (d.wasteAllowed === true && (d.wasteCountries?.length ?? 0) < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'wasteCountries wymaga min. 1 kraju gdy wasteAllowed=true',
      path: ['wasteCountries'],
    });
  }
  if (d.adr === true && (d.adrClasses?.length ?? 0) < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'adrClasses wymaga min. 1 klasy gdy adr=true',
      path: ['adrClasses'],
    });
  }
};

/** Counts the explicitly-`true` UK/IT/FR access flags. */
const countUkItFr = (
  gb?: boolean | null,
  it?: boolean | null,
  fr?: boolean | null,
): number => [gb, it, fr].filter((v) => v === true).length;

// ─── Create ──────────────────────────────────────────────

/** Underlying ZodObject — exported so web/zodResolver can compose it. */
export const CreateVehicleObjectSchema = z
  .object({
    carrierId: UuidSchema,
    plateNumber: PlateSchema,
    active: z.boolean().optional(),
    ...vehicleAttributeFields,
  })
  .strict();

/**
 * The cross-field rules of a COMPLETE vehicle body (create semantics: an
 * absent flag counts as `false`). Shared by {@link CreateVehicleSchema} and the
 * web edit form's {@link VehicleEditFormSchema}, so both validate identically.
 */
function refineCompleteVehicle(
  d: Parameters<typeof vehicleFuelCardRefine>[0] &
    Parameters<typeof vehicleFuelCardAgreementRefine>[0] &
    Parameters<typeof vehicleWasteAdrRefine>[0] & {
      gb?: boolean;
      it?: boolean;
      fr?: boolean;
    },
  ctx: z.RefinementCtx,
): void {
  vehicleFuelCardRefine(d, ctx);
  vehicleFuelCardAgreementRefine(d, ctx);
  vehicleWasteAdrRefine(d, ctx);
  // min 2 of {gb, it, fr} — enforced at create (undefined counts as false).
  if (countUkItFr(d.gb, d.it, d.fr) < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Wymagane min. 2 z 3 dostępów: gb / it / fr',
      path: ['gb'],
    });
  }
}

export const CreateVehicleSchema = CreateVehicleObjectSchema.superRefine(
  refineCompleteVehicle,
);
export type CreateVehicleDto = z.infer<typeof CreateVehicleSchema>;

/**
 * WEB-ONLY resolver of the vehicle EDIT form (docs/29 R1, docs/14 §17.2.2).
 * The edit form holds the full vehicle (it is diffed into the PATCH body by
 * the caller), so it validates with the create rules — minus `plannerId`,
 * which the edit form neither renders nor registers: after creation the
 * planista changes only through a transfer request, and a PATCH carrying the
 * key is refused (422 `VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER`).
 *
 * `.strip()` instead of `.strict()`: a stray form key (e.g. a `plannerId`
 * left over from a create-mode render) is DROPPED from the output rather than
 * failing the form with a root-level issue no field can display. Not an api
 * request schema — the api validates `PATCH` with {@link UpdateVehicleSchema}.
 */
export const VehicleEditFormSchema = CreateVehicleObjectSchema.omit({
  plannerId: true,
})
  .strip()
  .superRefine(refineCompleteVehicle);
export type VehicleEditFormValues = z.infer<typeof VehicleEditFormSchema>;

// ─── Update ──────────────────────────────────────────────

/**
 * 422 — `PATCH /vehicles/:id` carried `plannerId`. After creation nobody
 * changes a vehicle's planista directly — not an opiekun, not an admin, not a
 * lider (docs/29 R1): it moves only through an approved transfer request
 * (`POST /vehicles/:id/planner-transfers`). The field is refused, never
 * silently dropped, so a stale client learns why its edit did nothing.
 */
export const VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER =
  'VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER' as const;

/** Human fallback for {@link VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER} — the web localises by code. */
export const VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER_MESSAGE =
  'Planistę pojazdu zmienia się tylko wnioskiem o przekazanie.';

/**
 * Underlying ZodObject — exported so web/zodResolver can compose it.
 *
 * `plannerId` is deliberately ABSENT (docs/29 R1) — see
 * {@link VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER}. The edit form must not
 * register it and the PATCH body must not carry it.
 */
export const UpdateVehicleObjectSchema = z
  .object({
    plateNumber: PlateSchema.optional(),
    active: z.boolean().optional(),
    /** Phase 11 — reassign the dispatch Team. Omit = leave unchanged; it
     *  cannot be cleared to null (a vehicle must always keep a team). */
    dispatchTeamId: UuidSchema.optional(),
    notes: emptyStringToUndefined(z.string().max(2_000).nullable().optional()),
    // The following fields are NOT NULL since phase3_blocks. PATCH accepts an
    // update (omit means "do not touch") but cannot null them.
    certificateL: z.boolean().optional(),
    euro: EuroNormSchema.optional(),
    type: VehicleTypeSchema.optional(),
    rateDe: z.number().nonnegative().optional(),
    rateUe: z.number().nonnegative().optional(),
    rateExport: z.number().nonnegative().optional(),
    rateImport: z.number().nonnegative().optional(),
    fuelCard: z.boolean().optional(),
    /** Fuel-card detail — nullable (clearable) on update; service also clears
     *  all three when fuelCard=false. */
    fuelCardNumber: emptyStringToUndefined(
      z
        .string()
        .regex(/^\d{16}$/, 'fuelCardNumber musi mieć dokładnie 16 cyfr')
        .nullable()
        .optional(),
    ),
    fuelCardExpiry: emptyStringToUndefined(IsoDateSchema.nullable().optional()),
    fuelCardPin: emptyStringToUndefined(
      z
        .string()
        .regex(/^\d{4,6}$/, 'fuelCardPin musi mieć 4–6 cyfr')
        .nullable()
        .optional(),
    ),
    gb: z.boolean().nullable().optional(),
    it: z.boolean().nullable().optional(),
    fr: z.boolean().nullable().optional(),
    agreement: z.boolean().nullable().optional(),
    wasteAllowed: z.boolean().optional(),
    wasteCountries: z.array(WasteCountrySchema).max(64).optional(),
    cabotageDe: z.boolean().optional(),
    cabotageFr: z.boolean().optional(),
    /** ADR cargo permit flag. `adr=true ⇒ adrClasses ≥1` (refine + service). */
    adr: z.boolean().optional(),
    adrClasses: z.array(AdrClassSchema).max(9).optional(),
    /**
     * Tracker device id — nullable (clearable) on update. When present it must
     * be non-empty; a non-empty effective value requires a live `gps`
     * attachment (service-side).
     */
    gpsMobilePhone: emptyStringToUndefined(
      z.string().min(1).max(32).nullable().optional(),
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
  .strict();

/**
 * `PATCH /vehicles/:id` body as the api validates it.
 *
 * `plannerId` is accepted as a KEY only to be refused as a business rule: a
 * `custom` issue with `params.code = VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER`,
 * which `ZodValidationPipe` answers with 422 + `extensions.code` (docs/13
 * «Формат ответов») — a bare `.strict()` rejection would be an anonymous 400.
 * Applies to every role, admin included (docs/29 R1). The output type has no
 * `plannerId` (the transform drops the refused key).
 */
export const UpdateVehicleSchema = UpdateVehicleObjectSchema.extend({
  plannerId: z.unknown().optional(),
})
  .superRefine((d, ctx) => {
    if (d.plannerId !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['plannerId'],
        message: VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER_MESSAGE,
        params: { code: VEHICLE_PLANNER_CHANGE_REQUIRES_TRANSFER },
      });
    }
  })
  .superRefine((d, ctx) => {
    vehicleFuelCardRefine(d, ctx);
    vehicleWasteAdrRefine(d, ctx);
    // HARD `fuelCard=true ⇒ agreement=true` — on PATCH only checkable when BOTH
    // fields are present in the payload (mirrors the gb/it/fr `!== undefined`
    // guard below; the edit form always sends both). `agreement` is nullable, so
    // "present but not true" is `false` OR explicit `null` (clearing the flag).
    // A partial PATCH that touches only `fuelCard` defers to the service's
    // authoritative post-patch effective state, which sees the stored
    // `agreement`. NOTE: this canNOT reuse `vehicleFuelCardAgreementRefine` —
    // that CREATE variant treats absent `agreement` as false and would
    // false-reject a valid `{fuelCard:true}` PATCH on an already-agreement=true
    // vehicle.
    if (
      d.fuelCard === true &&
      (d.agreement === false || d.agreement === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: FUEL_CARD_AGREEMENT_MESSAGE,
        path: ['fuelCard'],
      });
    }
    // min 2 of {gb, it, fr} — on PATCH only checkable when all three are
    // present in the payload (the edit form always sends all three); the
    // service asserts the authoritative post-patch effective state.
    if (
      d.gb !== undefined &&
      d.it !== undefined &&
      d.fr !== undefined &&
      countUkItFr(d.gb, d.it, d.fr) < 2
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Wymagane min. 2 z 3 dostępów: gb / it / fr',
        path: ['gb'],
      });
    }
  })
  // The refine above already refused a present `plannerId`; drop the key so
  // the output (and `UpdateVehicleDto`) cannot carry it.
  .transform(({ plannerId: _plannerId, ...rest }) => rest);
export type UpdateVehicleDto = z.infer<typeof UpdateVehicleSchema>;

// ─── Filters ─────────────────────────────────────────────

export const VehicleFiltersSchema = z
  .object({
    carrierId: UuidSchema.optional(),
    plannerId: UuidSchema.optional(),
    /** Phase 11 — filter by dispatch Team (replaces `dispatcherId`). */
    dispatchTeamId: UuidSchema.optional(),
    active: z.coerce.boolean().optional(),
    /**
     * Vehicle-status rework — narrow to ONE lifecycle bucket (the KPI-tile
     * drill-down: «Aktywne» / «Stojące» / «Długo stojące» / «Do usunięcia» /
     * «Wyłączone» link into the list pre-filtered).
     *
     * NOT a stored column: `wylaczona` maps straight onto `active=false`, but
     * the four idle-clock states are DERIVED at read time from the delegation
     * state + the idle anchor (see {@link VehicleLifecycleStatusSchema}), so the
     * service classifies the scoped set in memory before paging. Combining it
     * with a contradictory `active` (e.g. `active=true` + `wylaczona`) is a
     * legal query that simply matches nothing.
     */
    lifecycleStatus: VehicleLifecycleStatusSchema.optional(),
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
  createdAt: IsoDateTimeSchema,
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
 *  - `gps`                  — umowa GPS scan (required when `gpsMobilePhone` is set)
 *  - `agreement`            — porozumienie scan (SOFT — never save-blocking; gates
 *                             the derived fuel-card BLOCKED state)
 *  - `cabotage_de_insurance`— German cabotage insurance (ubezpieczenie kabotażowe),
 *                             required when `Vehicle.cabotageDe` is set
 *
 * `contract` (the legacy scanned "umowa") was removed 2026-07 — the umowa
 * concept no longer exists; porozumienie (category `agreement`) is the only
 * vehicle agreement document. `cabotage_fr` was removed 2026-07 — kabotaż FR is
 * a checkbox-only flag (`Vehicle.cabotageFr`), no scan. `cabotage_de` (the
 * German cabotage permit screenshot) was removed 2026-07 — kabotaż DE now
 * requires ONLY the insurance scan (`cabotage_de_insurance`), while
 * `Vehicle.cabotageDe` stays a boolean flag. `adr` was removed 2026-05-29 —
 * the ADR cert scan moved to the Driver (świadectwo ADR) as a
 * `DriverAttachment`.
 */
export const VehicleAttachmentCategorySchema = z.enum([
  'gps',
  'agreement',
  'cabotage_de_insurance',
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
  fuelCard: z.boolean(),
  /** Fuel-card detail — populated only when `fuelCard=true`, else null. */
  fuelCardNumber: z.string().nullable(),
  fuelCardExpiry: IsoDateSchema.nullable(),
  fuelCardPin: z.string().nullable(),
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
  wasteCountries: z.array(WasteCountrySchema),
  cabotageDe: z.boolean(),
  cabotageFr: z.boolean(),
  /** Default false in DB — always present on the wire. `adr=true ⇒ adrClasses ≥1`. */
  adr: z.boolean(),
  /** ADR top-level classes ("1".."9"). Empty unless `adr=true`. */
  adrClasses: z.array(AdrClassSchema),
  /** Tracker device id — nullable again since 2026-07. */
  gpsMobilePhone: z.string().nullable(),
  sideNumber: z.string().nullable(),
  lastDroveAt: IsoDateTimeSchema.nullable(),
  /**
   * DERIVED server-side (never stored) — the delegation-driven lifecycle
   * status computed at read time from `active` + active-delegation existence +
   * the idle anchor. See {@link VehicleLifecycleStatusSchema}.
   */
  lifecycleStatus: VehicleLifecycleStatusSchema,
  /**
   * DERIVED — calendar days (Europe/Warsaw) since the idle anchor
   * (`max(actualReturnAt over zjechał) ?? createdAt`). `null` when no idle clock
   * runs (status `wylaczona` or `aktywna`).
   */
  daysSinceReturn: z.number().int().nullable(),
  /**
   * The CURRENT planista (docs/29 §2 p.5) — changed only by an approved
   * transfer request. Vehicle-level screens read it live (U7); a delegation
   * carries its own snapshot (`DelegationDto.planner`).
   */
  plannerId: UuidSchema.nullable(),
  planner: z
    .object({
      id: UuidSchema,
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  /** Phase 11 — the dispatch Team FK (replaces `dispatcherId`). */
  dispatchTeamId: UuidSchema.nullable(),
  /**
   * Phase 11 — the dispatch Team with its dispatcher roster (replaces the
   * single `dispatcher`). NON-SENSITIVE — no rates. `null` when unassigned.
   */
  dispatchTeam: VehicleDispatchTeamSchema.nullable(),
  carrier: z
    .object({
      id: UuidSchema,
      login: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  /**
   * The carrier's opiekun (`Carrier.opiekun`, a `User`), resolved via
   * `vehicle.carrier.opiekun`. Non-sensitive; additive — never narrows
   * authorization. `null` when no carrier/opiekun is resolvable.
   */
  opiekun: z
    .object({ id: UuidSchema, login: z.string(), name: z.string().nullable() })
    .nullable(),
  /** Non-deleted gps/agreement/cabotage attachments for this vehicle. */
  attachments: z.array(VehicleAttachmentDtoSchema),
  /**
   * DERIVED server-side (never stored). `true` when the fuel card is present
   * but blocked — `fuelCard=true` AND (`agreement!==true` OR no live
   * `agreement` attachment / porozumienie scan).
   */
  fuelCardBlocked: z.boolean(),
  /**
   * DERIVED server-side (never stored). `true` when `agreement=true` but there
   * is no live `agreement` attachment (porozumienie scan missing — SOFT, never
   * save-blocking).
   */
  agreementScanMissing: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type VehicleDto = z.infer<typeof VehicleDtoSchema>;
