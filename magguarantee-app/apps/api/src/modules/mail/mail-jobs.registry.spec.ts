// MailJobsRegistry — one diagnostics row per queued job (logging audit item 23).

import type { RedisService } from '../redis/redis.service';
import { MailJobsRegistry } from './mail-jobs.registry';

function makeRegistry() {
  const store = new Map<string, string>();
  let list: string[] = [];
  const client = {
    setex: jest.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    lrem: jest.fn(async (_key: string, _count: number, id: string) => {
      const before = list.length;
      list = list.filter((x) => x !== id);
      return before - list.length;
    }),
    lpush: jest.fn(async (_key: string, id: string) => {
      list.unshift(id);
      return list.length;
    }),
    ltrim: jest.fn(async () => 'OK'),
    lrange: jest.fn(async () => [...list]),
  };
  const redis = {
    client,
    get: jest.fn(async (key: string) => store.get(key) ?? null),
  } as unknown as RedisService;
  return { registry: new MailJobsRegistry(redis), client, list: () => list };
}

const payload = { to: 'a@b.pl', subject: 'S', template: 'carrier-decision' };

describe('MailJobsRegistry.record', () => {
  it('upserts a job row across attempts: one list entry, latest state + attempt', async () => {
    const h = makeRegistry();

    await h.registry.record({ id: 'job-5', payload, state: 'failed', attemptsMade: 1, failedReason: 'x' });
    await h.registry.record({ id: 'job-5', payload, state: 'failed', attemptsMade: 2, failedReason: 'y' });
    await h.registry.record({ id: 'job-5', payload, state: 'completed', attemptsMade: 3 });

    expect(h.list()).toEqual(['job-5']);
    const rows = await h.registry.listRecent(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'job-5', state: 'completed', attemptsMade: 3, failedReason: null });
  });

  it('without an id every call is a distinct row (sync send / admin resend)', async () => {
    const h = makeRegistry();

    await h.registry.record({ payload, state: 'completed' });
    await h.registry.record({ payload, state: 'completed' });

    expect(h.list()).toHaveLength(2);
    expect(h.client.lrem).not.toHaveBeenCalled();
  });
});
