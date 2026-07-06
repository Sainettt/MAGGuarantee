import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../../config/env.schema';

/**
 * Google Chat wyjazd-notification config.
 *
 * Reads `GOOGLE_CHAT_WYJAZD_WEBHOOK_URL` from env via a typed accessor (no
 * stringly env reads scattered through the feature code) — the same pattern the
 * claims service uses for the validated `MAKSIM_EMAIL` recipient. Here the value
 * is a SECRET webhook URL, so it stays optional (empty in dev/test/Mailhog).
 *
 * When the URL is unset (dev / test / Mailhog), `enabled` is `false` and the
 * chat processor no-ops silently — see docs/16-jobs-and-integrations.md
 * #google-chat-notifications.
 */
@Injectable()
export class ChatConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** The incoming-webhook URL, or `undefined` when not configured. */
  get webhookUrl(): string | undefined {
    return this.config.get('GOOGLE_CHAT_WYJAZD_WEBHOOK_URL', { infer: true });
  }

  /** True iff a webhook URL is configured — gates the actual POST. */
  get enabled(): boolean {
    const url = this.webhookUrl;
    return typeof url === 'string' && url.trim().length > 0;
  }
}
