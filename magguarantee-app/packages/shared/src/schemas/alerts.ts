// Document-expiry alerts — DTO contracts for `GET /api/v1/alerts`.
//
// A single read-only endpoint returns every expiring/expired document the
// caller is allowed to see, pre-grouped by category (carrier / vehicle /
// driver) and pre-classified into severity buckets. In-app only — no email.
//
// Role gating (enforced in `AlertsService`, mirrored on the controller):
//   - admin   → every active entity's documents;
//   - opiekun → only documents of carriers they supervise
//               (`Carrier.opiekunId === user.sub`);
//   - any other role → 403.

import { z } from 'zod';

import { UuidSchema, IsoDateSchema } from './common';

/** Severity buckets — must match `DocumentAlertSeverity` in the domain layer. */
export const AlertSeveritySchema = z.enum([
  'expired',
  'critical',
  'warning',
  'upcoming',
]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

/** Zone the alert belongs to — drives the grouped sections on the page. */
export const AlertCategorySchema = z.enum(['carrier', 'vehicle', 'driver']);
export type AlertCategory = z.infer<typeof AlertCategorySchema>;

/**
 * Stable machine identifier for the specific document type. Lets the web map
 * to a localized label and (optionally) a deep-link target without parsing the
 * subject string.
 */
export const AlertDocTypeSchema = z.enum([
  'carrier_insurance', // Carrier.insuranceExpiry — ubezpieczenie OCP
  'carrier_license', // Carrier.licenseExpiry   — licencja transportowa
  'vehicle_fuel_card', // Vehicle.fuelCardExpiry  — karta paliwowa
  'driver_license', // Driver.licenseExpiry    — prawo jazdy
]);
export type AlertDocType = z.infer<typeof AlertDocTypeSchema>;

/** Which entity table the alert's `entityId` points at (for deep-linking). */
export const AlertEntityKindSchema = z.enum(['carrier', 'vehicle', 'driver']);
export type AlertEntityKind = z.infer<typeof AlertEntityKindSchema>;

/** One expiring/expired document. */
export const AlertItemSchema = z.object({
  /** Synthetic stable id: `${docType}:${entityId}`. Unique per (doc, entity). */
  id: z.string(),
  docType: AlertDocTypeSchema,
  category: AlertCategorySchema,
  severity: AlertSeveritySchema,
  /** Whole calendar days to expiry (Europe/Warsaw). <0 past, 0 today, >0 ahead. */
  daysToExpiry: z.number().int(),
  /** The document's expiry date (`YYYY-MM-DD`). */
  expiryDate: IsoDateSchema,
  /** Primary label of the thing that owns the document (plate / driver / firm). */
  entityLabel: z.string(),
  /** Entity the document hangs off — for a deep-link to its edit page. */
  entityKind: AlertEntityKindSchema,
  entityId: UuidSchema,
  /** Owning carrier — always present so the web can show context + scope link. */
  carrierId: UuidSchema,
  carrierName: z.string().nullable(),
});
export type AlertItem = z.infer<typeof AlertItemSchema>;

/** Per-category section (carrier / vehicle / driver). */
export const AlertGroupSchema = z.object({
  category: AlertCategorySchema,
  total: z.number().int().nonnegative(),
  items: z.array(AlertItemSchema),
});
export type AlertGroup = z.infer<typeof AlertGroupSchema>;

/** Per-severity counts across ALL groups — backs the summary tiles + nav badge. */
export const AlertTotalsSchema = z.object({
  expired: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  upcoming: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type AlertTotals = z.infer<typeof AlertTotalsSchema>;

export const AlertsMetaSchema = z.object({
  /** Outer window in days (documents beyond it are not surfaced). */
  warnDays: z.number().int().positive(),
  totals: AlertTotalsSchema,
});
export type AlertsMeta = z.infer<typeof AlertsMetaSchema>;

/** Full `GET /alerts` response. */
export const AlertsResponseSchema = z.object({
  meta: AlertsMetaSchema,
  groups: z.array(AlertGroupSchema),
});
export type AlertsResponse = z.infer<typeof AlertsResponseSchema>;
