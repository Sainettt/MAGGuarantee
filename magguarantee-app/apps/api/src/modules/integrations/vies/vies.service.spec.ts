import { HttpException } from '@nestjs/common';

import { ViesService } from './vies.service';

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

describe('ViesService', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('returns cached positive response without calling upstream', async () => {
    const cached = JSON.stringify({
      countryCode: 'PL',
      vatNumber: '1234567890',
      valid: true,
      name: 'Test Sp. z o.o.',
      address: 'Warszawa',
      requestDate: '2026-05-01',
      cachedAt: '2026-05-01T10:00:00.000Z',
    });
    const redis = makeRedis({ 'vies:PL:1234567890': cached });
    const svc = new ViesService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const out = await svc.lookup('pl', '1234567890');

    expect(out.valid).toBe(true);
    expect(out.name).toBe('Test Sp. z o.o.');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('miss → fetch → cache (positive response)', async () => {
    const redis = makeRedis();
    const svc = new ViesService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          isValid: true,
          name: 'Acme',
          address: 'Krakow',
          requestDate: '2026-05-02',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const out = await svc.lookup('PL', '1234567890');
    expect(out.valid).toBe(true);
    expect(out.name).toBe('Acme');
    expect(out.requestDate).toBe('2026-05-02');
    expect(redis.setex).toHaveBeenCalledWith(
      'vies:PL:1234567890',
      24 * 60 * 60,
      expect.stringContaining('"valid":true'),
    );
  });

  it('does NOT cache negative responses', async () => {
    const redis = makeRedis();
    const svc = new ViesService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ isValid: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const out = await svc.lookup('PL', '0000000000');
    expect(out.valid).toBe(false);
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('5xx exhausts retries and throws', async () => {
    const redis = makeRedis();
    const svc = new ViesService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    const fetchSpy = jest
      .fn(async () => new Response('', { status: 502 }))
      .mockName('fetch');
    global.fetch = fetchSpy as unknown as typeof fetch;
    // Speed: kill the backoff sleep so the test doesn't take 3+ seconds.
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((cb: () => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);

    await expect(svc.lookup('PL', '9999999999')).rejects.toThrow(HttpException);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('4xx propagates without retry', async () => {
    const redis = makeRedis();
    const svc = new ViesService(
      redis as unknown as import('../../redis/redis.service').RedisService,
    );
    const fetchSpy = jest.fn(
      async () => new Response('Bad VAT', { status: 400 }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;

    await expect(svc.lookup('PL', '1234567890')).rejects.toThrow(HttpException);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
