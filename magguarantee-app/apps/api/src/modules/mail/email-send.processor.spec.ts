// EmailSendProcessor + MailJobOutcomeRecorder (2026-08-14 logging audit,
// items 5 / 6 / 11):
//  - secrets are opened just before the send; a bad envelope is unrecoverable;
//  - the attempt context reaches MailService and comes back as the result;
//  - `failed` non-final → one WARN, no EmailLog, no alert, no compensation;
//  - `failed` final → ERROR + EmailLog(failed, scrubbed) + compensation + alert;
//  - `completed` → EmailLog(sent) with provider id, target, triggeredById;
//  - EmailLog write failures never propagate.

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';

import type { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import type { Env } from '../../config/env.schema';
import type { EmailLogEntry, EmailLogRepository } from './email-log.repository';
import type { EmailSendJobData } from './email-send.job';
import { EmailSendProcessor } from './email-send.processor';
import { mailAttemptStorage } from './mail-attempt-context';
import type { MailCompensationRegistry } from './mail-compensation.registry';
import { MailJobOutcomeRecorder } from './mail-job-outcome.recorder';
import { MailSecretCipher } from './mail-secret-cipher';
import type { MailService } from './mail.service';

const cipher = new MailSecretCipher({
  get: () => 'k'.repeat(48),
} as unknown as ConfigService<Env, true>);

function makeJob(
  data: EmailSendJobData,
  state: { attemptsMade?: number; attempts?: number; id?: string } = {},
): Job<EmailSendJobData> {
  return {
    id: state.id ?? '901',
    name: 'send',
    data,
    attemptsMade: state.attemptsMade ?? 0,
    opts: { attempts: state.attempts ?? 5 },
    finishedOn: Date.parse('2026-09-14T08:00:00.000Z'),
  } as unknown as Job<EmailSendJobData>;
}

function makeHarness() {
  const mail = {
    send2faCode: jest.fn(async (_email: string, _code: string) => {
      const ctx = mailAttemptStorage.getStore();
      if (ctx) {
        ctx.subject = 'Kod weryfikacyjny — MAGGuarantee';
        ctx.providerMessageId = '<gm-1>';
      }
    }),
    sendAccountCreated: jest.fn(async () => undefined),
    sendCarrierDecision: jest.fn(async () => {
      const ctx = mailAttemptStorage.getStore();
      if (ctx) ctx.subject = 'Wniosek GWA/001/09/26: zaakceptowany';
      throw new Error('550 5.1.1 <carrier.owner@trans.pl> mailbox unavailable');
    }),
  };
  const create = jest.fn(async (_entry: EmailLogEntry) => undefined);
  const emailLogs = { create } as unknown as EmailLogRepository;
  const onFinalFailure = jest.fn(async () => 'compensated' as const);
  const compensations = { onFinalFailure } as unknown as MailCompensationRegistry;
  const alertSend = jest.fn(async () => 'log-only' as const);
  const alerts = { send: alertSend } as unknown as OpsAlertService;
  const recorder = new MailJobOutcomeRecorder(emailLogs, compensations, alerts);
  const queue = { on: jest.fn() } as unknown as Queue<EmailSendJobData>;
  const processor = new EmailSendProcessor(
    mail as unknown as MailService,
    cipher,
    recorder,
    alerts,
    queue,
  );
  return { processor, mail, create, onFinalFailure, alertSend, queue };
}

const decisionJob: EmailSendJobData = {
  template: 'carrier-decision',
  email: 'carrier.owner@trans.pl',
  props: {
    nrZgl: 'GWA/001/09/26',
    decisionLabel: 'zaakceptowany',
    vehiclePlate: 'WX12345',
    periodFrom: '01.09.2026',
    periodTo: '07.09.2026',
    deeplink: 'https://app/claims/1',
  } as never,
  meta: {
    triggeredById: 'pracownik-uuid',
    compensation: { kind: 'some.kind', payload: { a: 1 } },
  },
};

describe('EmailSendProcessor.process', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the sealed 2FA code right before the send and returns subject + message id', async () => {
    const h = makeHarness();
    const job = makeJob(
      {
        template: '2fa-code',
        email: 'jan@firma.pl',
        secret: cipher.seal('2fa-code', { code: '482913' }),
      },
      { attemptsMade: 2 },
    );

    const result = await h.processor.process(job);

    expect(h.mail.send2faCode).toHaveBeenCalledWith('jan@firma.pl', '482913');
    expect(result).toEqual({
      subject: 'Kod weryfikacyjny — MAGGuarantee',
      providerMessageId: '<gm-1>',
    });
  });

  it('restores temporaryPassword into props for account-created', async () => {
    const h = makeHarness();
    const job = makeJob({
      template: 'account-created',
      email: 'jan@firma.pl',
      props: { name: 'Jan', loginName: 'jan', loginUrl: 'https://app/login' },
      secret: cipher.seal('account-created', { temporaryPassword: 'Tmp#1' }),
    });

    await h.processor.process(job);

    expect(h.mail.sendAccountCreated).toHaveBeenCalledWith('jan@firma.pl', {
      name: 'Jan',
      loginName: 'jan',
      loginUrl: 'https://app/login',
      temporaryPassword: 'Tmp#1',
    });
  });

  it('an undecryptable envelope fails the job as UnrecoverableError, without sending', async () => {
    const h = makeHarness();
    const foreign = new MailSecretCipher({
      get: () => 'other'.repeat(10),
    } as unknown as ConfigService<Env, true>).seal('2fa-code', { code: '482913' });

    const err: unknown = await h.processor
      .process(makeJob({ template: '2fa-code', email: 'jan@firma.pl', secret: foreign }))
      .catch((e: unknown) => e);

    expect((err as Error).name).toBe('UnrecoverableError');
    expect((err as Error).message).not.toContain('482913');
    expect(h.mail.send2faCode).not.toHaveBeenCalled();
  });

  it('attaches a queue error listener on init', () => {
    const h = makeHarness();
    h.processor.onModuleInit();
    expect((h.queue.on as jest.Mock).mock.calls[0]?.[0]).toBe('error');
  });
});

describe('EmailSendProcessor worker events → MailJobOutcomeRecorder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function failOnce(
    h: ReturnType<typeof makeHarness>,
    state: { attemptsMade: number; attempts: number },
  ): Promise<void> {
    const job = makeJob(decisionJob, { attemptsMade: state.attemptsMade - 1, attempts: state.attempts });
    const err = await h.processor.process(job).catch((e: unknown) => e as Error);
    // BullMQ increments attemptsMade before emitting `failed`.
    (job as { attemptsMade: number }).attemptsMade = state.attemptsMade;
    await h.processor.onFailed(job, err as Error);
  }

  it('non-final failure: one WARN with job id + attempt, nothing persisted or alerted', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness();

    await failOnce(h, { attemptsMade: 2, attempts: 5 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      msg: 'email-send attempt failed, will retry',
      jobId: '901',
      queue: 'email-send',
      template: 'carrier-decision',
      attemptsMade: 2,
      maxAttempts: 5,
      toMasked: 'ca***@trans.pl',
    });
    expect(error).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.onFinalFailure).not.toHaveBeenCalled();
    expect(h.alertSend).not.toHaveBeenCalled();
  });

  it('final failure: ERROR + one scrubbed EmailLog row + compensation + deduped alert key', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness();

    await failOnce(h, { attemptsMade: 5, attempts: 5 });

    expect(error).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledTimes(1);
    const row = h.create.mock.calls[0]![0];
    expect(row).toEqual({
      template: 'carrier-decision',
      jobId: '901',
      recipients: ['carrier.owner@trans.pl'],
      subject: 'Wniosek GWA/001/09/26: zaakceptowany',
      status: 'failed',
      attempts: 5,
      errorName: 'Error',
      errorMessage: '550 5.1.1 <ca***@trans.pl> mailbox unavailable',
      providerMessageId: null,
      targetType: 'Claim',
      targetKey: 'GWA/001/09/26',
      triggeredById: 'pracownik-uuid',
      sentAt: null,
    });
    expect(h.onFinalFailure).toHaveBeenCalledWith(
      { kind: 'some.kind', payload: { a: 1 } },
      '901',
    );
    expect(h.alertSend).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'email-send:failed:carrier-decision',
        severity: 'error',
      }),
    );
    // Alert fields never carry the full address.
    expect(JSON.stringify(h.alertSend.mock.calls)).not.toContain('carrier.owner@');
  });

  it('an UnrecoverableError on attempt 1 is final', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness();
    const job = makeJob(decisionJob, { attemptsMade: 1, attempts: 5 });
    const err = new Error('mail job secret envelope could not be decrypted');
    err.name = 'UnrecoverableError';

    await h.processor.onFailed(job, err);

    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', attempts: 1, subject: null }),
    );
  });

  it('long error messages are truncated to 500 characters', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness();

    await h.processor.onFailed(
      makeJob(decisionJob, { attemptsMade: 5, attempts: 5 }),
      new Error('x'.repeat(2_000)),
    );

    expect(h.create.mock.calls[0]![0].errorMessage!.length).toBeLessThanOrEqual(500);
  });

  it('completed: one EmailLog row with status sent, sentAt, provider id and derived target', async () => {
    const h = makeHarness();
    const job = makeJob(
      {
        template: '2fa-code',
        email: 'jan@firma.pl',
        secret: cipher.seal('2fa-code', { code: '482913' }),
      },
      { attemptsMade: 1 },
    );

    await h.processor.onCompleted(job, {
      subject: 'Kod weryfikacyjny — MAGGuarantee',
      providerMessageId: '<gm-1>',
    });

    expect(h.create).toHaveBeenCalledWith({
      template: '2fa-code',
      jobId: '901',
      recipients: ['jan@firma.pl'],
      subject: 'Kod weryfikacyjny — MAGGuarantee',
      status: 'sent',
      attempts: 1,
      errorName: null,
      errorMessage: null,
      providerMessageId: '<gm-1>',
      targetType: null,
      targetKey: null,
      triggeredById: null,
      sentAt: new Date('2026-09-14T08:00:00.000Z'),
    });
    // The sealed secret is never part of the row.
    expect(JSON.stringify(h.create.mock.calls)).not.toContain('482913');
  });

  it('an EmailLog write failure is logged and swallowed', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness();
    h.create.mockRejectedValueOnce(new Error('db down'));

    await expect(
      h.processor.onCompleted(makeJob(decisionJob, { attemptsMade: 1 }), null),
    ).resolves.toBeUndefined();

    expect(error.mock.calls[0]?.[0]).toMatchObject({ msg: 'email_logs write failed' });
  });
});
