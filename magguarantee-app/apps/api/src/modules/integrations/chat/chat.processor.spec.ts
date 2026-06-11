// Unit tests for the in-process chat-notify-wyjazd worker.
//  - no-op (no POST) when the webhook URL is unset.
//  - POSTs the 4-line message when the URL is set (mocked fetch).
//  - throws on POST failure so BullMQ retries.
//  - completes silently when the delegation context is gone.

import type { Job } from 'bullmq';

import type { ChatConfig } from './chat.config';
import type { BuildResult, ChatContextBuilder } from './chat-context.builder';
import { ChatProcessor } from './chat.processor';
import type { ChatWyjazdJobData } from './chat-notifier.service';
import type { WyjazdMessageContext } from './chat-message';

const WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/AAA/messages?key=k';

function fullCtx(): WyjazdMessageContext {
  return {
    departureAt: new Date('2026-03-15T09:30:00.000Z'),
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: new Date('2026-03-20T00:00:00.000Z'),
    returnCountry: 'DE',
    returnPostalCode: '10115',
    planista: 'Anna Planista',
    dyspozytor: 'Bartek Dyspozytor',
    weryfikator: 'Celina Weryfikator',
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
  const processor = new ChatProcessor(config, builder);
  return { processor, buildFn };
}

function job(delegationId = 'del-1'): Job<ChatWyjazdJobData> {
  return { data: { delegationId } } as unknown as Job<ChatWyjazdJobData>;
}

describe('ChatProcessor', () => {
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

  it('POSTs the 4-line message to the webhook when enabled', async () => {
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
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('WYJAZD: 15/03/2026 10:30 / PL / 00-001');
    expect(lines[3]).toBe('OPIEKUN: Damian Opiekun');
  });

  it('throws when the webhook returns a 5xx (BullMQ will retry)', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 503 }));
    const { processor } = makeProcessor({
      enabled: true,
      webhookUrl: WEBHOOK_URL,
      build: fullCtx(),
    });

    // 3 internal attempts each 503 → exhausted → throws. Use fake timers so
    // the exponential backoff sleeps don't slow the test.
    jest.useFakeTimers();
    const promise = processor.process(job());
    const assertion = expect(promise).rejects.toThrow();
    await jest.runAllTimersAsync();
    await assertion;
    jest.useRealTimers();
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
