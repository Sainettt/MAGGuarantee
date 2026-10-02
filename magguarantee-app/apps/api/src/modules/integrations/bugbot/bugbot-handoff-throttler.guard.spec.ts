// Per-USER throttle of the BugBot handoff (docs/13-api-design.md#rate-limiting).
//
// The point of this guard is the bucket key: the user id, never the IP — the
// office shares one NAT address. These tests drive the real guard against the
// real in-memory ThrottlerStorageService, no HTTP stack.

import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';

import { BugbotHandoffThrottlerGuard } from './bugbot-handoff-throttler.guard';
import {
  BUGBOT_HANDOFF_RATE_LIMIT,
  BUGBOT_HANDOFF_THROTTLER_NAME,
} from './bugbot-handoff.constants';
import { BugbotHandoffController } from './bugbot-handoff.controller';

const { limit: LIMIT, ttl: TTL } = BUGBOT_HANDOFF_RATE_LIMIT;

interface FakeResponse {
  header: jest.Mock;
}

function contextFor(req: Record<string, unknown>, res: FakeResponse = { header: jest.fn() }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getClass: () => BugbotHandoffController,
    getHandler: () => BugbotHandoffController.prototype.createHandoff,
  } as unknown as ExecutionContext;
}

/** A request from user `sub` arriving from `ip`. */
function request(sub: string, ip: string): ExecutionContext {
  return contextFor({ ip, headers: {}, user: { sub, role: 'przewoznik' } });
}

describe('BugbotHandoffThrottlerGuard', () => {
  let storage: ThrottlerStorageService;
  let guard: BugbotHandoffThrottlerGuard;

  beforeEach(async () => {
    storage = new ThrottlerStorageService();
    // Module-wide options far above the per-user limit: if the guard read them
    // instead of its own constant, the "blocks at the limit" test would fail.
    guard = new BugbotHandoffThrottlerGuard(
      [{ ttl: 60_000, limit: LIMIT * 100 }],
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
  });

  afterEach(() => {
    // Clears the per-hit expiry timers so jest can exit.
    storage.onApplicationShutdown();
  });

  it('keys the bucket on the user id: same user from two IPs → one key, two users from one IP → two keys', async () => {
    const increment = jest.spyOn(storage, 'increment');

    await guard.canActivate(request('user-a', '10.0.0.1'));
    await guard.canActivate(request('user-a', '10.0.0.2'));
    await guard.canActivate(request('user-b', '10.0.0.1'));

    const keys = increment.mock.calls.map(([key]) => key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    // Own throttler name and limit / ttl — never the module defaults.
    for (const call of increment.mock.calls) {
      expect(call.slice(1)).toEqual([TTL, LIMIT, TTL, BUGBOT_HANDOFF_THROTTLER_NAME]);
    }
  });

  it(`lets a user through ${LIMIT} times a minute, then 429 — also from a new IP`, async () => {
    for (let i = 0; i < LIMIT; i++) {
      expect(await guard.canActivate(request('user-a', `10.0.${i % 250}.1`))).toBe(true);
    }

    await expect(guard.canActivate(request('user-a', '192.168.1.1'))).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('does not block a colleague behind the same NAT address', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await guard.canActivate(request('user-a', '10.0.0.1'));
    }
    await expect(guard.canActivate(request('user-a', '10.0.0.1'))).rejects.toBeInstanceOf(
      ThrottlerException,
    );

    expect(await guard.canActivate(request('user-b', '10.0.0.1'))).toBe(true);
  });

  it('reports its own limit in a suffixed header, leaving X-RateLimit-Limit to the global guard', async () => {
    const res: FakeResponse = { header: jest.fn() };

    await guard.canActivate(contextFor({ ip: '10.0.0.1', headers: {}, user: { sub: 'user-a' } }, res));

    expect(res.header).toHaveBeenCalledWith(`X-RateLimit-Limit-${BUGBOT_HANDOFF_THROTTLER_NAME}`, LIMIT);
    expect(res.header).not.toHaveBeenCalledWith('X-RateLimit-Limit', expect.anything());
  });

  it('refuses with 401 instead of falling back to an IP bucket when there is no user', async () => {
    const increment = jest.spyOn(storage, 'increment');

    await expect(guard.canActivate(contextFor({ ip: '10.0.0.1', headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(increment).not.toHaveBeenCalled();
  });
});
