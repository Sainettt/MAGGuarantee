/**
 * `email-send` queue job contract.
 *
 * Phase 9 stood up early — ONLY the 2FA login-code email is routed through
 * this queue today. Every other mail call-site stays synchronous (see the
 * `// Phase 9: migrate to email-send queue` markers in `MailService`). The
 * payload is a discriminated union keyed on `template` so additional mail
 * types can be added later without breaking existing jobs.
 */

/** BullMQ job name within the `email-send` queue. */
export const EMAIL_SEND_JOB = 'send' as const;

/** 2FA login-code email payload. */
export interface TwoFactorCodeEmailJob {
  template: '2fa-code';
  email: string;
  code: string;
}

/** Forgot-password reset-code email payload. */
export interface PasswordResetEmailJob {
  template: 'password-reset';
  email: string;
  code: string;
  /** Code validity in minutes (mirrors the Redis TTL). */
  ttlMinutes: number;
}

/** Discriminated union of all `email-send` job payloads. */
export type EmailSendJobData = TwoFactorCodeEmailJob | PasswordResetEmailJob;
