/**
 * `email-send` queue job contract.
 *
 * Phase 9 (full): the queue carries every transactional email. The payload is
 * a discriminated union keyed on `template`; the in-process `EmailSendProcessor`
 * dispatches each to the matching synchronous `MailService.sendX` method.
 *
 * Secrets never travel in plaintext (2026-08-14 logging audit, item 5): the
 * 2FA code, the reset code and admin-issued temporary passwords are carried in
 * `secret`, an AES-256-GCM envelope sealed by `MailSecretCipher` and opened by
 * the processor right before rendering. The matching `props` type omits the
 * secret field so it cannot be enqueued in the clear by accident.
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
import type { ReklamacjaInternalSubmittedProps } from './templates/reklamacja-internal-submitted';
import type { ReklamacjaCarrierSubmittedProps } from './templates/reklamacja-carrier-submitted';
import type { ReklamacjaCarrierDecisionProps } from './templates/reklamacja-carrier-decision';
import type { VerificationDigestProps } from './templates/verification-digest';
import type { DelegationAnnouncedProps } from './templates/delegation-announced';
import type { DelegationReadyProps } from './templates/delegation-ready';
import type { GuaranteeReminderCarrierProps } from './templates/guarantee-reminder-carrier';
import type { GuaranteeOpiekunDigestProps } from './templates/guarantee-opiekun-digest';
import type { DirectoryReconcileReportProps } from './templates/directory-reconcile-report';
import type { SsoAccessRequestedProps } from './templates/sso-access-requested';
import type { VehicleRemovalAdminProps } from './templates/vehicle-removal-admin';

/** BullMQ job name within the `email-send` queue. */
export const EMAIL_SEND_JOB = 'send' as const;

/**
 * AES-256-GCM envelope (see `MailSecretCipher`). All fields base64url. The
 * template name is bound in as associated data, so an envelope cannot be
 * replayed into another template's job.
 */
export interface SealedSecret {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
}

/**
 * Undo action for state a producer committed BEFORE the mail was delivered
 * (e.g. the watchdog's "reminder sent" stamps). Runs from the processor's
 * final-failure handler through `MailCompensationRegistry`, so the next cron
 * run retries instead of believing the mail went out.
 *
 * `batch` groups jobs that share ONE stamp (the vehicle-removal digest goes to
 * every admin, the stamp means "at least one admin got it"): the compensation
 * runs only once all `size` jobs of the batch have failed permanently.
 */
export interface MailCompensation {
  /** Handler key registered by the producing module. */
  kind: string;
  /** JSON-safe payload; the handler validates it. Never secrets. */
  payload: Record<string, unknown>;
  batch?: { id: string; size: number };
}

/** Delivery-log context carried alongside the payload; never rendered. */
export interface MailJobMeta {
  /** User whose action queued the mail → `email_logs.triggeredById`. */
  triggeredById?: string;
  /** Overrides the target derived from the template props. */
  targetType?: string;
  targetKey?: string;
  compensation?: MailCompensation;
}

/** Fields shared by every job variant. */
interface EmailJobBase {
  email: string;
  meta?: MailJobMeta;
}

/** Processor return value (BullMQ `returnvalue`) — feeds the `sent` log row. */
export interface EmailSendJobResult {
  subject: string | null;
  providerMessageId: string | null;
}

/** 2FA login-code email payload. Secret: `{ code }`. */
export interface TwoFactorCodeEmailJob extends EmailJobBase {
  template: '2fa-code';
  secret: SealedSecret;
}

/** Forgot-password reset-code email payload. Secret: `{ code }`. */
export interface PasswordResetEmailJob extends EmailJobBase {
  template: 'password-reset';
  secret: SealedSecret;
  /** Code validity in minutes (mirrors the Redis TTL). */
  ttlMinutes: number;
}

/** Secret: `{ temporaryPassword }`. */
export interface AccountCreatedEmailJob extends EmailJobBase {
  template: 'account-created';
  props: Omit<AccountCreatedProps, 'temporaryPassword'>;
  secret: SealedSecret;
}

export interface AccountDeactivatedEmailJob extends EmailJobBase {
  template: 'account-deactivated';
  props: AccountDeactivatedProps;
}

export interface AccountReactivatedEmailJob extends EmailJobBase {
  template: 'account-reactivated';
  props: AccountReactivatedProps;
}

/**
 * Admin-issued password reset. Shared by internal users and carriers — one
 * template, one job type (decision 2026-07-30). Secret: `{ temporaryPassword }`.
 */
export interface AccountPasswordResetEmailJob extends EmailJobBase {
  template: 'account-password-reset';
  props: Omit<AccountPasswordResetProps, 'temporaryPassword'>;
  secret: SealedSecret;
}

/** Monday summary report for admins. */
export interface WeeklyReportEmailJob extends EmailJobBase {
  template: 'weekly-report';
  props: WeeklyReportProps;
}

export interface CarrierDecisionEmailJob extends EmailJobBase {
  template: 'carrier-decision';
  props: CarrierDecisionProps;
}

export interface InternalDecisionEmailJob extends EmailJobBase {
  template: 'internal-decision';
  props: InternalDecisionProps;
}

export interface CarrierSubmittedEmailJob extends EmailJobBase {
  template: 'carrier-submitted';
  props: CarrierSubmittedProps;
}

/**
 * Maksim over-threshold confirmation-request email — the ONLY authorization
 * notification (auto-fired at verification when the dopłata crosses the
 * threshold, moving the claim into `OCZEKUJE_NA_AUTORYZACJE`).
 */
export interface MaksimConfirmationRequestEmailJob extends EmailJobBase {
  template: 'maksim-confirmation-request';
  props: MaksimConfirmationRequestProps;
  /**
   * Mailbox of the pracownik who armed the gate (`Claim.verifiedById`) — the
   * only `Reply-To` in the whole system, because only here is the reply part of
   * the flow. Absent when the verifier could not be resolved. See
   * `MailService.sendMaksimConfirmationRequest`.
   */
  replyTo?: string;
}

/**
 * Reklamacja FILED → every active `admin` + `pracownik` (REWORK 2026-07-31).
 */
export interface ReklamacjaInternalSubmittedEmailJob extends EmailJobBase {
  template: 'reklamacja-internal-submitted';
  props: ReklamacjaInternalSubmittedProps;
}

/** Reklamacja FILED → receipt to the carrier. */
export interface ReklamacjaCarrierSubmittedEmailJob extends EmailJobBase {
  template: 'reklamacja-carrier-submitted';
  props: ReklamacjaCarrierSubmittedProps;
}

/**
 * Reklamacja DECIDED (`UZNANA` / `ODRZUCONA`) → the carrier. Separate from
 * `carrier-decision` because the claim status rolls back on a reklamacja
 * decision, so the generic template would re-announce the wniosek verdict.
 */
export interface ReklamacjaCarrierDecisionEmailJob extends EmailJobBase {
  template: 'reklamacja-carrier-decision';
  props: ReklamacjaCarrierDecisionProps;
}

export interface VerificationDigestEmailJob extends EmailJobBase {
  template: 'verification-digest';
  props: VerificationDigestProps;
}

export interface DelegationAnnouncedEmailJob extends EmailJobBase {
  template: 'delegation-announced';
  props: DelegationAnnouncedProps;
}

export interface DelegationReadyEmailJob extends EmailJobBase {
  template: 'delegation-ready';
  props: DelegationReadyProps;
}

/** Guarantee Watchdog #17 — carrier wyjazd reminder (plan §6). */
export interface GuaranteeReminderCarrierEmailJob extends EmailJobBase {
  template: 'guarantee-reminder-carrier';
  props: GuaranteeReminderCarrierProps;
}

/** Guarantee Watchdog #18 — opiekun daily digest (plan §6). */
export interface GuaranteeOpiekunDigestEmailJob extends EmailJobBase {
  template: 'guarantee-opiekun-digest';
  props: GuaranteeOpiekunDigestProps;
}

/** Vehicle-removal admin digest (vehicle-status rework, Step B — 29-day cron). */
export interface VehicleRemovalAdminEmailJob extends EmailJobBase {
  template: 'vehicle-removal-admin';
  props: VehicleRemovalAdminProps;
}

/**
 * "This employee has no role yet" notice to one admin (Google SSO, docs/24 §4).
 */
export interface SsoAccessRequestedEmailJob extends EmailJobBase {
  template: 'sso-access-requested';
  props: SsoAccessRequestedProps;
}

/** Directory reconcile outcome for one admin (Google SSO, docs/24 §A4). */
export interface DirectoryReconcileReportEmailJob extends EmailJobBase {
  template: 'directory-reconcile-report';
  props: DirectoryReconcileReportProps;
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
  | ReklamacjaInternalSubmittedEmailJob
  | ReklamacjaCarrierSubmittedEmailJob
  | ReklamacjaCarrierDecisionEmailJob
  | VerificationDigestEmailJob
  | DelegationAnnouncedEmailJob
  | DelegationReadyEmailJob
  | GuaranteeReminderCarrierEmailJob
  | GuaranteeOpiekunDigestEmailJob
  | VehicleRemovalAdminEmailJob
  | SsoAccessRequestedEmailJob
  | DirectoryReconcileReportEmailJob;

/** Template keys whose jobs carry a sealed secret. */
export type SecretEmailJob = Extract<EmailSendJobData, { secret: SealedSecret }>;
