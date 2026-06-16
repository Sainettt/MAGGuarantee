-- Password-management lifecycle columns on `users`.
-- `mustChangePassword` — NOT NULL, defaults false. Set true whenever an admin
-- issues a password (create or reset); forces the user to set a new password on
-- next login (after 2FA). Cleared back to false on any successful password change.
-- `passwordChangedAt` — nullable. Stamped each time the password changes
-- (self-service reset, forced change, or admin reset); NULL until the first change.
-- DB is seed-only per CLAUDE.md and the column has a DEFAULT, so existing rows
-- (seeded admin + 7 role users) get mustChangePassword=false with no back-fill.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);
