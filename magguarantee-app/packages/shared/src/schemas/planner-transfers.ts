// Vehicle planner transfer (docs/29) — request → approval, planista history.
//
// Source of truth for:
//   POST /vehicles/:id/planner-transfers        — file a request
//   GET  /vehicles/:id/planner-history          — assignments + requests of one vehicle
//   GET  /planner-transfers?scope=&status=      — inbox ("decide") / own requests ("mine")
//   POST /planner-transfers/:id/approve|reject|cancel
// per docs/13-api-design.md#vehicle-planner-transfers and docs/29 §3.
//
// After creation a vehicle changes its planista ONLY through a request that an
// admin or the lider of the CURRENT planista approves (R1–R4). Nobody is
// notified (R9): the lists below are the only way anyone learns about a
// request or its outcome, so every free-text field travels in full.
//
// The shared package cannot import `@magguarantee/database`; the two Prisma
// enums are mirrored as Zod enums — keep them in lockstep with schema.prisma.

import { z } from 'zod';

import { IsoDateTimeSchema, RoleSchema, UuidSchema } from './common';

// ─── Machine codes (`extensions.code` of the RFC 7807 envelope) ──────────

/** 409 — the vehicle already has a `pending` request (U4, one per vehicle). */
export const PLANNER_TRANSFER_ALREADY_PENDING = 'PLANNER_TRANSFER_ALREADY_PENDING' as const;
/** 409 — the request is no longer `pending` (decided or cancelled meanwhile). */
export const PLANNER_TRANSFER_NOT_PENDING = 'PLANNER_TRANSFER_NOT_PENDING' as const;
/**
 * 409 — the vehicle's planista is no longer the request's `fromPlanner` (U6:
 * the request is stale — approve it is refused; reject/cancel still work).
 */
export const PLANNER_TRANSFER_PLANNER_CHANGED = 'PLANNER_TRANSFER_PLANNER_CHANGED' as const;
/**
 * 422 — the target is not an active planista, or is the vehicle's current
 * planista (U2). Checked on filing and again on approval (U6).
 */
export const PLANNER_TRANSFER_TARGET_INVALID = 'PLANNER_TRANSFER_TARGET_INVALID' as const;
/** 422 — the vehicle is switched off (`active=false`); filing and approving are refused. */
export const PLANNER_TRANSFER_VEHICLE_INACTIVE = 'PLANNER_TRANSFER_VEHICLE_INACTIVE' as const;
/** 422 — the vehicle has no planista at all, so there is nothing to transfer FROM. */
export const PLANNER_TRANSFER_NO_CURRENT_PLANNER = 'PLANNER_TRANSFER_NO_CURRENT_PLANNER' as const;
/** 422 — `reason` (filing / rejection) is blank, shorter than 3 or longer than 500 chars (U3). */
export const PLANNER_TRANSFER_REASON_INVALID = 'PLANNER_TRANSFER_REASON_INVALID' as const;
/**
 * 403 — the caller may not FILE a request for this vehicle: a planista who is
 * not the vehicle's current planista, or a role outside admin / opiekun /
 * planista. An admin files for any vehicle (U1 reversed 2026-10-23); an
 * opiekun of another carrier is refused earlier by the ownership guard.
 */
export const PLANNER_TRANSFER_REQUEST_FORBIDDEN = 'PLANNER_TRANSFER_REQUEST_FORBIDDEN' as const;
/** 403 — the caller is neither an admin nor the (current) lider of `fromPlanner` (R3, U10). */
export const PLANNER_TRANSFER_NOT_DECIDER = 'PLANNER_TRANSFER_NOT_DECIDER' as const;
/**
 * 403 — the author (an admin or a lider) may not decide his own request (R4,
 * absolute): another admin or the lider of `fromPlanner` decides it.
 */
export const PLANNER_TRANSFER_DECIDER_IS_REQUESTER = 'PLANNER_TRANSFER_DECIDER_IS_REQUESTER' as const;
/** 403 — a lider may not decide a request that hands the vehicle to himself; only an admin can (R4). */
export const PLANNER_TRANSFER_DECIDER_IS_TARGET = 'PLANNER_TRANSFER_DECIDER_IS_TARGET' as const;
/** 403 — only the author may cancel his own `pending` request (U4). */
export const PLANNER_TRANSFER_CANCEL_NOT_AUTHOR = 'PLANNER_TRANSFER_CANCEL_NOT_AUTHOR' as const;

// ─── Enums (mirror of the Prisma enums) ──────────────────

/** Mirror of Prisma `PlannerTransferStatus`. `pending` is the only open state. */
export const PlannerTransferStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);
export type PlannerTransferStatus = z.infer<typeof PlannerTransferStatusSchema>;

/** The three terminal statuses — the «Rozpatrzone» tab. */
export const PLANNER_TRANSFER_DECIDED_STATUSES = ['approved', 'rejected', 'cancelled'] as const;

/**
 * Mirror of Prisma `PlannerAssignmentSource`: `create` — the first planista set
 * in the vehicle form (R7); `transfer` — opened by an approved request;
 * `backfill` — written by the migration for vehicles that predate the feature
 * (who led them before is unknown, `validFrom` = the vehicle's `createdAt`).
 */
export const PlannerAssignmentSourceSchema = z.enum(['create', 'transfer', 'backfill']);
export type PlannerAssignmentSource = z.infer<typeof PlannerAssignmentSourceSchema>;

// ─── Request bodies ──────────────────────────────────────

/** Limits of every free-text reason (filing + rejection), after trimming (U3). */
export const PLANNER_TRANSFER_REASON_MIN = 3;
export const PLANNER_TRANSFER_REASON_MAX = 500;

/** Human fallback for {@link PLANNER_TRANSFER_REASON_INVALID} — the web localises by code. */
export const PLANNER_TRANSFER_REASON_MESSAGE =
  `Powód musi mieć od ${PLANNER_TRANSFER_REASON_MIN} do ${PLANNER_TRANSFER_REASON_MAX} znaków.`;

/**
 * The reason's trimmed length is a BUSINESS rule with a machine code, not a
 * shape error: the issue carries `params.code`, so `ZodValidationPipe` answers
 * 422 + `extensions.code = PLANNER_TRANSFER_REASON_INVALID` (docs/13 «Формат
 * ответов») instead of 400 — the web shows it under the field (docs/14 §17.12
 * A4). A non-string `reason` stays a plain 400.
 */
function refineReason(
  value: { reason?: string },
  ctx: z.RefinementCtx,
): void {
  const length = (value.reason ?? '').trim().length;
  if (length >= PLANNER_TRANSFER_REASON_MIN && length <= PLANNER_TRANSFER_REASON_MAX) {
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['reason'],
    message: PLANNER_TRANSFER_REASON_MESSAGE,
    params: { code: PLANNER_TRANSFER_REASON_INVALID },
  });
}

/** Underlying object — exported so the web form can compose it (`zodResolver`). */
export const CreatePlannerTransferObjectSchema = z
  .object({
    /** The planista the vehicle should go to — any active planista except the current one (U2). */
    toPlannerId: UuidSchema,
    /** Why — required, 3..500 chars after trimming (U3). */
    reason: z.string(),
  })
  .strict();

/** `POST /vehicles/:id/planner-transfers` body. `reason` is trimmed on output. */
export const CreatePlannerTransferSchema = CreatePlannerTransferObjectSchema
  .superRefine(refineReason)
  .transform((d) => ({ ...d, reason: d.reason.trim() }));
export type CreatePlannerTransferDto = z.infer<typeof CreatePlannerTransferSchema>;

/** Underlying object of the rejection body. */
export const RejectPlannerTransferObjectSchema = z
  .object({
    /** Rejection reason — required (U3); the author reads it on his list (R9: no mail). */
    reason: z.string(),
  })
  .strict();

/** `POST /planner-transfers/:id/reject` body. `reason` is trimmed on output. */
export const RejectPlannerTransferSchema = RejectPlannerTransferObjectSchema
  .superRefine(refineReason)
  .transform((d) => ({ reason: d.reason.trim() }));
export type RejectPlannerTransferDto = z.infer<typeof RejectPlannerTransferSchema>;

/**
 * `POST /planner-transfers/:id/approve` body — an optional comment (U3). Blank
 * (or whitespace-only) means "no comment" and is stored as NULL.
 */
export const ApprovePlannerTransferSchema = z
  .object({
    comment: z
      .string()
      .max(PLANNER_TRANSFER_REASON_MAX)
      .optional()
      .transform((v) => {
        const t = v?.trim();
        return t ? t : undefined;
      }),
  })
  .strict();
export type ApprovePlannerTransferDto = z.infer<typeof ApprovePlannerTransferSchema>;

// ─── List query ──────────────────────────────────────────

/**
 * `GET /planner-transfers` query.
 *
 *  - `scope=decide` — the decider's inbox (docs/14 §17.12 A1): an admin sees
 *    EVERY request; a planista with `lider=true` sees the requests of HIS
 *    planisci (`fromPlanner.liderId = me`), including the rows he may not
 *    decide himself (he is the author or the target — `viewerBlockedReason`).
 *    Anyone else → 403 `PLANNER_TRANSFER_NOT_DECIDER`.
 *  - `scope=mine` — requests the caller filed (`requestedBy = me`): admin,
 *    opiekun, planista (an admin files since 2026-10-23 — U1 reversed).
 *
 * `status`: `pending` (default; oldest first — a queue), `decided` = any of
 * `approved | rejected | cancelled` (newest decision first), or one terminal
 * status. Cursor pagination per docs/13 «Пагинация» — `cursor` is the last
 * `id` of the previous page.
 */
export const PlannerTransferListQuerySchema = z
  .object({
    scope: z.enum(['decide', 'mine']),
    status: z
      .enum(['pending', 'decided', 'approved', 'rejected', 'cancelled'])
      .default('pending'),
    vehicleId: UuidSchema.optional(),
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type PlannerTransferListQuery = z.infer<typeof PlannerTransferListQuerySchema>;

// ─── Response DTOs ───────────────────────────────────────

/**
 * A person on a request / history row. `role` + `lider` let the web label them
 * through `roleLabelKey(role, lider)` («Lider planistów»).
 */
export const PlannerTransferPersonSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
  role: RoleSchema,
  lider: z.boolean(),
});
export type PlannerTransferPersonDto = z.infer<typeof PlannerTransferPersonSchema>;

/**
 * `fromPlanner` additionally carries his CURRENT leader (`liderId → User`), so
 * an admin can see whether a lider could take the decision instead
 * (docs/14 §17.5.2 `card.liderOf` / `card.noLider`). `null` = no leader → only
 * an admin decides (R4).
 */
export const PlannerTransferFromPlannerSchema = PlannerTransferPersonSchema.extend({
  leader: z
    .object({ id: UuidSchema, login: z.string(), name: z.string().nullable() })
    .nullable(),
});

export const PlannerTransferVehicleSchema = z.object({
  id: UuidSchema,
  plateNumber: z.string(),
  sideNumber: z.string().nullable(),
  /** `false` → filing/approving is refused (422); the UI hides those actions. */
  active: z.boolean(),
  carrier: z
    .object({ id: UuidSchema, login: z.string(), name: z.string().nullable() })
    .nullable(),
});

export const PlannerTransferDtoSchema = z.object({
  id: UuidSchema,
  status: PlannerTransferStatusSchema,
  vehicle: PlannerTransferVehicleSchema,
  fromPlanner: PlannerTransferFromPlannerSchema,
  toPlanner: PlannerTransferPersonSchema,
  requestedBy: PlannerTransferPersonSchema,
  /** Who closed the request — the decider, or the author for `cancelled`. `null` while pending. */
  decidedBy: PlannerTransferPersonSchema.nullable(),
  reason: z.string(),
  /** Rejection reason (always set when `rejected`) or the optional approval comment. */
  decisionComment: z.string().nullable(),
  decidedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  /**
   * Viewer-relative flags (docs/14 §17.12 A1), computed server-side for the
   * CALLER. `viewerCanDecide` — pending AND the caller is an admin or the
   * current lider of `fromPlanner` AND neither author nor target (R3/R4).
   * `viewerBlockedReason` — why a would-be decider may not decide this row
   * (`target` / `requester`, only on pending rows, else `null`) → the
   * `<LockNotice>` of §17.5.4. `viewerCanCancel` — pending AND the caller is
   * the author (U4). The server re-checks all three on the mutation (403).
   */
  viewerCanDecide: z.boolean(),
  viewerBlockedReason: z.enum(['target', 'requester']).nullable(),
  viewerCanCancel: z.boolean(),
});
export type PlannerTransferDto = z.infer<typeof PlannerTransferDtoSchema>;

export const PlannerTransferListSchema = z.object({
  items: z.array(PlannerTransferDtoSchema),
  nextCursor: UuidSchema.nullable(),
});
export type PlannerTransferListDto = z.infer<typeof PlannerTransferListSchema>;

/** The request that opened a `transfer` history row (compact). */
export const PlannerAssignmentTransferSchema = z.object({
  id: UuidSchema,
  requestedBy: PlannerTransferPersonSchema,
  decidedBy: PlannerTransferPersonSchema.nullable(),
  reason: z.string(),
  decisionComment: z.string().nullable(),
  decidedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});

/** One row of the vehicle's planista journal. */
export const PlannerAssignmentDtoSchema = z.object({
  id: UuidSchema,
  planner: PlannerTransferPersonSchema,
  validFrom: IsoDateTimeSchema,
  /** `null` = the current assignment. */
  validTo: IsoDateTimeSchema.nullable(),
  source: PlannerAssignmentSourceSchema,
  /** The creator (`create`) or the approver (`transfer`); `null` for `backfill`. */
  actor: PlannerTransferPersonSchema.nullable(),
  /** The approved request behind a `transfer` row; `null` otherwise. */
  transfer: PlannerAssignmentTransferSchema.nullable(),
});
export type PlannerAssignmentDto = z.infer<typeof PlannerAssignmentDtoSchema>;

/**
 * `GET /vehicles/:id/planner-history` — the journal (newest first) and every
 * request of the vehicle in any status (newest first). One call feeds both the
 * timeline (docs/14 §17.6) and the `pending` notice in the vehicle form
 * (§17.2 — the pending request, if any, is the `status: 'pending'` item).
 */
export const VehiclePlannerHistorySchema = z.object({
  vehicleId: UuidSchema,
  currentPlannerId: UuidSchema.nullable(),
  assignments: z.array(PlannerAssignmentDtoSchema),
  transfers: z.array(PlannerTransferDtoSchema),
});
export type VehiclePlannerHistoryDto = z.infer<typeof VehiclePlannerHistorySchema>;
