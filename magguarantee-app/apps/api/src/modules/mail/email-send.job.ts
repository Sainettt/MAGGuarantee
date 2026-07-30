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
import type { AccountPasswordResetProps } from './templates/account-password-reset';
import type { WeeklyReportProps } from './templates/weekly-report';
import type { CarrierDecisionProps } from './templates/carrier-decision';
import type { InternalDecisionProps } from './templates/internal-decision';
import type { CarrierSubmittedProps } from './templates/carrier-submitted';
import type { MaksimConfirmationRequestProps } from './templates/maksim-confirmation-request';
import type { VerificationDigestProps } from './templates/verification-digest';
import type { DelegationAnnouncedProps } from './templates/delegation-announced';
import type { DelegationReadyProps } from './templates/delegation-ready';
import type { GuaranteeReminderCarrierProps } from './templates/guarantee-reminder-carrier';
import type { GuaranteeOpiekunDigestProps } from './templates/guarantee-opiekun-digest';
import type { VehicleRemovalAdminProps } from './templates/vehicle-removal-admin';

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

/**
 * Admin-issued password reset. Shared by internal users and carriers — one
 * template, one job type (decision 2026-07-30).
 */
export interface AccountPasswordResetEmailJob {
  template: 'account-password-reset';
  email: string;
  props: AccountPasswordResetProps;
}

/** Monday summary report for admins. */
export interface WeeklyReportEmailJob {
  template: 'weekly-report';
  email: string;
  props: WeeklyReportProps;
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

/**
 * Maksim over-threshold confirmation-request email — the ONLY authorization
 * notification (auto-fired at verification when the dopłata crosses the
 * threshold, moving the claim into `OCZEKUJE_NA_AUTORYZACJE`).
 */
export interface MaksimConfirmationRequestEmailJob {
  template: 'maksim-confirmation-request';
  email: string;
  props: MaksimConfirmationRequestProps;
}

export interface VerificationDigestEmailJob {
  template: 'verification-digest';
  email: string;
  props: VerificationDigestProps;
}

export interface DelegationAnnouncedEmailJob {
  template: 'delegation-announced';
  email: string;
  props: DelegationAnnouncedProps;
}

export interface DelegationReadyEmailJob {
  template: 'delegation-ready';
  email: string;
  props: DelegationReadyProps;
}

/** Guarantee Watchdog #17 — carrier wyjazd reminder (plan §6). */
export interface GuaranteeReminderCarrierEmailJob {
  template: 'guarantee-reminder-carrier';
  email: string;
  props: GuaranteeReminderCarrierProps;
}

/** Guarantee Watchdog #18 — opiekun daily digest (plan §6). */
export interface GuaranteeOpiekunDigestEmailJob {
  template: 'guarantee-opiekun-digest';
  email: string;
  props: GuaranteeOpiekunDigestProps;
}

/** Vehicle-removal admin digest (vehicle-status rework, Step B — 29-day cron). */
export interface VehicleRemovalAdminEmailJob {
  template: 'vehicle-removal-admin';
  email: string;
  props: VehicleRemovalAdminProps;
}

/** Discriminated union of all `email-send` job payloads. */
export type EmailSendJobData =
  | TwoFactorCodeEmailJob
  | PasswordResetEmailJob
  | AccountCreatedEmailJob
  | AccountDeactivatedEmailJob
  | AccountReactivatedEmailJob
  | AccountPasswordResetEmailJob
  | WeeklyReportEmailJob
  | CarrierDecisionEmailJob
  | InternalDecisionEmailJob
  | CarrierSubmittedEmailJob
  | MaksimConfirmationRequestEmailJob
  | VerificationDigestEmailJob
  | DelegationAnnouncedEmailJob
  | DelegationReadyEmailJob
  | GuaranteeReminderCarrierEmailJob
  | GuaranteeOpiekunDigestEmailJob
  | VehicleRemovalAdminEmailJob;
