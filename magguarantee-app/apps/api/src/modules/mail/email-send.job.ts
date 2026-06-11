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

/** 2FA login-code email payload — the only variant wired in this phase. */
export interface TwoFactorCodeEmailJob {
  template: '2fa-code';
  email: string;
  code: string;
}

/** Discriminated union of all `email-send` job payloads (one variant for now). */
export type EmailSendJobData = TwoFactorCodeEmailJob;
