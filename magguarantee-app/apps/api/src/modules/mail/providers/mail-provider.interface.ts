/**
 * Provider-agnostic outgoing-mail surface.
 *
 * `MailService` depends on this interface via the `MAIL_PROVIDER_TOKEN`
 * injection token, never on a concrete class. Two implementations exist:
 *
 *  - `SmtpProvider`     — dev/staging, talks SMTP to Mailhog. Ignores the
 *                         threading fields entirely (Mailhog has no threads).
 *  - `GmailApiProvider` — production, talks to the Gmail REST API via a
 *                         service-account. Honours the threading fields to
 *                         glue every email about one `nrZgl` into a single
 *                         Gmail thread (RFC In-Reply-To / References).
 *
 * Selection is env-driven (`MAIL_PROVIDER`) and wired in `MailModule`.
 * See docs/16-jobs-and-integrations.md §"Email через Gmail API".
 */
export interface SendMailArgs {
  to: string | string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;

  /**
   * Overrides where the recipient's «Reply» button points. Omitted on every
   * template but one: the outgoing address (`GMAIL_FROM`) is an unattended
   * no-reply Google Group, so a reply to `From` bounces by design. The lone
   * exception is `maksim-confirmation-request`, whose confirmation reply IS
   * part of the flow (a pracownik screenshots it as `AUTORYZACJA_MAKSIMA`) —
   * there we point it at the pracownik who armed the gate, so the reply lands
   * in a mailbox someone actually reads. See docs/16 §"Односторонний канал".
   */
  replyTo?: string | null;

  // ── Threading (Gmail only — SMTP ignores these) ──────────
  /** Gmail thread id of a prior message in the same conversation, if known. */
  gmailThreadId?: string | null;
  /** RFC Message-ID of the last message in the thread (→ In-Reply-To/References). */
  inReplyToMessageId?: string | null;
}

export interface SendMailResult {
  /** RFC Message-ID of the message we just sent, if the provider exposes it. */
  messageId?: string | null;
  /** Gmail thread id the message landed in, if applicable. */
  gmailThreadId?: string | null;
}

export interface MailProvider {
  send(args: SendMailArgs): Promise<SendMailResult>;
}

/** DI token resolving to the env-selected `MailProvider` implementation. */
export const MAIL_PROVIDER_TOKEN = Symbol('MAIL_PROVIDER');
