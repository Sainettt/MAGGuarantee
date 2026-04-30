// Phase 1 — auth DTO contracts shared between api and web.
//
// These Zod schemas are the single source of truth for request/response
// shapes per docs/13-api-design.md and docs/15-auth-strategy.md.
//
// The api side validates incoming bodies via ZodValidationPipe; the web side
// imports the same schemas for React Hook Form / TanStack Query typing.

import { z } from 'zod';

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

// ─── User DTO ─────────────────────────────────────────────

// Phase 1 keeps this minimal — Phase 2+ extends with carrierId, vehicles,
// alternateRoles once Carrier/Vehicle ship.
export const UserDto = z.object({
  id: z.string().uuid(),
  login: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: Role,
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
