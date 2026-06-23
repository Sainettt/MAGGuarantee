/**
 * `email-send` queue job contract.
 *
 * Phase 9 (full): the queue carries every transactional email. The payload is
 * a discriminated union keyed on `template`; the in-process `EmailSendProcessor`
 * dispatches each to the matching synchronous `MailService.sendX` method.
 */
import type { AccountCreatedProps } from './templates/account-created';
import type { AccountDeactivatedProps } from './templates/account-deactivated';
import type { AccountReactivatedProps } from './templates/account-reactivated';
import type { CarrierDecisionProps } from './templates/carrier-decision';
import type { InternalDecisionProps } from './templates/internal-decision';
import type { CarrierSubmittedProps } from './templates/carrier-submitted';
import type { AuthorizationRequestProps } from './templates/authorization-request';
import type { VerificationDigestProps } from './templates/verification-digest';

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

export interface AccountCreatedEmailJob {
  template: 'account-created';
  email: string;
  props: AccountCreatedProps;
}

export interface AccountDeactivatedEmailJob {
  template: 'account-deactivated';
  email: string;
  props: AccountDeactivatedProps;
}

export interface AccountReactivatedEmailJob {
  template: 'account-reactivated';
  email: string;
  props: AccountReactivatedProps;
}

export interface CarrierDecisionEmailJob {
  template: 'carrier-decision';
  email: string;
  props: CarrierDecisionProps;
}

export interface InternalDecisionEmailJob {
  template: 'internal-decision';
  email: string;
  props: InternalDecisionProps;
}

export interface CarrierSubmittedEmailJob {
  template: 'carrier-submitted';
  email: string;
  props: CarrierSubmittedProps;
}

export interface AuthorizationRequestEmailJob {
  template: 'authorization-request';
  email: string;
  props: AuthorizationRequestProps;
}

export interface VerificationDigestEmailJob {
  template: 'verification-digest';
  email: string;
  props: VerificationDigestProps;
}

/** Discriminated union of all `email-send` job payloads. */
export type EmailSendJobData =
  | TwoFactorCodeEmailJob
  | PasswordResetEmailJob
  | AccountCreatedEmailJob
  | AccountDeactivatedEmailJob
  | AccountReactivatedEmailJob
  | CarrierDecisionEmailJob
  | InternalDecisionEmailJob
  | CarrierSubmittedEmailJob
  | AuthorizationRequestEmailJob
  | VerificationDigestEmailJob;
