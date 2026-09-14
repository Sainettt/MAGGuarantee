// Redaction helpers for text that leaves the process through a log line, an
// `email_logs` row or an ops alert (2026-08-14 logging audit, items 6 / 11).
//
// Error messages are the dangerous part: an SMTP rejection echoes the
// recipient (`550 5.1.1 <jan.kowalski@firma.pl> mailbox unavailable`), a
// Prisma error echoes query arguments, a webhook error may carry the webhook
// URL (which IS the credential for a Google Chat incoming webhook). None of
// these helpers can make arbitrary text safe, so the rule stays: never pass a
// body, a code, a password or raw upstream payload in the first place. What
// they do is strip the recurring accidental leaks and bound the length.

/** Upper bound for a persisted / alerted error message (EmailLog contract). */
export const ERROR_MESSAGE_MAX_LENGTH = 500;
/** Upper bound for a scrubbed stack trace in a log line. */
export const ERROR_STACK_MAX_LENGTH = 2_000;

const EMAIL_RE = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gu;
const URL_RE = /\bhttps?:\/\/[^\s"'<>]+/giu;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
// 6+ digit runs: 2FA / reset codes (6), phone numbers, NIP (10), bank accounts
// (26). Short numbers — SMTP status codes, ports, HTTP statuses — survive.
const LONG_DIGITS_RE = /\d{6,}/gu;

/**
 * `jan.kowalski@firma.pl` → `ja***@firma.pl`. Keeps the domain (useful when a
 * whole provider bounces) and two leading characters (enough to tell two
 * recipients of one digest apart), drops the rest of the mailbox name.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? ''}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}

/** Scrub + collapse whitespace + truncate. Safe on any string input. */
export function scrubErrorText(
  text: string,
  maxLength: number = ERROR_MESSAGE_MAX_LENGTH,
): string {
  const scrubbed = text
    .replace(URL_RE, '<url>')
    .replace(BEARER_RE, 'Bearer ***')
    .replace(EMAIL_RE, (m) => maskEmail(m))
    .replace(LONG_DIGITS_RE, '<num>')
    .replace(/\s+/gu, ' ')
    .trim();
  if (scrubbed.length <= maxLength) return scrubbed;
  return `${scrubbed.slice(0, Math.max(0, maxLength - 1))}…`;
}

export interface DescribedError {
  /** `err.name` (`Error`, `GaxiosError`, `PrismaClientKnownRequestError`, …). */
  errorName: string;
  /** Scrubbed, truncated message (≤ {@link ERROR_MESSAGE_MAX_LENGTH}). */
  errorMessage: string;
}

/**
 * Name + scrubbed message of an unknown thrown value. Duck-typed rather than
 * `instanceof Error`: `AbortSignal.timeout` rejects with a `DOMException`, and
 * errors crossing a realm (jest VM contexts, worker threads) fail `instanceof`.
 */
export function describeError(err: unknown): DescribedError {
  if (isErrorLike(err)) {
    return {
      errorName: truncate(err.name || 'Error', 100),
      errorMessage: scrubErrorText(err.message),
    };
  }
  return {
    errorName: typeof err,
    errorMessage: scrubErrorText(String(err)),
  };
}

/** Scrubbed stack for log lines, or `undefined` when there is none. */
export function describeStack(err: unknown): string | undefined {
  if (!isErrorLike(err)) return undefined;
  const stack = (err as { stack?: unknown }).stack;
  return typeof stack === 'string' && stack.length > 0
    ? scrubErrorText(stack, ERROR_STACK_MAX_LENGTH)
    : undefined;
}

function isErrorLike(err: unknown): err is { name: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { name?: unknown }).name === 'string' &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}
