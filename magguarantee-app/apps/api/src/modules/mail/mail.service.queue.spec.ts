// MailService producer + send-path behaviour added by the 2026-08-14 logging
// audit:
//  - item 5: secrets never reach job data in plaintext; retention options;
//  - item 23: one diagnostics-registry row per job (upserted, real attempt
//    number), no per-attempt error log inside a job, context reported back;
//  - item 6: batch enqueue with compensation.

jest.mock('@react-email/render', () => ({
  render: jest.fn(async () => '<html>rendered</html>'),
}));

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import type { Env } from '../../config/env.schema';
import type { EmailSendJobData } from './email-send.job';
import { mailAttemptStorage, type MailAttemptContext } from './mail-attempt-context';
import type { MailJobsRegistry } from './mail-jobs.registry';
import { MailSecretCipher } from './mail-secret-cipher';
import { EMAIL_SEND_JOB_OPTIONS, MailService } from './mail.service';
import type { MailProvider } from './providers/mail-provider.interface';

function makeCipher(): MailSecretCipher {
  return new MailSecretCipher({
    get: () => 'z'.repeat(48),
  } as unknown as ConfigService<Env, true>);
}

function makeHarness(opts: { queue?: boolean; cipher?: boolean } = {}) {
  const providerSend = jest.fn(async () => ({ messageId: '<m-1@gmail>' }));
  const provider = { send: providerSend } as unknown as MailProvider;
  const record = jest.fn(async () => ({}));
  const registry = { record } as unknown as MailJobsRegistry;
  const add = jest.fn(async () => ({ id: '1' }));
  const addBulk = jest.fn(async () => []);
  const queue = { add, addBulk } as unknown as Queue<EmailSendJobData>;
  const cipher = makeCipher();
  const service = new MailService(
    provider,
    registry,
    opts.queue === false ? undefined : queue,
    undefined,
    opts.cipher === false ? undefined : cipher,
  );
  return { service, providerSend, record, add, addBulk, cipher };
}

describe('MailService — secrets never queued in plaintext (item 5)', () => {
  it('enqueue2faCode seals the code; job data has no plaintext; opens back', async () => {
    const h = makeHarness();

    await h.service.enqueue2faCode('jan@firma.pl', '482913');

    const [name, data, options] = h.add.mock.calls[0] as unknown as [
      string,
      EmailSendJobData,
      unknown,
    ];
    expect(name).toBe('send');
    expect(JSON.stringify(data)).not.toContain('482913');
    expect(data).not.toHaveProperty('code');
    expect(data.template).toBe('2fa-code');
    if (data.template !== '2fa-code') throw new Error('narrowing');
    expect(h.cipher.openField('2fa-code', data.secret, 'code')).toBe('482913');
    expect(options).toBe(EMAIL_SEND_JOB_OPTIONS);
  });

  it('enqueuePasswordReset seals the code and keeps ttlMinutes in clear', async () => {
    const h = makeHarness();

    await h.service.enqueuePasswordReset('jan@firma.pl', '771204', 10);

    const data = h.add.mock.calls[0]?.[1 as never] as unknown as EmailSendJobData;
    expect(JSON.stringify(data)).not.toContain('771204');
    expect(data).toMatchObject({ template: 'password-reset', ttlMinutes: 10 });
  });

  it.each([
    ['enqueueAccountCreated', 'account-created'],
    ['enqueueAccountPasswordReset', 'account-password-reset'],
  ] as const)('%s strips temporaryPassword from props into the envelope', async (method, template) => {
    const h = makeHarness();
    const props = {
      name: 'Jan',
      loginName: 'jan.kowalski',
      temporaryPassword: 'Tmp#Pass-9912',
      loginUrl: 'https://app/login',
    };

    await h.service[method]('jan@firma.pl', props);

    const data = h.add.mock.calls[0]?.[1 as never] as unknown as EmailSendJobData;
    expect(JSON.stringify(data)).not.toContain('Tmp#Pass-9912');
    expect(data.template).toBe(template);
    if (data.template !== template) throw new Error('narrowing');
    expect((data as { props: Record<string, unknown> }).props).not.toHaveProperty(
      'temporaryPassword',
    );
    expect(
      h.cipher.openField(template, (data as { secret: unknown }).secret, 'temporaryPassword'),
    ).toBe('Tmp#Pass-9912');
  });

  it('without a cipher a secret template is sent synchronously — never queued', async () => {
    const h = makeHarness({ cipher: false });

    await h.service.enqueue2faCode('jan@firma.pl', '482913');

    expect(h.add).not.toHaveBeenCalled();
    expect(h.providerSend).toHaveBeenCalledTimes(1);
  });

  it('job options keep failed jobs for a bounded time/count (item 24)', () => {
    expect(EMAIL_SEND_JOB_OPTIONS.removeOnFail).toEqual({ age: 14 * 24 * 3600, count: 500 });
    expect(EMAIL_SEND_JOB_OPTIONS.removeOnComplete).toEqual({ age: 7 * 24 * 3600, count: 1000 });
    expect(EMAIL_SEND_JOB_OPTIONS.attempts).toBe(5);
  });

  it('optional enqueue options become job meta (triggeredById / target)', async () => {
    const h = makeHarness();

    await h.service.enqueueAccountDeactivated(
      'jan@firma.pl',
      { name: 'Jan', loginName: 'jan.kowalski' },
      { triggeredById: 'admin-uuid', target: { type: 'User', key: 'jan.kowalski' } },
    );

    const data = h.add.mock.calls[0]?.[1 as never] as unknown as EmailSendJobData;
    expect(data.meta).toEqual({
      triggeredById: 'admin-uuid',
      targetType: 'User',
      targetKey: 'jan.kowalski',
    });
  });
});

describe('MailService — send path inside a job (item 23)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function ctx(over: Partial<MailAttemptContext> = {}): MailAttemptContext {
    return {
      jobId: '77',
      attempt: 3,
      maxAttempts: 5,
      subject: null,
      providerMessageId: null,
      ...over,
    };
  }

  it('upserts ONE registry row per job with the real attempt and reports subject + message id', async () => {
    const h = makeHarness();
    const attempt = ctx();

    await mailAttemptStorage.run(attempt, () =>
      h.service.sendAccountDeactivated('jan@firma.pl', { name: 'Jan', loginName: 'jan' }),
    );

    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-77', attemptsMade: 3, state: 'completed' }),
    );
    expect(attempt.subject).toBe('Konto dezaktywowane — MAGGuarantee');
    expect(attempt.providerMessageId).toBe('<m-1@gmail>');
  });

  it('a failed attempt inside a job is NOT logged here (the worker listener logs it) but the row is updated', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness();
    h.providerSend.mockRejectedValueOnce(new Error('550 5.1.1 <jan@firma.pl> unknown user'));

    await expect(
      mailAttemptStorage.run(ctx(), () => h.service.send2faCode('jan@firma.pl', '482913')),
    ).rejects.toThrow('550');

    expect(error).not.toHaveBeenCalled();
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job-77',
        attemptsMade: 3,
        state: 'failed',
        // scrubbed: the recipient mailbox is masked
        failedReason: '550 5.1.1 <ja***@firma.pl> unknown user',
      }),
    );
  });

  it('outside a job (sync fallback) a failure is logged once, scrubbed, with a random registry id', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness({ queue: false });
    h.providerSend.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    await expect(h.service.send2faCode('jan@firma.pl', '482913')).rejects.toThrow();

    expect(error).toHaveBeenCalledTimes(1);
    const line = error.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(line).toMatchObject({ template: '2fa-code', toMasked: 'ja***@firma.pl' });
    expect(JSON.stringify(line)).not.toContain('482913');
    expect(h.record.mock.calls[0]?.[0 as never]).not.toHaveProperty('id');
  });

  it('the 2FA mail keeps its original text (no reply footer) and never logs the code', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const h = makeHarness({ queue: false });

    await h.service.send2faCode('jan@firma.pl', '482913');

    const args = h.providerSend.mock.calls[0]?.[0 as never] as unknown as { text: string };
    expect(args.text).toContain('482913');
    expect(args.text).not.toContain('Nie odpowiadaj');
    expect(JSON.stringify(log.mock.calls)).not.toContain('482913');
  });
});

describe('MailService.enqueueVehicleRemovalAdminBatch (item 6)', () => {
  const props = { adminName: 'A', dateLabel: '14.09.2026', thresholdDays: 29, rows: [] };

  it('adds all copies in ONE addBulk, each carrying the compensation with batch id + size', async () => {
    const h = makeHarness();

    const n = await h.service.enqueueVehicleRemovalAdminBatch(
      [
        { email: 'a1@magtrans.eu', props },
        { email: 'a2@magtrans.eu', props },
      ],
      { compensation: { kind: 'k', payload: { x: 1 } } },
    );

    expect(n).toBe(2);
    expect(h.addBulk).toHaveBeenCalledTimes(1);
    const jobs = h.addBulk.mock.calls[0]?.[0 as never] as unknown as {
      data: EmailSendJobData;
    }[];
    expect(jobs).toHaveLength(2);
    const batches = jobs.map((j) => j.data.meta?.compensation?.batch);
    expect(batches[0]).toEqual({ id: expect.any(String), size: 2 });
    expect(batches[1]).toEqual(batches[0]);
  });

  it('sync fallback: throws only when no copy could be sent', async () => {
    const h = makeHarness({ queue: false });
    h.providerSend
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ messageId: 'ok' });
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(
      h.service.enqueueVehicleRemovalAdminBatch([
        { email: 'a1@magtrans.eu', props },
        { email: 'a2@magtrans.eu', props },
      ]),
    ).resolves.toBe(1);

    h.providerSend.mockRejectedValue(new Error('down'));
    await expect(
      h.service.enqueueVehicleRemovalAdminBatch([{ email: 'a1@magtrans.eu', props }]),
    ).rejects.toThrow('down');
  });
});
