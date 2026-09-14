// Single POST to a Google Chat incoming webhook.
//
// 2026-08-14 logging audit, item 23: this helper used to retry 3× internally
// (1 s, 2 s backoff) INSIDE each of BullMQ's 5 attempts — up to 15 POSTs and 15
// warn lines for one notification. Retrying is now BullMQ's job alone
// (`attempts: 5`, exponential from 2 s, see ChatNotifierService); this function
// makes exactly one request per attempt and reports the outcome as a typed
// error. It does not log: the processor's `failed` listener writes the one
// line per attempt, with job id and attempt number.
//
// Never logged or thrown: the URL (it embeds the webhook key) and the response
// body (the webhook's error page is not ours to repeat).

import { describeError } from '../../../common/ops-alert/redact';

const DEFAULT_TIMEOUT_MS = 10_000;

/** HTTP statuses that are worth another attempt despite being 4xx. */
const RETRYABLE_4XX = new Set([408, 429]);

export interface PostToChatOptions {
  timeoutMs?: number;
}

/**
 * The webhook call failed. `retryable === false` means another attempt cannot
 * help (revoked / malformed webhook: 4xx other than 408/429) — the processor
 * turns that into an `UnrecoverableError`.
 */
export class ChatWebhookError extends Error {
  constructor(
    message: string,
    /** Upstream HTTP status, or `null` when there was no response. */
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ChatWebhookError';
  }
}

/**
 * POST `{ text }` as JSON. Resolves on 2xx; throws `ChatWebhookError` otherwise
 * (non-2xx status, network failure or the 10 s timeout).
 */
export async function postToChatWebhook(
  url: string,
  text: string,
  options: PostToChatOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    // Name only (`TimeoutError`, `TypeError: fetch failed`) — an undici
    // message can include the target URL, which embeds the webhook key.
    const { errorName } = describeError(err);
    throw new ChatWebhookError(`Chat webhook unreachable (${errorName})`, null, true);
  }
  res.body?.cancel().catch(() => undefined);
  if (res.ok) return;
  const retryable = res.status >= 500 || RETRYABLE_4XX.has(res.status);
  throw new ChatWebhookError(
    `Chat webhook returned HTTP ${res.status}`,
    res.status,
    retryable,
  );
}
