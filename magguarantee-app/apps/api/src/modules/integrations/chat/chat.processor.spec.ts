// Unit tests for the in-process chat-notify-wyjazd worker.
//  - no-op (no POST) when the webhook URL is unset.
//  - POSTs the 6-line message when the URL is set (mocked fetch).
//  - exactly ONE POST per attempt — retries belong to BullMQ, not chat.http.
//  - 5xx / 429 / network → retryable error; other 4xx → UnrecoverableError.
//  - completes silently when the delegation context is gone.
//  - `failed` listener: WARN while retrying, ERROR + ops alert when final.

import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

import type { OpsAlertService } from '../../../common/ops-alert/ops-alert.service';
import type { ChatConfig } from './chat.config';
import type { BuildResult, ChatContextBuilder } from './chat-context.builder';
import { ChatWebhookError } from './chat.http';
import { ChatProcessor } from './chat.processor';
import type { ChatWyjazdJobData } from './chat-notifier.service';
import type { WyjazdMessageContext } from './chat-message';

const WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/AAA/messages?key=k';

function fullCtx(): WyjazdMessageContext {
  return {
    plateNumber: 'WX12345',
    trailerPlate: 'WT67890',
    sideNumber: '101',
    gpsMobilePhone: '+48600100200',
    driverName: 'Jan Kowalski',
    driverPhone: '+48700200300',
    departureAt: new Date('2026-03-15T09:30:00.000Z'),
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: new Date('2026-03-20T00:00:00.000Z'),
    returnCountry: 'DE',
    returnPostalCode: '10115',
    planista: 'Anna Planista',
    // Phase 11 — the dispatch team's roster (was a single dyspozytor +
    // weryfikator).
    dyspozytorzy: ['Bartek Dyspozytor', 'Celina Dyspozytor'],
    opiekun: 'Damian Opiekun',
  };
}

function makeProcessor(opts: {
  enabled: boolean;
  webhookUrl?: string;
  build: BuildResult;
}) {
  const config = {
    enabled: opts.enabled,
    webhookUrl: opts.webhookUrl,
  } as unknown as ChatConfig;
  const buildFn = jest.fn(async () => opts.build);
  const builder = { build: buildFn } as unknown as ChatContextBuilder;
  const send = jest.fn(async () => 'log-only' as const);
  const alerts = { send } as unknown as OpsAlertService;
  const queue = { on: jest.fn() } as unknown as Queue<ChatWyjazdJobData>;
  const processor = new ChatProcessor(config, builder, alerts, queue);
  return { processor, buildFn, send, queue };
}

function job(
  delegationId = 'del-1',
  state: { attemptsMade?: number; attempts?: number } = {},
): Job<ChatWyjazdJobData> {
  return {
    id: '42',
    name: 'wyjazd',
    data: { delegationId },
    attemptsMade: state.attemptsMade ?? 0,
    opts: { attempts: state.attempts ?? 5 },
  } as unknown as Job<ChatWyjazdJobData>;
}

describe('ChatProcessor.process', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('no-ops (no fetch, no build) when the webhook URL is unset', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const { processor, buildFn } = makeProcessor({
      enabled: false,
      build: fullCtx(),
    });

    await expect(processor.process(job())).resolves.toBeUndefined();

    expect(buildFn).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs the 6-line message to the webhook when enabled', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const { processor } = makeProcessor({
      enabled: true,
      webhookUrl: WEBHOOK_URL,
      build: fullCtx(),
    });

    await processor.process(job());

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(WEBHOOK_URL);
    expect(init?.method).toBe('POST');
    const body = JSON.parse((init?.body as string) ?? '{}') as { text: string };
    const lines = body.text.split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[0]).toBe('ZESTAW: WX12345 / WT67890 / 101 / +48600100200');
    expect(lines[1]).toBe('KIEROWCA: Jan Kowalski / +48700200300');
    expect(lines[2]).toBe('WYJAZD: 15/03/2026 10:30 / PL / 00-001');
    expect(lines[5]).toBe('OPIEKUN: Damian Opiekun');
  });

  it('a 5xx makes exactly ONE POST and throws a retryable error (BullMQ retries)', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 503 }));
    const { processor } = makeProcessor({
      enabled: true,
      webhookUrl: WEBHOOK_URL,
      build: fullCtx(),
    });

    const err: unknown = await processor.process(job()).catch((e: unknown) => e);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(ChatWebhookError);
    expect((err as ChatWebhookError).retryable).toBe(true);
    expect((err as ChatWebhookError).status).toBe(503);
    // The webhook key must never end up in the error.
    expect((err as Error).message).not.toContain('key=');
  });

  it('a 429 is retryable, a network failure is retryable, both with one POST', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const { processor } = makeProcessor({
      enabled: true,
      webhookUrl: WEBHOOK_URL,
      build: fullCtx(),
    });

    const first: unknown = await processor.process(job()).catch((e: unknown) => e);
    const second: unknown = await processor.process(job()).catch((e: unknown) => e);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect((first as ChatWebhookError).retryable).toBe(true);
    expect((second as ChatWebhookError).retryable).toBe(true);
    expect((second as ChatWebhookError).status).toBeNull();
  });

  it('a 404 (revoked webhook) fails the job as UnrecoverableError — no retries', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('<html>not found</html>', { status: 404 }));
    const { processor } = makeProcessor({
      enabled: true,
      webhookUrl: WEBHOOK_URL,
      build: fullCtx(),
    });

    const err: unknown = await processor.process(job()).catch((e: unknown) => e);

    expect((err as Error).name).toBe('UnrecoverableError');
    // The upstream body is not repeated.
    expect((err as Error).message).not.toContain('not found');
  });

  it('completes silently (no fetch) when the delegation context is gone', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const { processor } = makeProcessor({
      enabled: true,
      webhookUrl: WEBHOOK_URL,
      build: null,
    });

    await expect(processor.process(job())).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('ChatProcessor worker events', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('non-final failure → one WARN line, no alert', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { processor, send } = makeProcessor({ enabled: true, webhookUrl: WEBHOOK_URL, build: null });

    await processor.onFailed(
      job('del-7', { attemptsMade: 2, attempts: 5 }),
      new ChatWebhookError('Chat webhook returned HTTP 503', 503, true),
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      jobId: '42',
      attemptsMade: 2,
      maxAttempts: 5,
      final: false,
      delegationId: 'del-7',
      status: 503,
    });
    expect(error).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('final failure (attempts exhausted) → ERROR line + ops alert', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { processor, send } = makeProcessor({ enabled: true, webhookUrl: WEBHOOK_URL, build: null });

    await processor.onFailed(
      job('del-7', { attemptsMade: 5, attempts: 5 }),
      new ChatWebhookError('Chat webhook returned HTTP 503', 503, true),
    );

    expect(error).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toBeDefined();
  });

  it('UnrecoverableError on the first attempt is final', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { processor, send } = makeProcessor({ enabled: true, webhookUrl: WEBHOOK_URL, build: null });
    const unrecoverable = new Error('Chat webhook returned HTTP 404');
    unrecoverable.name = 'UnrecoverableError';

    await processor.onFailed(job('del-7', { attemptsMade: 1, attempts: 5 }), unrecoverable);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('attaches a queue error listener on init', () => {
    const { processor, queue } = makeProcessor({ enabled: false, build: null });
    processor.onModuleInit();
    expect((queue.on as jest.Mock).mock.calls[0]?.[0]).toBe('error');
  });
});
