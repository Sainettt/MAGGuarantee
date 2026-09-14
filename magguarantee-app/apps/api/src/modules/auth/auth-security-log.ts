// Structured WARN logs for refused authentication attempts.
//
// Split of responsibilities (logging/audit-trail audit 2026-08-14, §4):
//
//  - Things that HAPPENED to an account — a session issued, a password reset,
//    a lockout, a detected refresh-token replay — are `audit_log` rows, written
//    by `AuthService` with the affected user as actor.
//  - Things that were merely ATTEMPTED and refused — a wrong password, an
//    unknown login, a wrong 2FA code, a Google account we turned away — are
//    WARN log lines built here. They are high-volume and mostly noise one at a
//    time, but they are what a brute-force or credential-stuffing run looks like
//    in aggregate, so every one carries the same greppable shape:
//
//      { msg, event, reason, ipAddress, userAgent, ...ids }
//
// Never put codes, passwords, tokens, session tokens or raw e-mail addresses in
// here. A login submitted for an account that does not exist is reduced to a
// fingerprint: it may be a typo, someone else's e-mail, or a password typed
// into the wrong field, and the only thing triage needs is "the same string
// again".

import { createHash } from 'node:crypto';

import type { Logger } from '@nestjs/common';

/** Who is on the other end of the request, as far as we can tell. */
export interface AuthRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * The refused-attempt families. `event` is the stable key a log query filters
 * on; `reason` narrows it down.
 */
export type AuthFailureEvent =
  | 'loginRefused'
  | 'twoFactorCodeRejected'
  | 'twoFactorResendRefused'
  | 'passwordResetCodeRejected'
  | 'passwordResetResendRefused'
  | 'passwordResetRefused'
  | 'googleLoginRefused';

/** Header values are attacker-controlled; keep one line bounded. */
const USER_AGENT_LOG_MAX = 256;

/** Enough hex to group repeats, too little to be worth reversing. */
const LOGIN_FINGERPRINT_HEX = 16;

/**
 * Stable, non-reversible stand-in for a login we could not match to an
 * account. Normalised the way a human would retype it.
 */
export function loginFingerprint(login: string): string {
  return createHash('sha256')
    .update(login.trim().toLowerCase())
    .digest('hex')
    .slice(0, LOGIN_FINGERPRINT_HEX);
}

/** Writes one refused-attempt line at WARN. */
export function logAuthFailure(
  logger: Pick<Logger, 'warn'>,
  event: AuthFailureEvent,
  reason: string,
  ctx: AuthRequestContext | undefined,
  fields: Record<string, unknown> = {},
): void {
  logger.warn({
    msg: `auth: ${event}`,
    event,
    reason,
    ipAddress: ctx?.ipAddress ?? null,
    userAgent: ctx?.userAgent?.slice(0, USER_AGENT_LOG_MAX) ?? null,
    ...fields,
  });
}
