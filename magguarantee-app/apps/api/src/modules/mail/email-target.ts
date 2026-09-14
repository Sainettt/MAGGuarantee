import type { EmailSendJobData } from './email-send.job';

/** Business entity an email is about — same convention as `AuditLog`. */
export interface EmailTarget {
  targetType: string | null;
  targetKey: string | null;
}

const NO_TARGET: EmailTarget = { targetType: null, targetKey: null };

/**
 * Resolves `email_logs.targetType/targetKey` for a job. An explicit
 * `meta.targetType/targetKey` from the producer wins; otherwise the target is
 * derived from the template props using the audit-log key conventions
 * (Claim → `nrZgl`, User → login, Vehicle → plate). Digests and reports that
 * span many entities have no target.
 */
export function resolveEmailTarget(data: EmailSendJobData): EmailTarget {
  if (data.meta?.targetType && data.meta.targetKey) {
    return { targetType: data.meta.targetType, targetKey: data.meta.targetKey };
  }
  switch (data.template) {
    case 'carrier-decision':
    case 'internal-decision':
    case 'carrier-submitted':
    case 'maksim-confirmation-request':
    case 'reklamacja-internal-submitted':
    case 'reklamacja-carrier-submitted':
    case 'reklamacja-carrier-decision':
      return { targetType: 'Claim', targetKey: data.props.nrZgl };
    case 'account-created':
    case 'account-deactivated':
    case 'account-reactivated':
    case 'account-password-reset':
      return { targetType: 'User', targetKey: data.props.loginName };
    case 'delegation-announced':
    case 'delegation-ready':
      return { targetType: 'Vehicle', targetKey: data.props.plateNumber };
    case '2fa-code':
    case 'password-reset':
    case 'weekly-report':
    case 'verification-digest':
    case 'guarantee-reminder-carrier':
    case 'guarantee-opiekun-digest':
    case 'vehicle-removal-admin':
    case 'sso-access-requested':
    case 'directory-reconcile-report':
      return NO_TARGET;
    default: {
      const exhaustive: never = data;
      return exhaustive;
    }
  }
}
