// Phase 4.5 — Diagnostics DTO contracts.
//
// Source of truth for `/api/v1/diagnostics/*` per
// docs/13-api-design.md#diagnostics-admin-only. The dashboard endpoint is
// admin OR pracownik; everything else is admin-only — guard placement is in
// the controller, the schemas only describe the wire shapes.

import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common';

// ─── Dashboard ───────────────────────────────────────────────

export const DashboardClaimSummarySchema = z.object({
  id: UuidSchema,
  nrZgl: z.string(),
  status: z.string(),
  carrierName: z.string().nullable(),
  vehiclePlate: z.string().nullable(),
  paymentEur: z.number().nullable(),
  updatedAt: z.string().datetime(),
});
export type DashboardClaimSummary = z.infer<
  typeof DashboardClaimSummarySchema
>;

/**
 * One row in the verification-SLA dashboard buckets (`overdue` / `dueSoon`).
 *
 * Net-new for the pracownik verification-SLA "attention" widget
 * (docs/21-pracownik-verification-sla.md §4). Replaces the old single
 * `urgent` list — these rows are always `status === 'NA_WERYFIKACJI'` and
 * carry the signed `workingDaysLeft` (Polish working days) so the web widget
 * can render the «po terminie» / «{n} dni robocze» label without recomputing
 * the calendar. `paymentEur` / `updatedAt` are intentionally dropped — the
 * SLA widget surfaces nrZgl + carrier + plate + the deadline label only.
 */
export const DashboardSlaClaimSchema = z.object({
  id: UuidSchema,
  nrZgl: z.string(),
  status: z.string(),
  carrierName: z.string().nullable(),
  vehiclePlate: z.string().nullable(),
  /**
   * Signed Polish-working-day distance from "now" to the SLA deadline.
   * `< 0` → overdue, `0..3` → dueSoon. `overdue` rows always carry a
   * negative value; `dueSoon` rows are `0..3` inclusive.
   */
  workingDaysLeft: z.number().int(),
});
export type DashboardSlaClaim = z.infer<typeof DashboardSlaClaimSchema>;

export const DashboardAuditRowSummarySchema = z.object({
  id: UuidSchema,
  action: z.string(),
  targetType: z.string().nullable(),
  targetKey: z.string().nullable(),
  userLogin: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type DashboardAuditRowSummary = z.infer<
  typeof DashboardAuditRowSummarySchema
>;

export const DashboardTopCarrierSchema = z.object({
  carrierId: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
  totalEur: z.number(),
});
export type DashboardTopCarrier = z.infer<typeof DashboardTopCarrierSchema>;

export const DashboardMonthlyPointSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/u),
  count: z.number().int().nonnegative(),
  sumEur: z.number(),
});
export type DashboardMonthlyPoint = z.infer<
  typeof DashboardMonthlyPointSchema
>;

export const DashboardDtoSchema = z.object({
  kpi: z.object({
    total: z.number().int().nonnegative(),
    naWeryfikacji: z.number().int().nonnegative(),
    zaakceptowano: z.number().int().nonnegative(),
    odrzucono: z.number().int().nonnegative(),
    oczekujeNaAutoryzacje: z.number().int().nonnegative(),
  }),
  // Verification-SLA buckets (docs/21 §4). Mutually exclusive; `overdue`
  // wins over `dueSoon`. Each sorted by `workingDaysLeft` ascending
  // (most urgent first). `onTrack` claims are excluded entirely.
  overdue: z.array(DashboardSlaClaimSchema),
  dueSoon: z.array(DashboardSlaClaimSchema),
  recent: z.array(DashboardAuditRowSummarySchema),
  topCarriers: z.array(DashboardTopCarrierSchema),
  monthlySeries: z.array(DashboardMonthlyPointSchema),
  reklamacje: z.object({
    count: z.number().int().nonnegative(),
  }),
});
export type DashboardDto = z.infer<typeof DashboardDtoSchema>;

// ─── Mails ───────────────────────────────────────────────────

/**
 * One row in the diagnostics mails list. Mirrors the BullMQ `Job` shape but
 * with a redacted `data` payload — only `to` / `subject` / `template` are
 * surfaced (no PII or template variables).
 *
 * Until BullMQ ships, the API backs this with a Redis-stored ring buffer
 * written by `MailService` on every send. The contract is the same.
 */
export const DiagnosticsMailJobSchema = z.object({
  id: z.string(),
  state: z.enum([
    'completed',
    'failed',
    'active',
    'waiting',
    'delayed',
    'unknown',
  ]),
  attemptsMade: z.number().int().nonnegative(),
  failedReason: z.string().nullable(),
  data: z.object({
    to: z.string(),
    subject: z.string(),
    template: z.string().nullable(),
  }),
  createdAt: z.string().datetime().nullable(),
});
export type DiagnosticsMailJob = z.infer<typeof DiagnosticsMailJobSchema>;

export const DiagnosticsMailJobListSchema = z.array(
  DiagnosticsMailJobSchema,
);
export type DiagnosticsMailJobListDto = z.infer<
  typeof DiagnosticsMailJobListSchema
>;

export const DiagnosticsResendMailResponseSchema = z.object({
  id: z.string(),
});
export type DiagnosticsResendMailResponse = z.infer<
  typeof DiagnosticsResendMailResponseSchema
>;

// ─── Claims health ───────────────────────────────────────────

export const DiagnosticsClaimsHealthRowSchema = z.object({
  name: z.string(),
  count: z.number().int().nonnegative(),
  sampleIds: z.array(UuidSchema),
});
export type DiagnosticsClaimsHealthRow = z.infer<
  typeof DiagnosticsClaimsHealthRowSchema
>;

export const DiagnosticsClaimsHealthSchema = z.array(
  DiagnosticsClaimsHealthRowSchema,
);
export type DiagnosticsClaimsHealthDto = z.infer<
  typeof DiagnosticsClaimsHealthSchema
>;

// ─── DB health ───────────────────────────────────────────────

export const DiagnosticsDbTableSchema = z.object({
  name: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export type DiagnosticsDbTable = z.infer<typeof DiagnosticsDbTableSchema>;

export const DiagnosticsDbHealthSchema = z.object({
  postgres: z.object({
    ok: z.boolean(),
    latencyMs: z.number().nonnegative(),
    tables: z.array(DiagnosticsDbTableSchema),
  }),
  redis: z.object({
    ok: z.boolean(),
    latencyMs: z.number().nonnegative(),
  }),
  /**
   * MAGSpace — the employee directory behind the Google SSO (docs/24).
   *
   * `configured: false` means this deployment has no directory token, so the
   * Google path is off and `ok` is meaningless; the UI should say "not
   * configured" rather than "down". `lastReconcileAt` answers the question an
   * admin actually has during an incident: how stale can the roles be right
   * now?
   */
  magspace: z.object({
    configured: z.boolean(),
    ok: z.boolean(),
    latencyMs: z.number().nonnegative(),
    lastReconcileAt: IsoDateTimeSchema.nullable(),
  }),
});
export type DiagnosticsDbHealthDto = z.infer<
  typeof DiagnosticsDbHealthSchema
>;
