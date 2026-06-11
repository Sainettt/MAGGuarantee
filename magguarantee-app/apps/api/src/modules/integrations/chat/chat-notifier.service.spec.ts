// Unit tests for the chat-notify-wyjazd producer.
//  - enqueues with the stable dedup jobId + the locked retry policy.
//  - swallows enqueue errors (never throws — must not break add()).

import type { Queue } from 'bullmq';

import {
  CHAT_WYJAZD_JOB,
  ChatNotifierService,
  type ChatWyjazdJobData,
} from './chat-notifier.service';

type AddArgs = [
  name: string,
  data: ChatWyjazdJobData,
  opts: Record<string, unknown>,
];

function makeNotifier(addImpl?: (...args: AddArgs) => Promise<unknown>) {
  const add = jest.fn<Promise<unknown>, AddArgs>(
    addImpl ?? (async () => ({ id: 'job-1' })),
  );
  const queue = { add } as unknown as Queue<ChatWyjazdJobData>;
  return { notifier: new ChatNotifierService(queue), add };
}

describe('ChatNotifierService.notifyWyjazd', () => {
  it('enqueues with the stable jobId and locked retry/backoff options', async () => {
    const { notifier, add } = makeNotifier();

    await notifier.notifyWyjazd('del-42');

    expect(add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = add.mock.calls[0]!;
    expect(name).toBe(CHAT_WYJAZD_JOB);
    expect(data).toEqual({ delegationId: 'del-42' });
    expect(opts).toEqual({
      jobId: 'chat-wyjazd-del-42',
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });
  });

  it('never throws when the enqueue fails (must not break add())', async () => {
    const { notifier, add } = makeNotifier(async () => {
      throw new Error('redis down');
    });

    await expect(notifier.notifyWyjazd('del-99')).resolves.toBeUndefined();
    expect(add).toHaveBeenCalledTimes(1);
  });
});
