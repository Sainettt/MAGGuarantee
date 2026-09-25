// Phase 1 — auth DTO contracts shared between api and web.
//
// These Zod schemas are the single source of truth for request/response
// shapes per docs/13-api-design.md and docs/15-auth-strategy.md.
//
// The api side validates incoming bodies via ZodValidationPipe; the web side
// imports the same schemas for React Hook Form / TanStack Query typing.

import { z } from 'zod';

import { AssignableRoleSchema } from './common';
import { PasswordSchema } from './users';

// ─── Roles ────────────────────────────────────────────────

// Mirrors the `Role` enum in packages/database/prisma/schema.prisma. We
// cannot import the enum here without dragging the Prisma client into the
// shared package, so we keep a string-literal duplicate and rely on the
// database-level FK to keep them in sync.
export const Role = z.enum([
  'admin',
  'pracownik',
  'opiekun',
  'planista',
  'dyspozytor',
  'przewoznik',
  'eksport',
  'weryfikator',
]);
export type Role = z.infer<typeof Role>;

// ─── Login flow ───────────────────────────────────────────

// POST /auth/login
export const LoginRequest = z.object({
  login: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const LoginResponse = z.object({
  sessionToken: z.string().length(64), // 32-byte hex
  maskedEmail: z.string(),
});
export type LoginResponse = z.infer<typeof LoginResponse>;

// POST /auth/verify-code
export const VerifyCodeRequest = z.object({
  sessionToken: z.string().length(64),
  code: z.string().regex(/^\d{6}$/),
});
export type VerifyCodeRequest = z.infer<typeof VerifyCodeRequest>;

// POST /auth/resend-code
export const ResendCodeRequest = z.object({
  sessionToken: z.string().length(64),
});
export type ResendCodeRequest = z.infer<typeof ResendCodeRequest>;

export const ResendCodeResponse = z.object({
  ok: z.literal(true),
  cooldownSec: z.number().int().nonnegative(),
});
export type ResendCodeResponse = z.infer<typeof ResendCodeResponse>;

// ─── Password reset (forgot-password) flow ────────────────
//
// Anti-enumeration (docs/15-auth-strategy.md#account-enumeration): keyed by
// `login`, always returns 200 with the SAME shape whether or not the account
// exists. Mirror of the 2FA decoy path.

// POST /auth/forgot-password
export const ForgotPasswordRequest = z.object({
  login: z.string().min(1).max(64),
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequest>;

export const ForgotPasswordResponse = z.object({
  // 64-char hex (32-byte) — same shape as the 2FA sessionToken, but lives in
  // the `pwreset:*` Redis namespace.
  sessionToken: z.string().length(64),
  maskedEmail: z.string(),
});
export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponse>;

// POST /auth/reset-password (confirm with code + new password)
export const ResetPasswordRequest = z.object({
  sessionToken: z.string().length(64),
  code: z.string().regex(/^\d{6}$/),
  newPassword: PasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;

// POST /auth/resend-reset-code
export const ResendResetCodeRequest = z.object({
  sessionToken: z.string().length(64),
});
export type ResendResetCodeRequest = z.infer<typeof ResendResetCodeRequest>;

// ─── Change password (forced / self-service, authenticated) ─
//
// No current-password — the JWT session already proves identity (2FA gated
// the login). Callable while `mustChangePassword=true`.
export const ChangePasswordRequest = z.object({
  newPassword: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

// ─── Client-only form schemas (confirm-password pair) ─────
//
// The wire DTOs above carry only the fields the API needs. The web forms add a
// `confirm` field validated by a cross-field refine so the user sees a
// "passwords don't match" message before submit. These never hit the API —
// callers strip `confirm` (and `code` where relevant) before posting.
//
// The refine `path` is `['confirm']` so the error attaches to the confirm
// field's <FormMessage>. The literal `passwords-mismatch` message is replaced
// at render time with the i18n string (`passwordPolicy.mismatch`).

export const SetPasswordFormSchema = z
  .object({
    password: PasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'passwords-mismatch',
    path: ['confirm'],
  });
export type SetPasswordForm = z.infer<typeof SetPasswordFormSchema>;

/** Screen 2 (reset) — adds the 6-digit code to the password pair. */
export const ResetPasswordFormSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    password: PasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'passwords-mismatch',
    path: ['confirm'],
  });
export type ResetPasswordForm = z.infer<typeof ResetPasswordFormSchema>;

// ─── User DTO ─────────────────────────────────────────────

// Phase 1 keeps this minimal — Phase 2+ extends with carrierId, vehicles,
// alternateRoles once Carrier/Vehicle ship.
export const UserDto = z.object({
  id: z.string().uuid(),
  login: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: Role,
  /**
   * Forced-change gate. When true the user has a real session (2FA passed) but
   * must set a new password before doing anything else. The web middleware
   * decodes the `mt_access` claim and the `/auth/me` surface to enforce the
   * gate. Cleared by change-password / reset-password.
   */
  mustChangePassword: z.boolean(),
  /**
   * Leader flag over `role` (docs/28): "lider_planista" = `role: 'planista'` +
   * `lider: true`. Read from the database like `teamId` — NOT a JWT claim, the
   * edge gating never depends on it. Panel, landing and nav still follow
   * `role`; the web only uses this for the label (`roles.lider.<role>`).
   */
  lider: z.boolean(),
});
export type UserDto = z.infer<typeof UserDto>;

export const VerifyCodeResponse = z.object({
  user: UserDto,
});
export type VerifyCodeResponse = z.infer<typeof VerifyCodeResponse>;

export const RefreshResponse = z.object({
  user: UserDto,
});
export type RefreshResponse = z.infer<typeof RefreshResponse>;

// ─── Google SSO (docs/24, трек A) ─────────────────────────

/**
 * POST /auth/google — the whole client-side flow in one field.
 *
 * Google Identity Services runs entirely in the browser and hands us a signed
 * `id_token`; the api only verifies the signature and the claims, so there is
 * no redirect, no `state` and no callback route (docs/24 decision #5). A JWS is
 * three dot-separated base64url segments and the compact form has no other
 * shape, hence the regex — it rejects an obviously-wrong body before the
 * `google-auth-library` call, which is a network round-trip on a cold JWKS
 * cache. The 4096 cap is generous: a Workspace token is ~1 KB.
 */
export const GoogleLoginRequest = z.object({
  idToken: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/, 'Not a compact JWS'),
});
export type GoogleLoginRequest = z.infer<typeof GoogleLoginRequest>;

/**
 * Deliberately identical to {@link VerifyCodeResponse}: a Google sign-in ends
 * in exactly the same place as a completed 2FA — cookies set, user echoed — so
 * the web client can share the post-login path.
 */
export const GoogleLoginResponse = z.object({
  user: UserDto,
});
export type GoogleLoginResponse = z.infer<typeof GoogleLoginResponse>;

/**
 * Machine-readable reasons a Google sign-in was refused, carried in the RFC
 * 7807 envelope as `extensions.code` (the convention used by
 * `CARRIER_NOT_READY_CODE` and friends). The web reads them from
 * `err.data.extensions.code` and picks a localised message — the human text in
 * `detail` is a fallback, never parsed.
 *
 * All of these are terminal for the Google path; the password form stays
 * available in every case.
 */

/** Not a `@magtrans.eu` Workspace account (missing or foreign `hd` claim). */
export const SSO_DOMAIN_NOT_ALLOWED = 'SSO_DOMAIN_NOT_ALLOWED' as const;
/** The address is not on any employee card in MAGSpace. */
export const SSO_NOT_EMPLOYEE = 'SSO_NOT_EMPLOYEE' as const;
/** Found in MAGSpace, but the employment has ended. */
export const SSO_INACTIVE = 'SSO_INACTIVE' as const;
/**
 * The stanowisko has no row in the mapping table and the user has no
 * `roleOverride`. Fail-closed *and* the normal onboarding path for the
 * deliberately-unmapped positions — the admins get an e-mail naming the person
 * so they can grant a role by hand (docs/24 §4).
 */
export const SSO_NO_ROLE = 'SSO_NO_ROLE' as const;
/** Carriers are not employees; they sign in with login + password + 2FA. */
export const SSO_NOT_FOR_CARRIER = 'SSO_NOT_FOR_CARRIER' as const;
/**
 * MAGSpace did not answer. Existing active managed users are still let in on
 * their last synced role; this code is only ever returned for someone we have
 * no local record of.
 */
export const SSO_DIRECTORY_UNAVAILABLE = 'SSO_DIRECTORY_UNAVAILABLE' as const;
/**
 * This deployment has no Google client id (or no MAGSpace token) configured, so
 * the Google path is off entirely. Expected in dev/test, a misconfiguration
 * anywhere else — the web hides the button when the id is absent, so seeing
 * this means the api and the bundle disagree.
 */
export const SSO_NOT_CONFIGURED = 'SSO_NOT_CONFIGURED' as const;

export const SSO_ERROR_CODES = [
  SSO_DOMAIN_NOT_ALLOWED,
  SSO_NOT_EMPLOYEE,
  SSO_INACTIVE,
  SSO_NO_ROLE,
  SSO_NOT_FOR_CARRIER,
  SSO_DIRECTORY_UNAVAILABLE,
  SSO_NOT_CONFIGURED,
] as const;
export type SsoErrorCode = (typeof SSO_ERROR_CODES)[number];

/**
 * `PATCH /users/:id` tried to change `role` or `active` on a user the directory
 * owns. Those two fields are re-synced on every login and every reconcile run,
 * so a local edit would be silently reverted — better a 422 than a lie. The
 * admin's options are to flip `managedBy` back to `local`, or to set
 * `roleOverride`, which the reconcile respects.
 *
 * `lider` follows `role` (docs/28 §2): on a `magspace` account without a
 * `roleOverride` (and none set in the same body) it belongs to the mapping, so
 * changing it is refused the same way. `extensions.fields` names what was
 * refused (`role` / `active` / `lider`).
 */
export const USER_MANAGED_BY_MAGSPACE = 'USER_MANAGED_BY_MAGSPACE' as const;

/**
 * 422 — `lider: true` on a role outside `LIDER_ROLES` (docs/28 §1). Lives in
 * `./common` (the users/sso refines need it and `./users` cannot import this
 * file); re-exported here next to its sibling above.
 */
export { USER_LIDER_REQUIRES_LIDER_ROLE } from './common';

// ─── POST /sso/access-grants refusals (docs/24 §10) ───────
//
// Kept apart from `SSO_ERROR_CODES` on purpose: those describe why a person's
// own sign-in was refused, these describe why an ADMIN's grant was refused.
// Different screen, different wording. A MAGSpace outage on this route reuses
// `SSO_DIRECTORY_UNAVAILABLE` (503) — same fact, same code.

/** 422 — MAGSpace answered 404: no employee card with that address. */
export const SSO_GRANT_NOT_EMPLOYEE = 'SSO_GRANT_NOT_EMPLOYEE' as const;
/** 422 — the employee exists in MAGSpace but the employment has ended. */
export const SSO_GRANT_EMPLOYEE_INACTIVE = 'SSO_GRANT_EMPLOYEE_INACTIVE' as const;
/**
 * 409 — an account with that e-mail exists and must not be taken over by the
 * directory from this screen: it is `admin`/`przewoznik`, it is managed
 * locally, or it is soft-deleted (the e-mail index covers deleted rows, so a
 * new account cannot be created next to it). `extensions.reason` says which —
 * see {@link SsoGrantConflictReason}.
 */
export const SSO_GRANT_ACCOUNT_CONFLICT = 'SSO_GRANT_ACCOUNT_CONFLICT' as const;

export const SSO_GRANT_ERROR_CODES = [
  SSO_GRANT_NOT_EMPLOYEE,
  SSO_GRANT_EMPLOYEE_INACTIVE,
  SSO_GRANT_ACCOUNT_CONFLICT,
] as const;
export type SsoGrantErrorCode = (typeof SSO_GRANT_ERROR_CODES)[number];

/**
 * `extensions.reason` on a 409 `SSO_GRANT_ACCOUNT_CONFLICT`:
 *  - `privileged` — the holder is `admin` or `przewoznik`;
 *  - `local`      — `managedBy = 'local'`, edit it under Użytkownicy instead;
 *  - `deleted`    — a soft-deleted row still owns the e-mail, so no new
 *                   account can be created next to it;
 *  - `unique`     — lost a race on a UNIQUE column (login / MAGSpace id held
 *                   by another row); refresh and retry.
 */
export const SsoGrantConflictReason = z.enum(['privileged', 'local', 'deleted', 'unique']);
export type SsoGrantConflictReason = z.infer<typeof SsoGrantConflictReason>;

/**
 * Roles a stanowisko may map to, and the only values `User.roleOverride`
 * accepts. Defined in `./common` alongside `RoleSchema` so `./users` can use it
 * without importing this file (which would close an import cycle); re-exported
 * here because the SSO code reaches for it next to the other auth contracts.
 */
export const AssignableRole = AssignableRoleSchema;
export type AssignableRole = z.infer<typeof AssignableRole>;
