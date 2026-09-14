// Tiny shared HTTP helper for outbound integrations (VIES / Biała Lista / …).
//
// Per docs/16-jobs-and-integrations.md#внешние-rest-интеграции:
//   - 10 s timeout per attempt (AbortSignal.timeout).
//   - 3 attempts on 5xx / network failure with exponential backoff (1 s, 2 s).
//   - 4xx responses propagate without retry — they're the upstream's verdict.
//
// Both knobs are overridable per call: the MAGSpace directory client uses a 3 s
// timeout and `attempts: 1` on the sign-in path (a login must fail fast, not
// hold the user for 3 retries), plus an `Authorization` header.
//
// What this helper does NOT do (2026-09-14 logging audit, item 2):
//   - log the URL. Upstream URLs carry personal data in the path or query
//     (`/nip/{NIP}/bank-account/{ACCOUNT}`, `/ms/{CC}/vat/{VAT}`,
//     `?email=…`). Log lines name the upstream by `tag` and host only.
//   - read, log or forward the upstream response body on failure. It used to
//     become the exception message and so the client-facing `detail`; an
//     upstream is free to echo the request (our NIP, the employee e-mail) or
//     its own internals there. Errors now carry a generic message plus a
//     machine-readable `extensions.code`.
//
// We intentionally don't reach for axios / undici / got — global `fetch` (Node
// 20) is sufficient and the dep budget for Phase 2 is tight.

import { HttpException, HttpStatus, Logger } from '@nestjs/common';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ATTEMPTS = 3;

/** Upstream answered 4xx — its verdict on our request. */
export const INTEGRATION_UPSTREAM_REJECTED = 'INTEGRATION_UPSTREAM_REJECTED';
/** Upstream answered 5xx on every attempt, or never answered at all. */
export const INTEGRATION_UPSTREAM_UNAVAILABLE =
  'INTEGRATION_UPSTREAM_UNAVAILABLE';

const log = new Logger('IntegrationFetch');

export interface FetchWithRetryOptions {
  attempts?: number;
  timeoutMs?: number;
  /** Identifier baked into the log lines so failures are grep-able. */
  tag?: string;
  /**
   * Extra request headers, merged over the default `Accept: application/json`.
   *
   * Added for the MAGSpace employee directory (docs/24 §A0.2), which is
   * server-to-server and needs `Authorization: Bearer …`. Never logged — the
   * failure paths below log tag, host and status only.
   */
  headers?: Record<string, string>;
}

/**
 * The failure `fetchJsonWithRetry` throws. A plain `HttpException` as far as
 * the RFC 7807 filter is concerned (status = upstream status, or 503 when the
 * upstream never answered), so existing `err.getStatus() === 404` checks keep
 * working; `upstreamStatus` is there for callers that want to log the
 * upstream's own answer separately.
 */
export class IntegrationUpstreamError extends HttpException {
  constructor(
    readonly tag: string,
    readonly upstreamStatus: number | null,
    readonly code: string,
    status: number,
  ) {
    super(
      {
        statusCode: status,
        message:
          code === INTEGRATION_UPSTREAM_REJECTED
            ? 'The external service rejected the request'
            : 'The external service is unavailable',
        extensions: { code },
      },
      status,
    );
    this.name = 'IntegrationUpstreamError';
  }
}

/**
 * GET `url` with retry-on-5xx + retry-on-network-error.
 *
 * On exhausted retries (or 4xx upstream) — throws `IntegrationUpstreamError`
 * carrying the upstream status code so the global RFC 7807 filter renders it
 * cleanly.
 *
 * Returns `unknown` (parsed JSON). The caller is responsible for narrowing
 * via Zod or manual checks before consuming.
 */
export async function fetchJsonWithRetry(
  url: string,
  options: FetchWithRetryOptions = {},
): Promise<unknown> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const tag = options.tag ?? 'integration';
  const host = hostOf(url);
  const headers = { Accept: 'application/json', ...options.headers };

  let lastStatus: number | null = null;
  for (let i = 0; i < attempts; i++) {
    const attemptsLeft = attempts - i - 1;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers,
      });
      if (res.ok) {
        return (await res.json()) as unknown;
      }
      // 4xx — propagate, no retry. The body is deliberately never read.
      if (res.status >= 400 && res.status < 500) {
        discardBody(res);
        log.warn({ msg: `${tag}: upstream 4xx`, tag, host, status: res.status });
        throw new IntegrationUpstreamError(
          tag,
          res.status,
          INTEGRATION_UPSTREAM_REJECTED,
          res.status,
        );
      }
      // 5xx — record and try again unless we're out of attempts.
      discardBody(res);
      lastStatus = res.status;
      log.warn({
        msg: `${tag}: upstream ${res.status}${attemptsLeft > 0 ? ', will retry' : ''}`,
        tag,
        host,
        status: res.status,
        attempt: i + 1,
        attemptsLeft,
      });
    } catch (err) {
      if (err instanceof IntegrationUpstreamError) throw err;
      lastStatus = null;
      log.warn({
        msg: `${tag}: network/timeout${attemptsLeft > 0 ? ', will retry' : ''}`,
        tag,
        host,
        attempt: i + 1,
        attemptsLeft,
        // `name` + the undici cause code (`ECONNREFUSED`, `UND_ERR_…`) say
        // what went wrong without any of the request in them.
        error: err instanceof Error ? err.name : typeof err,
        cause: causeCode(err),
      });
    }
    // Backoff before next attempt — but skip on the last iteration.
    if (attemptsLeft > 0) {
      await sleep(1000 * 2 ** i);
    }
  }
  // All attempts exhausted: keep the upstream 5xx when there was one (a 500
  // from the upstream surfaces as our 500, as before), 503 when it never
  // answered.
  throw new IntegrationUpstreamError(
    tag,
    lastStatus,
    INTEGRATION_UPSTREAM_UNAVAILABLE,
    lastStatus ?? HttpStatus.SERVICE_UNAVAILABLE,
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-url';
  }
}

function causeCode(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const cause: unknown = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object' && 'code' in cause) {
    const code = (cause as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Release the connection without looking at the payload. An unread body keeps
 * the undici socket busy until GC; cancelling the stream frees it.
 */
function discardBody(res: Response): void {
  res.body?.cancel().catch(() => {
    // Nothing to do — the stream was already closed/consumed.
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
