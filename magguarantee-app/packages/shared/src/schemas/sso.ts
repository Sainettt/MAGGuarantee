// Admin surface for the Google-SSO stanowisko → role mapping (docs/24 §A2/§A5).
//
// MAGSpace publishes stanowiska; MAGGuarantee decides what each one is allowed
// to do here. This file is the contract for the screen where an admin makes
// that decision, plus the SSO status strip above it.

import { z } from 'zod';

import { AssignableRole } from './auth';
import { refineLiderPair } from './common';
import { UserDtoSchema } from './users';

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
   * Leader flag handed out together with `role` to everyone on this stanowisko
   * (docs/28 §2) — e.g. `PLANISTA_LIDER` → planista + lider. Always `false` for
   * an unmapped row.
   */
  lider: z.boolean(),
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

/**
 * `PUT /sso/stanowisko-roles/:code`
 *
 * `lider` is optional and NOT defaulted: omitted means "keep the stored flag"
 * (`false` for a new row), so a client that sends only `{ role }` never wipes
 * a leader mapping. The refine rejects an explicit `lider: true` next to a role
 * outside `LIDER_ROLES`; the service checks the resulting pair (stored flag +
 * new role) as well — e.g. `{ role: 'weryfikator' }` on a leader row is 422
 * `USER_LIDER_REQUIRES_LIDER_ROLE`, never a silent loss of the flag.
 */
export const SetStanowiskoRoleSchema = z
  .object({
    role: AssignableRole,
    lider: z.boolean().optional(),
  })
  .strict()
  .superRefine(refineLiderPair);
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
 * Whether a refused person has since been let in. `granted` = an active,
 * non-deleted account exists for that e-mail today, however it got there
 * (one-step grant, the manual create+edit path, or a mapping added later).
 */
export const SsoAccessDenialStatus = z.enum(['pending', 'granted']);
export type SsoAccessDenialStatus = z.infer<typeof SsoAccessDenialStatus>;

/**
 * One refused Google sign-in, for the "waiting for a role" list on the admin
 * screen. Sourced from the audit log (`system.denyDirectoryAccess`) — there is
 * no separate requests table, because a refusal is an event, not state.
 *
 * One row per person: repeated refusals of the same address collapse into the
 * latest one (`at`), so the list reads as a queue, not a log.
 */
export const SsoAccessDenialDtoSchema = z.object({
  email: z.string(),
  stanowiskoCode: z.string().nullable(),
  /** Latest refusal for this address, ISO-8601. */
  at: z.string().datetime(),
  status: SsoAccessDenialStatus,
  /** Id of the active account for this e-mail when `status = 'granted'`, else null. */
  userId: z.string().uuid().nullable(),
});
export type SsoAccessDenialDto = z.infer<typeof SsoAccessDenialDtoSchema>;

export const SsoAccessDenialListDtoSchema = z.object({
  items: z.array(SsoAccessDenialDtoSchema),
});
export type SsoAccessDenialListDto = z.infer<typeof SsoAccessDenialListDtoSchema>;

// ─── POST /sso/access-grants — one-step «Nadaj dostęp» ────

/**
 * An admin grants a named employee a role by hand (docs/24 §10). The api looks
 * the address up in MAGSpace, then creates, reactivates or updates a
 * directory-managed account with `roleOverride = role`, so the reconcile keeps
 * the role but still revokes access the day the person leaves.
 *
 * `role` excludes `admin`/`przewoznik` for the same reason `roleOverride` does
 * (CHECK `user_role_override_not_privileged`). The e-mail is normalised the way
 * MAGSpace normalises its own lookup key.
 *
 * `lider` (docs/28 §2) is written together with `role` / `roleOverride`; this
 * is how a DAF / opiekun / eksport leader is granted, since no stanowisko maps
 * to one. Optional without a Zod default (the service defaults it to `false`),
 * so the body type still accepts `{ email, role }`.
 */
export const GrantSsoAccessSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(160),
    role: AssignableRole,
    lider: z.boolean().optional(),
  })
  .strict()
  .superRefine(refineLiderPair);
export type GrantSsoAccessDto = z.infer<typeof GrantSsoAccessSchema>;

/**
 * What the grant did:
 *  - `created`     — no account existed; one was made (no password, signs in
 *                    with Google; `authProvider` stays `local` until then);
 *  - `reactivated` — a directory-managed account existed but was inactive;
 *  - `updated`     — a directory-managed active account got the new role.
 */
export const SsoAccessGrantOutcome = z.enum(['created', 'reactivated', 'updated']);
export type SsoAccessGrantOutcome = z.infer<typeof SsoAccessGrantOutcome>;

export const SsoAccessGrantResultDtoSchema = z.object({
  user: UserDtoSchema,
  outcome: SsoAccessGrantOutcome,
});
export type SsoAccessGrantResultDto = z.infer<typeof SsoAccessGrantResultDtoSchema>;
