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

  describe('searchByNip', () => {
    const SEARCH_KEY = `whitelist-search:${NIP}`;

    function fullSubjectUpstream() {
      return {
        result: {
          subject: {
            name: 'Test Carrier Sp. z o.o.',
            nip: NIP,
            statusVat: 'Czynny',
            residenceAddress: 'ul. Testowa 1, 00-001 Warszawa',
            workingAddress: 'ul. Robocza 2, 00-002 Warszawa',
            accountNumbers: [
              '11111111111111111111111111',
              '22222222222222222222222222',
            ],
          },
          requestId: 'req-search-1',
          requestDateTime: '2026-05-15T08:00:00',
        },
      };
    }

    it('returns { found: true, ... } for a populated subject and caches it', async () => {
      const redis = makeRedis();
      const svc = new WhiteListService(
        redis as unknown as import('../../redis/redis.service').RedisService,
      );
      global.fetch = jest.fn(
        async () =>
          new Response(JSON.stringify(fullSubjectUpstream()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ) as unknown as typeof fetch;

      const out = await svc.searchByNip(NIP);

      expect(out.found).toBe(true);
      expect(out.nip).toBe(NIP);
      expect(out.name).toBe('Test Carrier Sp. z o.o.');
      expect(out.address).toBe('ul. Testowa 1, 00-001 Warszawa');
      expect(out.accountNumbers).toEqual([
        '11111111111111111111111111',
        '22222222222222222222222222',
      ]);
      expect(out.statusVat).toBe('Czynny');
      expect(out.requestId).toBe('req-search-1');
      expect(out.requestDateTime).toBe('2026-05-15T08:00:00');
      expect(redis.setex).toHaveBeenCalledWith(
        SEARCH_KEY,
        60 * 60,
        expect.stringContaining('"found":true'),
      );
    });

    it('returns { found: false } when subject is null and does NOT cache', async () => {
      const redis = makeRedis();
      const svc = new WhiteListService(
        redis as unknown as import('../../redis/redis.service').RedisService,
      );
      global.fetch = jest.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                subject: null,
                requestId: 'req-nf-1',
                requestDateTime: '2026-05-15T09:00:00',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ) as unknown as typeof fetch;

      const out = await svc.searchByNip(NIP);

      expect(out.found).toBe(false);
      expect(out.name).toBeNull();
      expect(out.address).toBeNull();
      expect(out.accountNumbers).toEqual([]);
      expect(out.statusVat).toBeNull();
      expect(out.requestId).toBe('req-nf-1');
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('treats upstream 404 as { found: false } (e.g. non-Polish NIP)', async () => {
      const redis = makeRedis();
      const svc = new WhiteListService(
        redis as unknown as import('../../redis/redis.service').RedisService,
      );
      const fetchSpy = jest.fn(
        async () =>
          new Response('NIP not found', {
            status: 404,
          }),
      );
      global.fetch = fetchSpy as unknown as typeof fetch;

      const out = await svc.searchByNip(NIP);

      expect(out.found).toBe(false);
      expect(out.nip).toBe(NIP);
      expect(out.name).toBeNull();
      expect(out.address).toBeNull();
      expect(out.accountNumbers).toEqual([]);
      expect(out.statusVat).toBeNull();
      expect(out.requestId).toBeNull();
      expect(out.requestDateTime).toBeNull();
      expect(redis.setex).not.toHaveBeenCalled();
      // 4xx must not be retried per http-fetch contract.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('cache hit: returns cached payload without calling upstream', async () => {
      const cached = JSON.stringify({
        found: true,
        nip: NIP,
        name: 'Cached Co.',
        address: 'Cached address',
        accountNumbers: ['33333333333333333333333333'],
        statusVat: 'Czynny',
        requestId: 'req-cached',
        requestDateTime: '2026-05-15T07:00:00',
        cachedAt: '2026-05-15T07:00:00.000Z',
      });
      const redis = makeRedis({ [SEARCH_KEY]: cached });
      const svc = new WhiteListService(
        redis as unknown as import('../../redis/redis.service').RedisService,
      );
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const out = await svc.searchByNip(NIP);

      expect(out.found).toBe(true);
      expect(out.name).toBe('Cached Co.');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('cache miss: writes to Redis with a 1h TTL', async () => {
      const redis = makeRedis();
      const svc = new WhiteListService(
        redis as unknown as import('../../redis/redis.service').RedisService,
      );
      global.fetch = jest.fn(
        async () =>
          new Response(JSON.stringify(fullSubjectUpstream()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ) as unknown as typeof fetch;

      await svc.searchByNip(NIP);

      expect(redis.setex).toHaveBeenCalledTimes(1);
      const [key, ttl, payload] = redis.setex.mock.calls[0]!;
      expect(key).toBe(SEARCH_KEY);
      expect(ttl).toBe(60 * 60);
      const parsed = JSON.parse(payload) as { cachedAt: string | null };
      expect(parsed.cachedAt).not.toBeNull();
    });

    it('address mapping: residenceAddress is preferred over workingAddress', async () => {
      const redis = makeRedis();
      const svc = new WhiteListService(
        redis as unknown as import('../../redis/redis.service').RedisService,
      );
      global.fetch = jest.fn(
        async () =>
          new Response(JSON.stringify(fullSubjectUpstream()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ) as unknown as typeof fetch;

      const out = await svc.searchByNip(NIP);

      expect(out.address).toBe('ul. Testowa 1, 00-001 Warszawa');
    });

    it('address mapping: falls back to workingAddress when residenceAddress is absent', async () => {
      const redis = makeRedis();
      const svc = new WhiteListService(
        redis as unknown as import('../../redis/redis.service').RedisService,
      );
      global.fetch = jest.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                subject: {
                  name: 'No-Residence Co.',
                  nip: NIP,
                  statusVat: 'Czynny',
                  workingAddress: 'ul. Robocza 2, 00-002 Warszawa',
                  accountNumbers: [],
                },
                requestId: 'req-2',
                requestDateTime: '2026-05-15T08:30:00',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ) as unknown as typeof fetch;

      const out = await svc.searchByNip(NIP);

      expect(out.address).toBe('ul. Robocza 2, 00-002 Warszawa');
    });

    it('accountNumbers defaults to [] when the upstream array is missing', async () => {
      const redis = makeRedis();
      const svc = new WhiteListService(
        redis as unknown as import('../../redis/redis.service').RedisService,
      );
      global.fetch = jest.fn(
        async () =>
          new Response(
            JSON.stringify({
              result: {
                subject: {
                  name: 'No-Accounts Co.',
                  nip: NIP,
                  statusVat: 'Zwolniony',
                  residenceAddress: 'ul. Test 1',
                  // accountNumbers field intentionally omitted
                },
                requestId: 'req-3',
                requestDateTime: '2026-05-15T08:45:00',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ) as unknown as typeof fetch;

      const out = await svc.searchByNip(NIP);

      expect(out.found).toBe(true);
      expect(out.accountNumbers).toEqual([]);
      expect(out.statusVat).toBe('Zwolniony');
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

      await expect(svc.searchByNip(NIP)).rejects.toThrow(HttpException);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(redis.setex).not.toHaveBeenCalled();
    });
  });
});
