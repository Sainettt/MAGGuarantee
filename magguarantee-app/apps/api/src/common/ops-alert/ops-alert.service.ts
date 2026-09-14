import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { KeyedRateLimiter } from './keyed-rate-limiter';
import { describeError } from './redact';

/** One message per alert key per window; the rest are counted, not sent. */
export const OPS_ALERT_DEDUPE_WINDOW_MS = 10 * 60 * 1000;
/** Direct POST, single attempt — an alert must never stall the caller. */
export const OPS_ALERT_TIMEOUT_MS = 5_000;

export type OpsAlertSeverity = 'error' | 'warning';

export type OpsAlertFieldValue = string | number | boolean | null | undefined;

/**
 * An operator-facing alert. Contract for callers:
 *
 *  - `key` is the dedupe unit — make it identify the KIND of problem, not the
 *    instance (`email-send:failed:account-created`, not the job id), otherwise
 *    the rate limit never engages.
 *  - `fields` must already be safe: ids, counts, template names, error NAMES
 *    and messages passed through `describeError`. Never a body, a code, a
 *    password, a full e-mail address or a raw upstream payload — the Chat
 *    space is readable by more people than the logs.
 */
export interface OpsAlert {
  key: string;
  severity: OpsAlertSeverity;
  title: string;
  fields?: Record<string, OpsAlertFieldValue>;
}

export type OpsAlertOutcome = 'posted' | 'log-only' | 'suppressed' | 'post-failed';

/**
 * Ops alerting (2026-08-14 logging audit, item 6). Posts a plain-text message
 * to the Google Chat incoming webhook in `OPS_ALERT_WEBHOOK_URL`; when that is
 * unset the alert is written to the log only.
 *
 * Deliberately NOT a BullMQ job: the failures worth alerting on include Redis
 * itself being down. The POST goes out directly with a short timeout and no
 * retry, and `send` never throws — alerting is best-effort by definition.
 */
@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);
  private readonly limiter: KeyedRateLimiter;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.limiter = new KeyedRateLimiter(OPS_ALERT_DEDUPE_WINDOW_MS);
  }

  async send(alert: OpsAlert): Promise<OpsAlertOutcome> {
    try {
      const decision = this.limiter.take(alert.key);
      if (!decision.allowed) return 'suppressed';

      const text = this._format(alert, decision.suppressedSince);
      const url = this.config.get('OPS_ALERT_WEBHOOK_URL', { infer: true });
      if (!url) {
        this.logger.warn({
          msg: 'ops alert (OPS_ALERT_WEBHOOK_URL unset, log-only)',
          alertKey: alert.key,
          severity: alert.severity,
          title: alert.title,
          suppressedSince: decision.suppressedSince,
          ...(alert.fields ?? {}),
        });
        return 'log-only';
      }
      return await this._post(url, text, alert.key);
    } catch (err) {
      // Formatting / config access should never throw, but an alerting bug
      // must not turn into a second failure in the caller.
      this.logger.warn({
        msg: 'ops alert could not be emitted',
        alertKey: alert.key,
        errorName: describeError(err).errorName,
      });
      return 'post-failed';
    }
  }

  private async _post(
    url: string,
    text: string,
    key: string,
  ): Promise<OpsAlertOutcome> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(OPS_ALERT_TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ text }),
      });
      // The body is never read: a webhook error page is not ours to log.
      res.body?.cancel().catch(() => undefined);
      if (!res.ok) {
        this.logger.warn({ msg: 'ops alert webhook rejected the post', alertKey: key, status: res.status });
        return 'post-failed';
      }
      this.logger.log({ msg: 'ops alert posted', alertKey: key });
      return 'posted';
    } catch (err) {
      // Never log the URL — it carries the webhook key.
      this.logger.warn({
        msg: 'ops alert webhook unreachable',
        alertKey: key,
        errorName: describeError(err).errorName,
      });
      return 'post-failed';
    }
  }

  private _format(alert: OpsAlert, suppressedSince: number): string {
    const level = alert.severity === 'error' ? 'ERROR' : 'WARNING';
    const lines = [`*[${level}] [MAGGuarantee ${this._environmentLabel()}] ${alert.title}*`];
    for (const [k, v] of Object.entries(alert.fields ?? {})) {
      if (v === undefined || v === null || v === '') continue;
      lines.push(`${k}: ${String(v)}`);
    }
    if (suppressedSince > 0) {
      const minutes = Math.round(OPS_ALERT_DEDUPE_WINDOW_MS / 60_000);
      lines.push(`(+${suppressedSince} similar alert(s) suppressed in the previous ${minutes} min window)`);
    }
    return lines.join('\n');
  }

  /** Host of APP_URL — tells staging from production in a shared space. */
  private _environmentLabel(): string {
    const appUrl = this.config.get('APP_URL', { infer: true });
    try {
      return new URL(appUrl).host;
    } catch {
      return this.config.get('NODE_ENV', { infer: true });
    }
  }
}
