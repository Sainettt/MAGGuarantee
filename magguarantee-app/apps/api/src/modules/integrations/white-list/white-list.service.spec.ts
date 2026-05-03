import { HttpException } from '@nestjs/common';

import { WhiteListService } from './white-list.service';

interface FakeRedis {
  get: jest.Mock<Promise<string | null>, [string]>;
  setex: jest.Mock<Promise<void>, [string, number, string]>;
}

function makeRedis(seed: Record<string, string> = {}): FakeRedis {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    setex: jest.fn(async (k: string, _ttl: number, v: string) => {
      store.set(k, v);
    }),
  };
}

const NIP = '1234567890';
const ACCOUNT = '12345678901234567890123456';

describe('WhiteListService', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('returns cached response without calling upstream', async () => {
    const cached = JSON.stringify({
      nip: NIP,
      account: ACCOUNT,
      accountAssigned: true,
      accountAssignedRaw: 'TAK',
      requestId: 'req-1',
      requestDateTime: '2026-05-01T10:00:00',
      cachedAt: '2026-05-01T10:00:00.000Z',
    });
    const redis = makeRedis({ [`whitelist:${NIP}:${ACCOUNT}`]: cached });
    const svc = new WhiteListService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const out = await svc.checkAccount(NIP, ACCOUNT);

    expect(out.accountAssigned).toBe(true);
    expect(out.accountAssignedRaw).toBe('TAK');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('miss → fetch → cache (TAK)', async () => {
    const redis = makeRedis();
    const svc = new WhiteListService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          result: {
            accountAssigned: 'TAK',
            requestId: 'req-1',
            requestDateTime: '2026-05-02T09:00:00',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const out = await svc.checkAccount(NIP, ACCOUNT);
    expect(out.accountAssigned).toBe(true);
    expect(redis.setex).toHaveBeenCalledWith(
      `whitelist:${NIP}:${ACCOUNT}`,
      60 * 60,
      expect.stringContaining('"accountAssigned":true'),
    );
  });

  it('NIE response: not cached, accountAssigned=false', async () => {
    const redis = makeRedis();
    const svc = new WhiteListService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          result: { accountAssigned: 'NIE', requestId: 'req-2' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const out = await svc.checkAccount(NIP, ACCOUNT);
    expect(out.accountAssigned).toBe(false);
    expect(out.accountAssignedRaw).toBe('NIE');
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('5xx exhausts retries and throws', async () => {
    const redis = makeRedis();
    const svc = new WhiteListService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    const fetchSpy = jest.fn(
      async () => new Response('', { status: 503 }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((cb: () => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);

    await expect(svc.checkAccount(NIP, ACCOUNT)).rejects.toThrow(HttpException);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('4xx propagates without retry', async () => {
    const redis = makeRedis();
    const svc = new WhiteListService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    const fetchSpy = jest.fn(
      async () => new Response('Bad NIP', { status: 400 }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(svc.checkAccount(NIP, ACCOUNT)).rejects.toThrow(HttpException);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
