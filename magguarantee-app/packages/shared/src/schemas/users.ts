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
  IsoDateTimeSchema,
  RoleSchema,
  UuidSchema,
  emptyStringToUndefined,
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
     * Only meaningful for `role=planista` per docs/03-roles.md#planista.
     * `emptyStringToUndefined` for the same reason — form-default `''` must
     * not hit `.email()` validation.
     */
    liderEmail: emptyStringToUndefined(EmailSchema.optional()),
    active: z.boolean().optional(),
  })
  .strict();
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

/**
 * PATCH /users/:id — every field optional. Role can change (e.g. promote a
 * planista to opiekun), but `przewoznik` is still excluded — the admin should
 * use the carrier endpoints for that flow.
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
    // `nullable` allowed so admin can wipe a lider-email on a planista
    // (e.g. when promoting to opiekun). Empty-string from forms still
    // coerces to undefined (= "leave alone"), not null (= "wipe").
    liderEmail: emptyStringToUndefined(EmailSchema.nullable().optional()),
    active: z.boolean().optional(),
  })
  .strict();
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

// ─── Filters / list query ───────────────────────────────

export const UserFiltersSchema = z
  .object({
    role: RoleSchema.optional(),
    active: z.coerce.boolean().optional(),
    cursor: UuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export type UserFilters = z.infer<typeof UserFiltersSchema>;

// ─── Response DTO ────────────────────────────────────────

export const UserDtoSchema = z.object({
  id: UuidSchema,
  login: z.string(),
  // NOT NULL since the phase3_blocks migration — every user has an email.
  email: z.string().email(),
  name: z.string().nullable(),
  role: RoleSchema,
  active: z.boolean(),
  liderEmail: z.string().email().nullable(),
  /**
   * When true the user is gated to the forced change-password screen on the
   * next login (set on every admin-issued password — create + reset). The
   * web admin surface shows a "must set new password" badge.
   * (User.mustChangePassword — migration 20260616120000_user_password_lifecycle.)
   */
  mustChangePassword: z.boolean(),
  lastLoginAt: IsoDateTimeSchema.nullable(),
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
