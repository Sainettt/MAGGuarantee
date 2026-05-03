// Tiny shared HTTP helper for outbound integrations (VIES / Biała Lista / …).
//
// Per docs/16-jobs-and-integrations.md#внешние-rest-интеграции:
//   - 10 s timeout per attempt (AbortSignal.timeout).
//   - 3 attempts on 5xx / network failure with exponential backoff (1 s, 2 s).
//   - 4xx responses propagate without retry — they're the upstream's verdict.
//
// We intentionally don't reach for axios / undici / got — global `fetch` (Node
// 20) is sufficient and the dep budget for Phase 2 is tight.

import { HttpException, Logger } from '@nestjs/common';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ATTEMPTS = 3;

const log = new Logger('IntegrationFetch');

export interface FetchWithRetryOptions {
  attempts?: number;
  timeoutMs?: number;
  /** Identifier baked into the log lines so failures are grep-able. */
  tag?: string;
}

/**
 * GET `url` with retry-on-5xx + retry-on-network-error.
 *
 * On exhausted retries (or 4xx upstream) — throws `HttpException` carrying
 * the upstream status code so the global RFC 7807 filter renders it cleanly.
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

  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        return (await res.json()) as unknown;
      }
      // 4xx — propagate verbatim, no retry.
      if (res.status >= 400 && res.status < 500) {
        const body = await safeReadText(res);
        log.warn({
          msg: `${tag}: upstream 4xx`,
          status: res.status,
          url,
        });
        throw new HttpException(
          {
            statusCode: res.status,
            message: body || `Upstream returned ${res.status}`,
          },
          res.status,
        );
      }
      // 5xx — record and try again unless we're out of attempts.
      lastError = new HttpException(
        `Upstream ${res.status}`,
        res.status,
      );
      log.warn({
        msg: `${tag}: upstream 5xx, will retry`,
        status: res.status,
        attempt: i + 1,
        attemptsLeft: attempts - i - 1,
      });
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() < 500) {
        // 4xx already wrapped — bubble up.
        throw err;
      }
      lastError = err;
      log.warn({
        msg: `${tag}: network/timeout, will retry`,
        attempt: i + 1,
        attemptsLeft: attempts - i - 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // Backoff before next attempt — but skip on the last iteration.
    if (i < attempts - 1) {
      await sleep(1000 * 2 ** i);
    }
  }
  // All attempts exhausted.
  if (lastError instanceof HttpException) throw lastError;
  throw new HttpException(
    `Upstream ${tag} unavailable after ${attempts} attempts`,
    503,
  );
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
