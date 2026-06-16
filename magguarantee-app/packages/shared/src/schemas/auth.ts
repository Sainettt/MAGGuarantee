// Phase 1 — auth DTO contracts shared between api and web.
//
// These Zod schemas are the single source of truth for request/response
// shapes per docs/13-api-design.md and docs/15-auth-strategy.md.
//
// The api side validates incoming bodies via ZodValidationPipe; the web side
// imports the same schemas for React Hook Form / TanStack Query typing.

import { z } from 'zod';

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
