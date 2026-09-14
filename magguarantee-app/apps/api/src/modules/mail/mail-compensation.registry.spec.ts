// MailCompensationRegistry — producer undo on permanent mail failure
// (2026-08-14 logging audit, item 6).

import { Logger } from '@nestjs/common';

import type { RedisService } from '../redis/redis.service';
import { MailCompensationRegistry } from './mail-compensation.registry';

function makeRegistry() {
  const counters = new Map<string, number>();
  const incr = jest.fn(async (key: string) => {
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return next;
  });
  const expire = jest.fn(async () => 1);
  const redis = { incr, expire } as unknown as RedisService;
  return { registry: new MailCompensationRegistry(redis), incr, expire };
}

describe('MailCompensationRegistry', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs the handler of a single-job compensation immediately', async () => {
    const { registry, incr } = makeRegistry();
    const handler = jest.fn(async () => undefined);
    registry.register('k', handler);

    const res = await registry.onFinalFailure({ kind: 'k', payload: { a: 1 } }, 'j1');

    expect(res).toBe('compensated');
    expect(handler).toHaveBeenCalledWith({ a: 1 });
    expect(incr).not.toHaveBeenCalled();
  });

  it('a batch compensates only when ALL its jobs have failed', async () => {
    const { registry, expire } = makeRegistry();
    const handler = jest.fn(async () => undefined);
    registry.register('k', handler);
    const comp = { kind: 'k', payload: {}, batch: { id: 'b-1', size: 3 } };

    expect(await registry.onFinalFailure(comp, 'j1')).toBe('batch-pending');
    expect(await registry.onFinalFailure(comp, 'j2')).toBe('batch-pending');
    expect(handler).not.toHaveBeenCalled();
    expect(await registry.onFinalFailure(comp, 'j3')).toBe('compensated');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledWith('mail:compensation:batch:b-1', 14 * 24 * 3600);
  });

  it('an unknown kind is reported, not thrown', async () => {
    const { registry } = makeRegistry();

    await expect(
      registry.onFinalFailure({ kind: 'nobody', payload: {} }, 'j1'),
    ).resolves.toBe('no-handler');
  });

  it('a throwing handler is contained', async () => {
    const { registry } = makeRegistry();
    registry.register('k', async () => {
      throw new Error('db down');
    });

    await expect(registry.onFinalFailure({ kind: 'k', payload: {} }, 'j1')).resolves.toBe(
      'handler-failed',
    );
  });
});
