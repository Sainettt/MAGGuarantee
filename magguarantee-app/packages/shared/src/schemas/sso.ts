// Admin surface for the Google-SSO stanowisko → role mapping (docs/24 §A2/§A5).
//
// MAGSpace publishes stanowiska; MAGGuarantee decides what each one is allowed
// to do here. This file is the contract for the screen where an admin makes
// that decision, plus the SSO status strip above it.

import { z } from 'zod';

import { AssignableRole } from './auth';

/**
 * One row of the mapping table: a stanowisko as MAGSpace knows it, plus the
 * role we grant its holders — or `null` for "no access".
 *
 * The list is a FULL OUTER view: every stanowisko MAGSpace serves appears, even
 * unmapped, so the admin can see what is missing; and a saved mapping whose
 * code MAGSpace no longer serves also appears (`knownToMagspace: false`), which
 * is how a renamed or retired position becomes visible instead of silently
 * locking people out.
 */
export const StanowiskoRoleDtoSchema = z.object({
  code: z.string(),
  /** Live label from MAGSpace when available, otherwise the stored snapshot. */
  name: z.string(),
  /** `null` = no mapping = no access (sign-in fails with SSO_NO_ROLE). */
  role: AssignableRole.nullable(),
  /**
   * False when the code exists only in our table. Either MAGSpace is
   * unreachable (then this is false for every row — check `magspaceOk`) or the
   * position was removed there and the row is now dead weight.
   */
  knownToMagspace: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
});
export type StanowiskoRoleDto = z.infer<typeof StanowiskoRoleDtoSchema>;

/** `GET /sso/stanowisko-roles` */
export const StanowiskoRoleListDtoSchema = z.object({
  items: z.array(StanowiskoRoleDtoSchema),
  /**
   * Whether the directory answered while building this list. When false the
   * table shows only saved rows and the UI must say so — an empty-looking
   * mapping screen during an outage would invite exactly the wrong edit.
   */
  magspaceOk: z.boolean(),
  /** Last completed reconcile run, ISO-8601, or null if none has run yet. */
  lastReconcileAt: z.string().datetime().nullable(),
});
export type StanowiskoRoleListDto = z.infer<typeof StanowiskoRoleListDtoSchema>;

/** `PUT /sso/stanowisko-roles/:code` */
export const SetStanowiskoRoleSchema = z
  .object({
    role: AssignableRole,
  })
  .strict();
export type SetStanowiskoRoleDto = z.infer<typeof SetStanowiskoRoleSchema>;

/**
 * Path parameter. MAGSpace codes are UPPER_SNAKE values of a TypeScript enum;
 * validating the shape keeps a typo from creating a mapping row that can never
 * match anything.
 */
export const StanowiskoCodeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Expected an UPPER_SNAKE stanowisko code');

/**
 * One refused Google sign-in, for the "waiting for a role" list on the admin
 * screen. Sourced from the audit log (`system.denyDirectoryAccess`) — there is
 * no separate requests table, because a refusal is an event, not state.
 */
export const SsoAccessDenialDtoSchema = z.object({
  email: z.string(),
  stanowiskoCode: z.string().nullable(),
  at: z.string().datetime(),
});
export type SsoAccessDenialDto = z.infer<typeof SsoAccessDenialDtoSchema>;

export const SsoAccessDenialListDtoSchema = z.object({
  items: z.array(SsoAccessDenialDtoSchema),
});
export type SsoAccessDenialListDto = z.infer<typeof SsoAccessDenialListDtoSchema>;
