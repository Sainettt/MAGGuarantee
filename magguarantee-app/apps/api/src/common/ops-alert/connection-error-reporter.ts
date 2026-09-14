import type { Logger } from '@nestjs/common';

import { KeyedRateLimiter } from './keyed-rate-limiter';
import type { OpsAlertService } from './ops-alert.service';
import { describeError } from './redact';

/** At most one connection-error log line per source per minute. */
export const CONNECTION_ERROR_LOG_WINDOW_MS = 60_000;

/**
 * Rate-limited reporter for `error` events of long-lived connections — the
 * ioredis client, BullMQ queues and workers (2026-08-14 logging audit, item
 * 20).
 *
 * Why a listener at all: an EventEmitter `error` with no listener is either an
 * uncaught exception or, for ioredis, an unstructured "[ioredis] Unhandled
 * error event" on stderr. Why rate-limited: while Redis is down those events
 * fire on every reconnect attempt, every few seconds, per connection.
 *
 * `report` is synchronous and never throws; the ops alert (its own 10-minute
 * dedupe) is fired and forgotten.
 */
export class ConnectionErrorReporter {
  private readonly limiter = new KeyedRateLimiter(CONNECTION_ERROR_LOG_WINDOW_MS);

  constructor(
    private readonly logger: Logger,
    /** Stable identifier of the connection, e.g. `redis`, `queue:email-send`. */
    private readonly source: string,
    private readonly alerts?: OpsAlertService,
  ) {}

  report(err: unknown): void {
    const decision = this.limiter.take(this.source);
    if (!decision.allowed) return;
    const { errorName, errorMessage } = describeError(err);
    const code = errorCode(err);
    this.logger.error({
      msg: 'connection error',
      source: this.source,
      errorName,
      errorMessage,
      ...(code ? { code } : {}),
      suppressedSince: decision.suppressedSince,
    });
    void this.alerts?.send({
      key: `connection-error:${this.source}`,
      severity: 'error',
      title: `Connection error: ${this.source}`,
      fields: { source: this.source, errorName, errorMessage, code },
    });
  }
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
