// Phase 11 — Dispatch-team DTO contracts.
//
// Source of truth for `/api/v1/teams/*` (admin CRUD) and `/api/v1/lookups/teams`
// per docs/13-api-design.md#teams-admin-only.
//
// A `Team` is a dispatch team («zespół dyspozytorów») that vehicles are
// assigned to. It replaces the legacy single `Vehicle.dispatcherId` FK: a
// vehicle now belongs to a whole team, and every dispatcher in the team
// (usually 2 by shift) sees it. Maintained by `admin` — an explicit
// replacement for the external "raport DAF" Excel.
//
// 2026-10-29 — the team carries ONE identifier, `name` («Nazwa zespołu»):
// required, trimmed, globally unique, free-form. The earlier `code` (strict
// `N.N.N`) + optional `name` pair came from the SPED "zespół prowadzący"
// (dispatch team + planista) which this catalog is NOT — here the planista is
// picked separately on the vehicle, so a second label was noise. MAGTRANS
// numbers its dispatch teams (`1.23`), but no format is enforced.
//
// `Team` uses an `active` flag (NOT a `deletedAt` soft-delete), per
// docs/04-data-model.md. Hard-delete is guarded at the API layer: a team
// referenced by users or vehicles cannot be removed (409) — deactivate via the
// `active=false` toggle instead.

import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common';

// ─── Field primitives ────────────────────────────────────

/**
 * Team name, e.g. `1.23` or `Zespół Wschód` — the single identifier of a
 * dispatch team. Required, trimmed, globally unique (DB-level UNIQUE → P2002
 * → 409). No format is enforced.
 */
export const TeamNameSchema = z
  .string()
  .trim()
  .min(1, 'Nazwa zespołu jest wymagana')
  .max(64);

// ─── Create ──────────────────────────────────────────────

export const CreateTeamSchema = z
  .object({
    name: TeamNameSchema,
    active: z.boolean().optional(),
    /**
     * Optional initial dispatcher set. Each id must reference an existing
     * active `User` with role `dyspozytor` (enforced service-side, 422
     * otherwise). Assigning a dispatcher already on another team SILENTLY
     * moves them (just overwrites `User.teamId`) — audited, no 422.
     */
    dispatcherIds: z.array(UuidSchema).max(20).optional(),
  })
  .strict();
export type CreateTeamDto = z.infer<typeof CreateTeamSchema>;

// ─── Update ──────────────────────────────────────────────

export const UpdateTeamSchema = z
  .object({
    name: TeamNameSchema.optional(),
    active: z.boolean().optional(),
    /**
     * Full replacement of the team's dispatcher membership when present:
     * dispatchers not in this list are detached (`teamId=null`), dispatchers in
     * the list are (re)attached. Omit to leave membership untouched. Each id
     * must be an active `dyspozytor`. A silent cross-team move is allowed.
     */
    dispatcherIds: z.array(UuidSchema).max(20).optional(),
  })
  .strict();
export type UpdateTeamDto = z.infer<typeof UpdateTeamSchema>;

// ─── Filters ─────────────────────────────────────────────

export const TeamFiltersSchema = z
  .object({
    active: z.coerce.boolean().optional(),
    q: z.string().trim().min(1).max(64).optional(),
  })
  .strict();
export type TeamFilters = z.infer<typeof TeamFiltersSchema>;

// ─── Member shape ────────────────────────────────────────

/**
 * A dispatcher in a team — compact `{ id, name, login }`. `User` carries a
 * single `name` field (NOT first/last). `active` is included on the lookups
 * payload (so the web form can grey-out inactive members) but the full Team DTO
 * keeps the slimmer `{ id, name, login }` for the admin grid.
 */
export const TeamDispatcherSchema = z.object({
  id: UuidSchema,
  name: z.string().nullable(),
  login: z.string(),
});
export type TeamDispatcherDto = z.infer<typeof TeamDispatcherSchema>;

export const TeamDispatcherWithActiveSchema = TeamDispatcherSchema.extend({
  active: z.boolean(),
});
export type TeamDispatcherWithActiveDto = z.infer<
  typeof TeamDispatcherWithActiveSchema
>;

// ─── Response DTO (admin CRUD) ───────────────────────────

/**
 * Full Team DTO returned by the admin CRUD endpoints. Carries its dispatcher
 * roster (`dispatchers: [{ id, name, login }]`) so the admin grid renders the
 * team composition without an N+1.
 */
export const TeamDtoSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  active: z.boolean(),
  dispatchers: z.array(TeamDispatcherSchema),
  /** Count of vehicles currently assigned to this team (read-time aggregate). */
  vehicleCount: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TeamDto = z.infer<typeof TeamDtoSchema>;

export const TeamListSchema = z.array(TeamDtoSchema);
export type TeamListDto = z.infer<typeof TeamListSchema>;

// ─── Lookup DTO (/lookups/teams) ─────────────────────────

/**
 * Compact team for the `/lookups/teams` dropdown — `{ id, name, active,
 * dispatchers: [{ id, name, login, active }] }`. The web vehicle-form renders a
 * member preview from this without a second round-trip (so it includes the
 * dispatcher `active` flag, unlike the admin-grid roster).
 */
export const LookupTeamSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  active: z.boolean(),
  dispatchers: z.array(TeamDispatcherWithActiveSchema),
});
export type LookupTeamDto = z.infer<typeof LookupTeamSchema>;

export const LookupTeamListSchema = z.array(LookupTeamSchema);
export type LookupTeamListDto = z.infer<typeof LookupTeamListSchema>;

// ─── Embedded team reference (on Vehicle DTOs) ───────────

/**
 * The dispatch team as embedded on a Vehicle DTO / slim list-item — `{ id,
 * name, active, dispatchers: [{ id, name, login }] }`. NON-SENSITIVE (no
 * rates) so it is safe to additively widen the slim `VehicleListItem` (the
 * dyspozytor panel + FleetVehicleDetailModal) as well as the full `VehicleDto`.
 * `null` when the vehicle is not assigned to any team.
 */
export const VehicleDispatchTeamSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  active: z.boolean(),
  dispatchers: z.array(TeamDispatcherSchema),
});
export type VehicleDispatchTeamDto = z.infer<typeof VehicleDispatchTeamSchema>;
