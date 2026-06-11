// POST variant of the shared integration fetch helper.
//
// The existing `modules/integrations/http-fetch.ts#fetchJsonWithRetry` is
// GET-only (no body, `Accept: application/json`). Google Chat incoming
// webhooks need a JSON POST, so this mirrors that helper's retry/backoff
// shape WITHOUT touching the original:
//   - 10 s timeout per attempt (AbortSignal.timeout).
//   - retry on 5xx / network failure with exponential backoff (1 s, 2 s).
//   - 4xx responses are the webhook's verdict — fail fast, no retry.
//
// On exhausted retries (or a 4xx) it throws an `Error` so the BullMQ
// processor can let the job fail and BullMQ apply its own attempt/backoff
// policy on top.

import { Logger } from '@nestjs/common';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ATTEMPTS = 3;

const log = new Logger('ChatWebhook');

export interface PostToChatOptions {
  attempts?: number;
  timeoutMs?: number;
}

/**
 * POST `{ text }` as JSON to a Google Chat incoming webhook.
 *
 * Resolves on a 2xx. Throws on 4xx (fast, no retry) or after exhausting the
 * 5xx/network retries — the caller (chat processor) lets the BullMQ job fail
 * so it is retried per the queue's own policy.
 */
export async function postToChatWebhook(
  url: string,
  text: string,
  options: PostToChatOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify({ text });

  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) {
        return;
      }
      // 4xx — the webhook rejected the request (bad URL, revoked, malformed).
      // Retrying won't help; fail fast.
      if (res.status >= 400 && res.status < 500) {
        const detail = await safeReadText(res);
        log.warn({ msg: 'chat webhook 4xx', status: res.status });
        throw new Error(
          `Chat webhook returned ${res.status}${detail ? `: ${detail}` : ''}`,
        );
      }
      // 5xx — transient; record and retry unless out of attempts.
      lastError = new Error(`Chat webhook returned ${res.status}`);
      log.warn({
        msg: 'chat webhook 5xx, will retry',
        status: res.status,
        attempt: i + 1,
        attemptsLeft: attempts - i - 1,
      });
    } catch (err) {
      // A thrown 4xx Error above must bubble straight out (it carries the
      // "returned 4" prefix); only network/timeout errors are retried.
      if (err instanceof Error && /Chat webhook returned 4/.test(err.message)) {
        throw err;
      }
      lastError = err;
      log.warn({
        msg: 'chat webhook network/timeout, will retry',
        attempt: i + 1,
        attemptsLeft: attempts - i - 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (i < attempts - 1) {
      await sleep(1000 * 2 ** i);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Chat webhook unavailable after ${attempts} attempts`);
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
