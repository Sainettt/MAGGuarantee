// Wave 3 — Users (admin CRUD) DTO contracts.
//
// Source of truth for `/api/v1/users/*` per docs/13-api-design.md#users-admin-only
// and docs/03-roles.md (admin-only). Mirrors the User Prisma model in
// docs/12-database-schema.md.
//
// All endpoints require role=admin. The web side imports these schemas for
// React Hook Form / TanStack Query typing; the api side uses them via the
// custom ZodValidationPipe.

import { z } from 'zod';

import {
  AssignableRoleSchema,
  BooleanQueryParamSchema,
  IsoDateTimeSchema,
  PermissionSchema,
  RoleSchema,
  UuidSchema,
  emptyStringToUndefined,
  refineLiderPair,
} from './common';

// ─── Field primitives ────────────────────────────────────

/**
 * Login slug — unique human-readable identifier. Allowed chars: letters,
 * digits, dot, hyphen, underscore. We deliberately keep this lax (the legacy
 * codebase has logins like `lukasz.nowak`, `magtrans-admin`) and rely on the
 * DB unique constraint for collision checks.
 */
const LoginSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, {
    message: 'login may contain only letters, digits, dot, hyphen, underscore',
  });

const NameSchema = z.string().min(1).max(128);
const EmailSchema = z.string().email().max(160);

// ─── Planista → lider link (docs/29 R8, U9) ─────────────

/**
 * 422 — `liderId` breaks U9: it may be set only on a `planista` (the effective
 * role — `roleOverride ?? role`), and must point at an ACTIVE `planista` with
 * `lider = true` other than the user himself. `extensions.reason` says which
 * part failed (`role_not_planista` | `self` | `not_found` | `not_planista` |
 * `inactive` | `not_lider`); the web shows one message for all of them.
 */
export const USER_LIDER_ID_INVALID = 'USER_LIDER_ID_INVALID' as const;

/** Human fallback for {@link USER_LIDER_ID_INVALID} — the web localises by code. */
export const USER_LIDER_ID_INVALID_MESSAGE =
  'Przełożonym planisty może być tylko inny aktywny planista z flagą lidera.';

/**
 * `superRefine` for a body carrying `role` and `liderId` together (the create
 * form): a leader link on a non-planista is a business-rule issue with
 * `params.code` — `ZodValidationPipe` answers it 422 + `extensions.code`, the
 * same code the service returns for the merged row of a PATCH.
 */
export function refineLiderIdRole(
  value: { role?: string | null; liderId?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.liderId == null || value.role == null || value.role === 'planista') return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['liderId'],
    message: USER_LIDER_ID_INVALID_MESSAGE,
    params: { code: USER_LIDER_ID_INVALID },
  });
}

/**
 * `liderId` as a request field: a UUID, `null` to clear. A form's `''` (the
 * «— brak —» option) is read as `null`, i.e. "clear", not as "leave alone".
 */
const LiderIdFieldSchema = z.preprocess(
  (v) => (v === '' ? null : v),
  UuidSchema.nullable().optional(),
);

// ─── Per-user permission overrides (docs/25 §3 B6) ──────

/**
 * 422 — `extraPermissions` names a right that may not be granted to the
 * user's (final) role: not in `GRANTABLE_EXTRA[role]` (`@magguarantee/shared`
 * permissions). `extensions.permissions` lists the offending ids.
 */
export const USER_PERMISSION_NOT_GRANTABLE = 'USER_PERMISSION_NOT_GRANTABLE' as const;

/** Human fallback for {@link USER_PERMISSION_NOT_GRANTABLE} — the web localises by code. */
export const USER_PERMISSION_NOT_GRANTABLE_MESSAGE =
  'Tych uprawnień nie można nadać użytkownikowi o tej roli.';

/**
 * 422 — `deniedPermissions` names a right the user's (final) `(role, lider)`
 * does not have, so there is nothing to revoke. `extensions.permissions`
 * lists the offending ids.
 */
export const USER_PERMISSION_NOT_REVOCABLE = 'USER_PERMISSION_NOT_REVOCABLE' as const;

/** Human fallback for {@link USER_PERMISSION_NOT_REVOCABLE}. */
export const USER_PERMISSION_NOT_REVOCABLE_MESSAGE =
  'Tych uprawnień nie można odebrać — rola użytkownika ich nie daje.';

/**
 * 422 — a non-empty `deniedPermissions` on a user whose (final) role is
 * `admin` (decision Q4, 2026-10-27): the administrator role is never narrowed
 * per person. `extensions.permissions` lists what was sent.
 */
export const USER_ADMIN_CANNOT_BE_DENIED = 'USER_ADMIN_CANNOT_BE_DENIED' as const;

/** Human fallback for {@link USER_ADMIN_CANNOT_BE_DENIED}. */
export const USER_ADMIN_CANNOT_BE_DENIED_MESSAGE =
  'Administratorowi nie można odebrać uprawnień.';

/**
 * 422 — `PATCH /users/:id` with a `role` different from the stored one on a
 * `przewoznik` account (decision Q5, 2026-10-27). A carrier account is bound
 * to its Carrier row; it is neither created nor converted here. Omit `role`
 * when editing a carrier.
 */
export const USER_CARRIER_ROLE_LOCKED = 'USER_CARRIER_ROLE_LOCKED' as const;

/** Human fallback for {@link USER_CARRIER_ROLE_LOCKED}. */
export const USER_CARRIER_ROLE_LOCKED_MESSAGE =
  'Roli przewoźnika nie można zmienić — konto jest powiązane z firmą przewoźnika.';

/**
 * A request list of catalog permissions: unknown ids are a 400, duplicates are
 * dropped (first occurrence kept). The service stores the list in catalog
 * order. `[]` clears the overrides.
 */
const PermissionListSchema = z
  .array(PermissionSchema)
  .transform((list) => [...new Set(list)]);

/**
 * Password policy — the single source of truth (docs/15-auth-strategy.md
 * #politika-паролей): ≥10 chars, ≥1 letter, ≥1 digit.
 *
 * Exported so the auth-flow schemas (forgot/reset/change-password) reuse the
 * exact same rule instead of redefining it. Do NOT redefine the policy
 * elsewhere — import this.
 */
export const PasswordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[A-Za-z]/, { message: 'password must contain at least one letter' })
  .regex(/[0-9]/, { message: 'password must contain at least one digit' });

// ─── Create / Update ────────────────────────────────────

/**
 * POST /users — admin creates a user of any role except `przewoznik`. Carrier
 * users are created via POST /carriers (which provisions the User row in the
 * same transaction).
 */
export const CreateUserSchema = z
  .object({
    login: LoginSchema,
    email: EmailSchema,
    name: NameSchema,
    role: RoleSchema.exclude(['przewoznik']),
    /**
     * Optional plaintext password. When omitted the API generates one and
     * returns it as `temporaryPassword` (Phase 2 stub — Phase 9 will email
     * it instead, see UsersService.resetPassword).
     *
     * Wrapped in `emptyStringToUndefined` so RHF forms with default `''`
     * don't trip the `.min(10)` rule when the admin leaves the field blank.
     */
    password: emptyStringToUndefined(PasswordSchema.optional()),
    /**
     * The planista's leader (docs/29 R8, U9) — replaces the former
     * `liderEmail`. Only for `role=planista`; the target must be an active
     * planista with `lider = true` (422 {@link USER_LIDER_ID_INVALID}). That
     * leader decides the planista's vehicle-transfer requests and is CC'd on
     * his wniosek mails. Omitted / `null` / `''` = no leader.
     */
    liderId: LiderIdFieldSchema,
    active: z.boolean().optional(),
    /**
     * Leader flag over `role` (docs/28) — only for roles in `LIDER_ROLES`.
     * Omitted = `false`. Not to be confused with `liderId` above, which says
     * WHOSE leader a planista has.
     */
    lider: z.boolean().optional(),
  })
  .strict();
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

/**
 * `POST /users` body as the api validates it: {@link CreateUserSchema} plus the
 * `(role, lider)` pair check. A violation is answered 422 with
 * `extensions.code = USER_LIDER_REQUIRES_LIDER_ROLE` (the issue carries the
 * code, see `refineLiderPair`).
 *
 * A separate export on purpose: `CreateUserSchema` must stay a plain
 * `ZodObject`, because the admin form calls `.passthrough()` / `.extend()` on
 * it, which a refined schema (`ZodEffects`) does not have. A form wanting the
 * same check composes `CreateUserSchema.passthrough().superRefine(refineLiderPair)`.
 */
export const CreateUserRequestSchema = CreateUserSchema.superRefine((value, ctx) => {
  refineLiderPair(value, ctx);
  // `liderId` only on a planista (docs/29 U9) — 422 USER_LIDER_ID_INVALID.
  refineLiderIdRole(value, ctx);
});

/**
 * PATCH /users/:id — every field optional. Role can change (e.g. promote a
 * planista to opiekun), but `przewoznik` is still excluded — the admin should
 * use the carrier endpoints for that flow. A `role` that differs from the
 * stored one on a `przewoznik` account is refused too (422
 * {@link USER_CARRIER_ROLE_LOCKED}) — omit `role` when editing a carrier.
 *
 * `email` is required at the column level (NOT NULL since the phase3_blocks
 * migration), so PATCH cannot null it — the schema drops `.nullable()` on
 * that field. Same applies to `password` flows — handled by reset-password.
 */
export const UpdateUserSchema = z
  .object({
    email: emptyStringToUndefined(EmailSchema.optional()),
    name: emptyStringToUndefined(NameSchema.optional()),
    role: RoleSchema.exclude(['przewoznik']).optional(),
    /**
     * The planista's leader (docs/29 U9). `null` / `''` clears it, omitted
     * leaves it alone. Checked by the service on the MERGED row: only on an
     * effective `planista` (`roleOverride ?? role`), target = an active
     * planista with `lider = true`, not the user himself → else 422
     * {@link USER_LIDER_ID_INVALID}. Re-sending the stored value is a no-op
     * even when its target lost the flag since (U10). When the effective role
     * stops being `planista` the service clears it. Editable on
     * `managedBy = magspace` accounts too — the directory never touches it.
     */
    liderId: LiderIdFieldSchema,
    active: z.boolean().optional(),
    /**
     * Hand the account over to (or take it back from) the MAGSpace directory.
     *
     * `magspace` means the reconcile owns `role` and `active` from now on and
     * revokes access when the person is terminated there; `local` means this
     * app owns them and the directory never touches the row. Admins stay
     * `local` — that is the break-glass path.
     */
    managedBy: z.enum(['local', 'magspace']).optional(),
    /**
     * Role granted BY HAND, for stanowiska the mapping deliberately leaves
     * unmapped (docs/24 §4). Setting it is how an admin approves one of the
     * mixed-position employees; `null` clears it and hands the role decision
     * back to the stanowisko mapping.
     *
     * This is the ONLY access field editable on a `managedBy = magspace` user:
     * `role` and `active` are re-synced on every login and every reconcile
     * run, so editing them here would be silently reverted.
     */
    roleOverride: AssignableRoleSchema.nullable().optional(),
    /**
     * Leader flag over `role` (docs/28). Owned like `role`: on a
     * `managedBy = magspace` account it may change only together with a
     * `roleOverride` (already set, or set in this body) or a hand-back to
     * `local` — otherwise 422 `USER_MANAGED_BY_MAGSPACE`.
     *
     * No refine here: PATCH is partial, so the pair is checked by the service
     * on the MERGED row — both `(role, lider)` and `(roleOverride, lider)` —
     * and refused with 422 `USER_LIDER_REQUIRES_LIDER_ROLE`.
     */
    lider: z.boolean().optional(),
    /**
     * Rights granted to THIS user on top of his role (docs/25 §3 B6). Omitted =
     * leave alone, `[]` = clear. Judged on the MERGED row (final `role`):
     * every id must be in `GRANTABLE_EXTRA[role]` — else 422
     * {@link USER_PERMISSION_NOT_GRANTABLE}. Today only `przewoznik` may be
     * granted anything (`carrier_documents.read` / `.add`).
     *
     * Editable on `managedBy = magspace` accounts too: the directory never
     * sets it, it only prunes entries a role / leader change no longer admits.
     */
    extraPermissions: PermissionListSchema.optional(),
    /**
     * Rights revoked from THIS user although his role grants them (docs/25 §3
     * B6). Omitted = leave alone, `[]` = clear. Judged on the MERGED row (final
     * `role`, `lider`): every id must be in `permissionsFor(role, lider)` —
     * else 422 {@link USER_PERMISSION_NOT_REVOCABLE}; any id on a final role
     * `admin` → 422 {@link USER_ADMIN_CANNOT_BE_DENIED}. Denial wins over a
     * grant. Editable on `managedBy = magspace` accounts, like
     * `extraPermissions`.
     */
    deniedPermissions: PermissionListSchema.optional(),
  })
  .strict();
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

// ─── Filters / list query ───────────────────────────────

export const UserFiltersSchema = z
  .object({
    role: RoleSchema.optional(),
    active: z.coerce.boolean().optional(),
    /** `?lider=true` → leaders only, `?lider=false` → everyone else. Strictly `'true' | 'false'`. */
    lider: BooleanQueryParamSchema.optional(),
    /** `?liderId=<uuid>` → the planisci whose leader is that user (docs/29). */
    liderId: UuidSchema.optional(),
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type UserFilters = z.infer<typeof UserFiltersSchema>;

// ─── Response DTO ────────────────────────────────────────

/** The leader a planista points at (`User.liderId → User`), with his current flags. */
export const UserLiderMiniSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  name: z.string().nullable(),
  /** `false` when the leader is deactivated or soft-deleted. */
  active: z.boolean(),
  /** The leader's CURRENT `lider` flag — `false` = the link is stale (U10). */
  lider: z.boolean(),
});
export type UserLiderMiniDto = z.infer<typeof UserLiderMiniSchema>;

export const UserDtoSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  // NOT NULL since the phase3_blocks migration — every user has an email.
  email: z.string().email(),
  name: z.string().nullable(),
  role: RoleSchema,
  active: z.boolean(),
  /** The planista's leader (docs/29 R8) — `null` = none (only an admin decides his transfers). */
  liderId: UuidSchema.nullable(),
  /**
   * The user `liderId` points at. `active` / `lider` are that user's CURRENT
   * flags: a stored link may outlive them (U10 — removing the flag does not
   * clear the link), and the admin form must still show it, marked stale.
   * `active` is `false` for a soft-deleted leader too. `null` when unset.
   */
  liderUser: UserLiderMiniSchema.nullable(),
  /**
   * When true the user is gated to the forced change-password screen on the
   * next login (set on every admin-issued password — create + reset). The
   * web admin surface shows a "must set new password" badge.
   * (User.mustChangePassword — migration 20260616120000_user_password_lifecycle.)
   */
  mustChangePassword: z.boolean(),
  lastLoginAt: IsoDateTimeSchema.nullable(),
  // ── Google SSO / MAGSpace (docs/24) ──────────────────
  /** `local` = managed here; `magspace` = role + active owned by the directory. */
  managedBy: z.enum(['local', 'magspace']),
  /** `google` once the account has signed in with Google at least once. */
  authProvider: z.enum(['local', 'google']),
  /** Hand-granted role that overrides the stanowisko mapping; null = mapped. */
  roleOverride: AssignableRoleSchema.nullable(),
  /**
   * Leader flag over `role` (docs/28); never `true` outside `LIDER_ROLES`.
   * Synced from the stanowisko mapping on `magspace` accounts without a
   * `roleOverride`, set by an admin otherwise.
   */
  lider: z.boolean(),
  /** Last time the directory refreshed this row. Null for local accounts. */
  directorySyncedAt: IsoDateTimeSchema.nullable(),
  /**
   * Rights granted to this user on top of his role (docs/25 §3 B6) — the
   * stored list with ids outside the catalog removed, in catalog order. Only
   * the ids in `GRANTABLE_EXTRA[role]` take effect.
   */
  extraPermissions: z.array(PermissionSchema),
  /**
   * Rights revoked from this user although his role grants them (docs/25 §3
   * B6) — the stored list with ids outside the catalog removed, in catalog
   * order. Denial wins over a grant.
   */
  deniedPermissions: z.array(PermissionSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type UserDtoFull = z.infer<typeof UserDtoSchema>;

// ─── Admin reset-password (POST /users/:id/reset-password) ──

/**
 * Admin reset body — discriminated union on `mode`:
 *  - `{ mode: 'generate' }`            → API generates a random password.
 *  - `{ mode: 'custom', password }`    → admin supplies the password.
 *
 * Either way the API sets `mustChangePassword=true` (force is always on) and
 * returns the effective plaintext once as `temporaryPassword`.
 *
 * `.strict()` on each member rejects stray fields (e.g. a `password` sent with
 * mode `generate`). The discriminated union surfaces a clear Zod error path.
 */
export const ResetPasswordModeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('generate') }).strict(),
  z.object({ mode: z.literal('custom'), password: PasswordSchema }).strict(),
]);
export type ResetPasswordModeDto = z.infer<typeof ResetPasswordModeSchema>;

/**
 * Response of POST /users and POST /users/:id/reset-password while Phase 9's
 * email pipeline is still pending. The admin sees the generated plaintext
 * password once, in the API response. After Phase 9 ships
 * `MailService.sendAccountReset`, this field becomes optional and the password
 * is delivered by email instead.
 */
export const UserWithTemporaryPasswordSchema = UserDtoSchema.extend({
  temporaryPassword: z
    .string()
    .describe(
      '[dev-only — Phase 2] Plaintext password generated by the API. Will be replaced by email delivery in Phase 9.',
    ),
});
export type UserWithTemporaryPasswordDto = z.infer<
  typeof UserWithTemporaryPasswordSchema
>;
