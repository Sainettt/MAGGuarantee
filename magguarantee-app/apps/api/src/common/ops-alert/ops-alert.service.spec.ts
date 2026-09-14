// OpsAlertService + redaction helpers + rate limiter + guarded cron +
// connection-error reporter (2026-08-14 logging audit, items 6 / 20).

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { ConnectionErrorReporter } from './connection-error-reporter';
import { runGuardedCron } from './guarded-cron';
import { KeyedRateLimiter } from './keyed-rate-limiter';
import { OPS_ALERT_DEDUPE_WINDOW_MS, OpsAlertService } from './ops-alert.service';
import { describeError, maskEmail, scrubErrorText } from './redact';

const WEBHOOK = 'https://chat.googleapis.com/v1/spaces/OPS/messages?key=SECRET-KEY&token=T';

function makeService(url: string | undefined): OpsAlertService {
  const config = {
    get: (key: keyof Env) => {
      if (key === 'OPS_ALERT_WEBHOOK_URL') return url;
      if (key === 'APP_URL') return 'https://magguarantee.magtrans.eu';
      if (key === 'NODE_ENV') return 'production';
      return undefined;
    },
  } as unknown as ConfigService<Env, true>;
  return new OpsAlertService(config);
}

describe('OpsAlertService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('posts one plain-text message to the webhook', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const svc = makeService(WEBHOOK);

    const outcome = await svc.send({
      key: 'email-send:failed:account-created',
      severity: 'error',
      title: 'Email delivery failed permanently: account-created',
      fields: { jobId: '9', attempts: '5/5', ignored: undefined },
    });

    expect(outcome).toBe('posted');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    const { text } = JSON.parse(init?.body as string) as { text: string };
    expect(text).toContain('[ERROR] [MAGGuarantee magguarantee.magtrans.eu]');
    expect(text).toContain('jobId: 9');
    expect(text).not.toContain('ignored');
    expect(init?.signal).toBeDefined();
  });

  it('dedupes per key for 10 minutes and reports the suppressed count on the next message', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-14T08:00:00Z') });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 200 }));
    const svc = makeService(WEBHOOK);
    const alert = { key: 'k', severity: 'error' as const, title: 'T' };

    expect(await svc.send(alert)).toBe('posted');
    expect(await svc.send(alert)).toBe('suppressed');
    expect(await svc.send(alert)).toBe('suppressed');
    // A different key is independent.
    expect(await svc.send({ ...alert, key: 'other' })).toBe('posted');

    jest.setSystemTime(Date.now() + OPS_ALERT_DEDUPE_WINDOW_MS);
    expect(await svc.send(alert)).toBe('posted');

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const { text } = JSON.parse(fetchSpy.mock.calls[2]![1]?.body as string) as { text: string };
    expect(text).toContain('+2 similar alert(s) suppressed');
  });

  it('without a webhook URL the alert is log-only', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(global, 'fetch');
    const svc = makeService(undefined);

    const outcome = await svc.send({ key: 'k', severity: 'warning', title: 'T', fields: { a: 1 } });

    expect(outcome).toBe('log-only');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn.mock.calls[0]?.[0]).toMatchObject({ alertKey: 'k', title: 'T', a: 1 });
  });

  it('a rejected or unreachable webhook never throws and never logs the URL', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('bad key', { status: 403 }))
      .mockRejectedValueOnce(new DOMException('The operation was aborted', 'TimeoutError'));
    const svc = makeService(WEBHOOK);

    await expect(svc.send({ key: 'a', severity: 'error', title: 'T' })).resolves.toBe('post-failed');
    await expect(svc.send({ key: 'b', severity: 'error', title: 'T' })).resolves.toBe('post-failed');

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('SECRET-KEY');
    expect(logged).not.toContain('bad key');
    expect(logged).toContain('TimeoutError');
  });
});

describe('redact helpers', () => {
  it('masks e-mails, strips URLs / bearer tokens / long digit runs, truncates', () => {
    const text =
      '550 <jan.kowalski@firma.pl> rejected; see https://x.test/a?key=abc; ' +
      'Authorization: Bearer eyJhbGciOi.abc.def; code 482913 NIP 5250001009 port 1025';

    const out = scrubErrorText(text);

    expect(out).toContain('<ja***@firma.pl>');
    expect(out).toContain('<url>');
    expect(out).toContain('Bearer ***');
    expect(out).not.toContain('482913');
    expect(out).not.toContain('5250001009');
    expect(out).toContain('port 1025');
    expect(scrubErrorText('y'.repeat(900)).length).toBe(500);
  });

  it('describeError handles non-Error throws', () => {
    expect(describeError('boom')).toEqual({ errorName: 'string', errorMessage: 'boom' });
    expect(maskEmail('ab@c.pl')).toBe('a***@c.pl');
    expect(maskEmail('nope')).toBe('***');
  });
});

describe('KeyedRateLimiter', () => {
  it('evicts the oldest key beyond the cap', () => {
    let now = 0;
    const limiter = new KeyedRateLimiter(1_000, () => now, 2);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('b').allowed).toBe(true);
    expect(limiter.take('c').allowed).toBe(true); // evicts 'a'
    expect(limiter.take('a').allowed).toBe(true); // 'a' forgotten → allowed again
    expect(limiter.take('c').allowed).toBe(false);
    now = 1_000;
    expect(limiter.take('c')).toEqual({ allowed: true, suppressedSince: 1 });
  });
});

describe('runGuardedCron', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('swallows the failure into a structured ERROR + alert', async () => {
    const logger = new Logger('X');
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const send = jest.fn(async () => 'log-only' as const);

    await expect(
      runGuardedCron(
        { job: 'demo', logger, alerts: { send } as unknown as OpsAlertService },
        async () => {
          throw new Error('query failed for jan@firma.pl');
        },
      ),
    ).resolves.toBeUndefined();

    expect(error.mock.calls[0]?.[0]).toMatchObject({
      msg: 'cron job failed',
      job: 'demo',
      errorName: 'Error',
      errorMessage: 'query failed for ja***@firma.pl',
      durationMs: expect.any(Number),
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ key: 'cron-failed:demo' }));
  });
});

describe('ConnectionErrorReporter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs at most once per minute per source and alerts', () => {
    const logger = new Logger('X');
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const send = jest.fn(async () => 'log-only' as const);
    const reporter = new ConnectionErrorReporter(
      logger,
      'redis',
      { send } as unknown as OpsAlertService,
    );
    const econn = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:6379'), {
      code: 'ECONNREFUSED',
    });

    for (let i = 0; i < 20; i++) reporter.report(econn);

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toMatchObject({
      msg: 'connection error',
      source: 'redis',
      code: 'ECONNREFUSED',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
