// Typed variants of the two verification-code failures that are audit events,
// not just refused attempts. Shared by the 2FA and the password-reset flows.
//
// `TwoFactorService` / `PasswordResetService` are Redis state machines: they
// know that a lockout just happened, and which user the session belonged to,
// but not the user's role — and the audit row needs it. So they throw these,
// `AuthService` (which has the user repository and the audit writer) records
// the event and rethrows the very same object.
//
// The wire response is byte-identical to the plain exceptions they replace:
// the problem-details filter only reads `getStatus()` / `getResponse()`, and
// the extra fields below are plain instance properties it never looks at.

import { HttpException, UnauthorizedException } from '@nestjs/common';

// HttpStatus has no 423 LOCKED.
const HTTP_LOCKED = 423;

/**
 * The wrong code that pushed a session over `maxAttempts`. Thrown exactly
 * once per lockout — a request against an already-locked session gets a plain
 * 423 instead, so the audit trail holds one row per lockout, not one per probe.
 */
export class VerificationCodeLockoutException extends HttpException {
  constructor(
    /** Owner of the burned session; null if it expired under our feet. */
    readonly userId: string | null,
    readonly attempts: number,
    readonly lockedForSec: number,
  ) {
    super(
      {
        statusCode: HTTP_LOCKED,
        message: 'Too many attempts',
        lockedForSec,
      },
      HTTP_LOCKED,
    );
  }
}

/**
 * The code matched, but the session it belongs to is gone or is a decoy.
 * Should not happen in normal use; answered exactly like an expired code.
 */
export class VerificationCodeOrphanedException extends UnauthorizedException {
  constructor(readonly sessionState: 'missing' | 'decoy') {
    super('Code expired');
  }
}
