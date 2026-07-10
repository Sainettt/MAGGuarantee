// Wave 3 — Carriers DTO contracts.
//
// Source of truth for `/api/v1/carriers/*` per docs/13-api-design.md#carriers
// and docs/04-data-model.md (Carrier extension of User, opiekunId invariants).
//
// Phase 2 migration `phase2_required_fields_carrier_driver_trailer` made
// `phone` and `opiekunId` NOT NULL — both are required on create and
// non-nullable in the response DTO. Existing carrier UIs MUST send `opiekunId`
// explicitly; the service-side fallback for `role=opiekun` callers is kept as
// defense-in-depth but the schema layer enforces presence first.

import { z } from 'zod';

import {
  EuVatSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  TaxIdSchema,
  UuidSchema,
  emptyStringToUndefined,
} from './common';

// ─── Field primitives shared by create/update ────────────

const LoginSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, {
    message: 'login may contain only letters, digits, dot, hyphen, underscore',
  });

const NameSchema = z.string().min(1).max(128);
const EmailSchema = z.string().email().max(160);
const PhoneRequiredSchema = z.string().min(1).max(64);

/**
 * Carrier onboarding state — DERIVED on read from the live `_count` of active,
 * non-soft-deleted Vehicle / Trailer / Driver rows owned by the carrier.
 *
 * The previous enum-backed `Carrier.onboardingStatus` column (migration
 * `20260519095752_carrier_onboarding_status`) was dropped in migration
 * `20260519142043_drop_carrier_onboarding_status` because the column and
 * derived state could drift (e.g. last vehicle gets soft-deleted but the
 * column stays at `COMPLETE`). The API now computes the booleans on every
 * read from `_count.{vehicles,trailers,drivers}` so the response can never
 * lie about the carrier's fleet shape.
 *
 * DISPLAY-ORIENTED today, but designed to be guard-friendly: a future
 * `@RequiresCompleteOnboarding()` decorator reads `onboarding.isComplete`
 * (see `CarriersService.isCarrierOnboardingComplete`).
 */
export const OnboardingDtoSchema = z.object({
  hasVehicle: z.boolean(),
  hasTrailer: z.boolean(),
  hasDriver: z.boolean(),
  /**
   * Composite — `hasVehicle && hasTrailer && hasDriver`. Computed by the
   * API; clients MUST NOT recompute (kept in the wire payload so consumers
   * don't have to know the rule).
   */
  isComplete: z.boolean(),
});
export type OnboardingDto = z.infer<typeof OnboardingDtoSchema>;

const carrierProfileFields = {
  /**
   * REQUIRED — generic tax ID (5–20 alphanumeric). Polish carriers send the
   * 10-digit NIP, foreign carriers their local TIN/Codice Fiscale/etc.
   * Country-specific format rules apply per-flow (e.g. Biała Lista only
   * validates 10-digit PL NIPs).
   */
  nip: TaxIdSchema,
  /**
   * OPTIONAL — EU VAT: country code + 2–12 alphanumeric (max 14 chars total,
   * which is the longest realistic EU VAT format — SE/LT/NL etc.). Some
   * carriers register without an EU VAT number and operate only with the local
   * NIP/TIN — the column is nullable since migration
   * `20260515112821_carrier_vat_id_optional`. NIP is the required identifier
   * here, `vatId` is opt-in.
   */
  vatId: emptyStringToUndefined(EuVatSchema.optional()),
  /** REQUIRED — Carrier.contactPerson is NOT NULL since phase3_blocks. */
  contactPerson: z.string().min(1).max(255),
  /** REQUIRED — Carrier.phone is NOT NULL since phase-2 migration. */
  phone: PhoneRequiredSchema,
  /** REQUIRED — Carrier.ordersEmail is NOT NULL since phase3_blocks. */
  ordersEmail: EmailSchema,
  /**
   * REQUIRED — Carrier.accountEur (IBAN) is NOT NULL since phase3_blocks.
   * We don't enforce ISO IBAN format here — Phase 4 adds VIES/IBAN check.
   */
  accountEur: z.string().min(1).max(64),
  accountPln: emptyStringToUndefined(z.string().max(64).optional()),
  /**
   * Defaults to 30 days at the DB level since phase3_blocks. Optional in the
   * Create DTO; required in the response DTO.
   */
  paymentTerms: z.number().int().nonnegative().max(365).optional().default(30),
  // REQUIRED — must be ≥ 250 000 EUR (business rule). The DB column is now
  // NOT NULL Decimal(12,2); Zod owns the positivity + minimum check (no CHECK
  // constraint at the DB level). The 250k floor mirrors MAGTRANS's carrier
  // qualification threshold and is enforced identically on Create and Update.
  insuranceValue: z.number().positive().min(250_000),
  insuranceExpiry: IsoDateSchema,
  licenseExpiry: IsoDateSchema,
  numberOfVehicle: z.number().int().nonnegative().max(10_000).optional(),
  /** REQUIRED — Carrier.companyAddress is NOT NULL since phase3_blocks. */
  companyAddress: z.string().min(1).max(500),
  /**
   * REQUIRED — Carrier.opiekunId is NOT NULL since phase-2 migration. UIs must
   * send it explicitly; the service still validates the referenced user has
   * role='opiekun' and is active.
   */
  opiekunId: UuidSchema,
};

// ─── Create ──────────────────────────────────────────────

/**
 * POST /carriers — provisions a `User(role=przewoznik)` and a `Carrier` row
 * in the same transaction. `password` is optional; when omitted the API
 * generates one and returns it as `temporaryPassword` (Phase 2 stub).
 */
export const CreateCarrierSchema = z
  .object({
    login: LoginSchema,
    email: EmailSchema,
    name: NameSchema,
    company: emptyStringToUndefined(z.string().max(255).optional()),
    password: z.string().min(10).max(128).optional(),
    ...carrierProfileFields,
  })
  .strict();
export type CreateCarrierDto = z.infer<typeof CreateCarrierSchema>;

// ─── Update ──────────────────────────────────────────────

/**
 * PATCH /carriers/:id — every field optional. `login` cannot be changed
 * (login is the carrier's stable identifier); to swap it admin should
 * deactivate + create new.
 *
 * `phone` and `opiekunId` are still optional in PATCH semantics (omit means
 * "do not touch"), but neither may be sent as `null` since the column is
 * NOT NULL.
 */
export const UpdateCarrierSchema = z
  .object({
    email: EmailSchema.optional(),
    name: NameSchema.optional(),
    company: emptyStringToUndefined(z.string().max(255).nullable().optional()),
    // PATCH semantics: omitting the key means "do not touch". Cannot send
    // null since the column is now NOT NULL.
    nip: emptyStringToUndefined(TaxIdSchema.optional()),
    vatId: emptyStringToUndefined(EuVatSchema.optional()),
    contactPerson: emptyStringToUndefined(
      z.string().max(255).nullable().optional(),
    ),
    phone: emptyStringToUndefined(PhoneRequiredSchema.optional()),
    ordersEmail: emptyStringToUndefined(EmailSchema.nullable().optional()),
    accountEur: emptyStringToUndefined(
      z.string().max(64).nullable().optional(),
    ),
    accountPln: emptyStringToUndefined(
      z.string().max(64).nullable().optional(),
    ),
    paymentTerms: z.number().int().nonnegative().max(365).nullable().optional(),
    // Must be ≥ 250 000 EUR (business rule) — same floor as Create.
    insuranceValue: z.number().positive().min(250_000).optional(),
    insuranceExpiry: emptyStringToUndefined(
      IsoDateSchema.nullable().optional(),
    ),
    licenseExpiry: emptyStringToUndefined(IsoDateSchema.nullable().optional()),
    numberOfVehicle: z
      .number()
      .int()
      .nonnegative()
      .max(10_000)
      .nullable()
      .optional(),
    companyAddress: emptyStringToUndefined(
      z.string().max(500).nullable().optional(),
    ),
    opiekunId: emptyStringToUndefined(UuidSchema.optional()),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateCarrierDto = z.infer<typeof UpdateCarrierSchema>;

// ─── Filters ─────────────────────────────────────────────

export const CarrierFiltersSchema = z
  .object({
    /** UUID of an opiekun User; admin only — opiekun is implicit (auto-self-assigned). */
    opiekunId: UuidSchema.optional(),
    active: z.coerce.boolean().optional(),
    /** Substring search on login / name / nip. Case-insensitive in the repo. */
    q: z.string().min(1).max(64).optional(),
    /**
     * Optional onboarding-completeness filter. Single boolean (replaces the
     * old multi-value enum filter on the now-dropped `onboardingStatus`
     * column):
     *   - `true`  → only carriers with at least one active vehicle AND
     *               trailer AND driver.
     *   - `false` → only carriers missing at least one of the three.
     *   - omitted → all carriers.
     *
     * The repo translates this into Prisma `some` / `none` relation filters
     * on the three fleet relations — see `CarriersRepository.list`.
     */
    onboardingComplete: z.coerce.boolean().optional(),
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type CarrierFilters = z.infer<typeof CarrierFiltersSchema>;

// ─── Response DTO ────────────────────────────────────────

export const CarrierDtoSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  login: z.string(),
  // NOT NULL after phase3_blocks.
  email: z.string().email(),
  name: z.string().nullable(),
  company: z.string().nullable(),
  active: z.boolean(),
  // `nip` is required at create — both DB column and response DTO are
  // therefore non-null. Polish carriers send the 10-digit NIP; foreign
  // carriers send their local TIN. `vatId` (EU VAT, country-prefixed) is
  // optional — the column is nullable since migration
  // `20260515112821_carrier_vat_id_optional`, so the response surfaces `null`
  // for carriers without an EU VAT number.
  nip: z.string(),
  vatId: z.string().nullable(),
  // NOT NULL after phase3_blocks.
  contactPerson: z.string(),
  phone: z.string(),
  ordersEmail: z.string().email(),
  accountEur: z.string(),
  accountPln: z.string().nullable(),
  paymentTerms: z.number().int(),
  insuranceValue: z.number(),
  insuranceExpiry: IsoDateSchema.nullable(),
  licenseExpiry: IsoDateSchema.nullable(),
  numberOfVehicle: z.number().int().nullable(),
  companyAddress: z.string(),
  /**
   * Derived onboarding-completeness block. `isComplete` = hasVehicle &&
   * hasTrailer && hasDriver; the booleans are computed from the live count
   * of active, non-soft-deleted children on every read (see
   * `CarriersRepository.list/findOne`). Replaces the dropped
   * `Carrier.onboardingStatus` column — see `OnboardingDtoSchema` above.
   */
  onboarding: OnboardingDtoSchema,
  opiekunId: UuidSchema,
  opiekun: z.object({
    id: UuidSchema,
    login: z.string(),
    name: z.string().nullable(),
  }),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CarrierDto = z.infer<typeof CarrierDtoSchema>;

/**
 * Response of POST /carriers and POST /carriers/:id/reset-password while
 * Phase 9's email pipeline is still pending. See UserWithTemporaryPassword
 * notes in `users.ts`.
 */
export const CarrierWithTemporaryPasswordSchema = CarrierDtoSchema.extend({
  temporaryPassword: z
    .string()
    .describe(
      '[dev-only — Phase 2] Plaintext password generated by the API. Will be replaced by email delivery in Phase 9.',
    ),
});
export type CarrierWithTemporaryPasswordDto = z.infer<
  typeof CarrierWithTemporaryPasswordSchema
>;

// ─── Attachments (company documents) ─────────────────────
//
// Unlike vehicle/driver attachments (which ride the entity's create/edit
// form), carrier documents are managed independently from a "Documents" tab —
// hence standalone upload/list/download/delete endpoints under
// `/carriers/:id/attachments`. Per docs/13-api-design.md#carriers.

/**
 * Category of a Carrier attachment, mirroring the DB
 * `enum CarrierAttachmentCategory` — the carrier's own company documents:
 *  - `insurance` — OCP insurance policy scan
 *  - `license`   — transport license scan
 *  - `kreptd`    — KREPTD extract
 *  - `other`     — catch-all for any other document
 *
 * Order mirrors the DB enum `{insurance, license, kreptd, other}`.
 *
 * The carrier-level `adr` category was REMOVED (2026-07): the carrier-level ADR
 * document is no longer a concept. ADR now lives per-vehicle (flag + classes,
 * no file) and per-driver (świadectwo scan, a `DriverAttachment`). Every
 * remaining carrier category may hold MULTIPLE files (there is no single-doc
 * category anymore).
 */
export const CarrierAttachmentCategorySchema = z.enum([
  'insurance',
  'license',
  'kreptd',
  'other',
]);
export type CarrierAttachmentCategory = z.infer<
  typeof CarrierAttachmentCategorySchema
>;

/**
 * `POST /carriers/:id/attachments` body — the `category` text part that rides
 * alongside the single `file` part of the multipart request. The file itself
 * is validated (MIME / size) at the service layer, not by Zod.
 */
export const UploadCarrierAttachmentSchema = z
  .object({
    category: CarrierAttachmentCategorySchema,
  })
  .strict();
export type UploadCarrierAttachmentDto = z.infer<
  typeof UploadCarrierAttachmentSchema
>;

/**
 * Public attachment DTO. NOTE: `storageKey` is deliberately omitted — it is
 * an internal MinIO object key and never leaves the API. Clients download
 * bytes via `GET /carriers/:id/attachments/:attachmentId/download`.
 */
export const CarrierAttachmentDtoSchema = z.object({
  id: UuidSchema,
  carrierId: UuidSchema,
  category: CarrierAttachmentCategorySchema,
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  uploadedById: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type CarrierAttachmentDto = z.infer<typeof CarrierAttachmentDtoSchema>;

// ─── Documents overview (opiekun "Dokumenty" tab) ─────────
//
// READ-ONLY aggregate for `GET /carriers/:id/documents/overview` — a single
// drill-down that gathers EVERY document tied to one carrier, grouped by the
// entity that owns it, so the opiekun "Dokumenty" tab can render them without
// N calls per vehicle/driver/trailer. Per docs/13-api-design.md#carriers.
//
// Downloads are NOT re-invented here: each grouped entry carries the ids the
// existing per-entity download route needs. The web layer streams bytes via:
//   - carrierDocs  → GET /carriers/:carrierId/attachments/:attachmentId/download
//   - vehicleDocs  → GET /vehicles/:vehicleId/attachments/:attachmentId/download
//   - trailerDocs  → GET /trailers/:trailerId/attachments/:attachmentId/download
//   - driverDocs   → GET /drivers/:driverId/attachments/:attachmentId/download
// `vehicleAdr` carries NO file (ADR per-vehicle is a flag + classes only).

/**
 * Vehicle-document categories that surface as FILES in the overview — mirrors
 * the DB `enum VehicleAttachmentCategory` (see `vehicles.ts`) 1:1, in the same
 * order. `agreement` (porozumienie scan) IS included: for the opiekun it is core
 * guarantee paperwork, and the "Dokumenty" tab gathers EVERY document type
 * (docs/14-design-system.md §5R lists "Porozumienie" as a visible type).
 */
export const CarrierDocVehicleCategorySchema = z.enum([
  'gps',
  'agreement',
  'cabotage_de_insurance',
]);
export type CarrierDocVehicleCategory = z.infer<
  typeof CarrierDocVehicleCategorySchema
>;

/** Lean vehicle identity carried on each vehicle-document entry. */
export const CarrierDocVehicleRefSchema = z.object({
  id: UuidSchema,
  /** `Vehicle.plateNumber` — the registration plate (label on the tab). */
  registration: z.string(),
  /** Internal side/board number (`Vehicle.sideNumber`); null when unset. */
  sideNumber: z.string().nullable(),
});
export type CarrierDocVehicleRef = z.infer<typeof CarrierDocVehicleRefSchema>;

/** One vehicle-attachment file entry (download via the vehicles route). */
export const CarrierDocVehicleEntrySchema = z.object({
  attachmentId: UuidSchema,
  fileName: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  vehicle: CarrierDocVehicleRefSchema,
});
export type CarrierDocVehicleEntry = z.infer<
  typeof CarrierDocVehicleEntrySchema
>;

/**
 * Per-category map of vehicle-document files. Every key is always present
 * (empty array when the carrier has no file in that category) so the UI can
 * render a stable set of sections.
 */
export const CarrierDocVehicleDocsSchema = z.object({
  gps: z.array(CarrierDocVehicleEntrySchema),
  agreement: z.array(CarrierDocVehicleEntrySchema),
  cabotage_de_insurance: z.array(CarrierDocVehicleEntrySchema),
});
export type CarrierDocVehicleDocs = z.infer<typeof CarrierDocVehicleDocsSchema>;

/**
 * Vehicles flagged `adr:true` — NO file (per-vehicle ADR is a flag + classes
 * only). Surfaced so the opiekun sees which trucks declare ADR and with which
 * classes.
 */
export const CarrierDocVehicleAdrSchema = z.object({
  vehicleId: UuidSchema,
  plate: z.string(),
  adrClasses: z.array(z.string()),
});
export type CarrierDocVehicleAdr = z.infer<typeof CarrierDocVehicleAdrSchema>;

/** One trailer XL-certificate entry (download via the trailers route). */
export const CarrierDocTrailerEntrySchema = z.object({
  attachmentId: UuidSchema,
  fileName: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  trailerId: UuidSchema,
  /** `Trailer.plateNumber` — the trailer registration plate. */
  registration: z.string(),
});
export type CarrierDocTrailerEntry = z.infer<
  typeof CarrierDocTrailerEntrySchema
>;

/** One driver ADR-certificate (świadectwo) entry (download via drivers route). */
export const CarrierDocDriverEntrySchema = z.object({
  attachmentId: UuidSchema,
  fileName: z.string(),
  size: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  driverId: UuidSchema,
  /** Driver full name (`firstName + ' ' + lastName`). */
  fullName: z.string(),
});
export type CarrierDocDriverEntry = z.infer<typeof CarrierDocDriverEntrySchema>;

/**
 * Response of `GET /carriers/:id/documents/overview`. Groups EVERY live
 * (soft-delete `deletedAt:null`) document tied to the carrier, by owning
 * entity, for the opiekun "Dokumenty" tab. Read-only — the web layer downloads
 * bytes via the EXISTING per-entity download routes using the ids each entry
 * carries (see the section header above).
 */
export const CarrierDocumentsOverviewDtoSchema = z.object({
  carrierId: UuidSchema,
  /** The carrier's own company documents (insurance/license/kreptd/other). */
  carrierDocs: z.array(CarrierAttachmentDtoSchema),
  /** Vehicle files grouped per category (gps/agreement/cabotage_de_insurance). */
  vehicleDocs: CarrierDocVehicleDocsSchema,
  /** Vehicles declaring ADR (flag + classes) — NO files. */
  vehicleAdr: z.array(CarrierDocVehicleAdrSchema),
  /** Trailer XL-certificate files (cert_xl). */
  trailerDocs: z.array(CarrierDocTrailerEntrySchema),
  /** Driver ADR-certificate (świadectwo) files. */
  driverDocs: z.array(CarrierDocDriverEntrySchema),
});
export type CarrierDocumentsOverviewDto = z.infer<
  typeof CarrierDocumentsOverviewDtoSchema
>;
