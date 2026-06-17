import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../../../config/env.schema';
import type { AuthUser } from '../../../auth/decorators/current-user.decorator';
import { GpsService } from '../gps.service';
import {
  GpsRepository,
  type GpsScope,
} from '../gps.repository';
import type { GpsPosition, GpsProvider, GpsVehicleRef } from '../gps.types';

// ─── Test doubles ────────────────────────────────────────────

interface FakeRedis {
  store: Map<string, string>;
  get: jest.Mock<Promise<string | null>, [string]>;
  setex: jest.Mock<Promise<void>, [string, number, string]>;
  client: { set: jest.Mock<Promise<'OK'>, [string, string]> };
}

function makeRedis(seed: Record<string, string> = {}): FakeRedis {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    store,
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    setex: jest.fn(async (k: string, _ttl: number, v: string) => {
      store.set(k, v);
    }),
    client: {
      set: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
        return 'OK' as const;
      }),
    },
  };
}

function makeConfig(): ConfigService<Env, true> {
  return {
    get: (key: keyof Env) => {
      if (key === 'GPS_CACHE_TTL_SEC') return 300;
      return undefined;
    },
  } as unknown as ConfigService<Env, true>;
}

interface OwnerRow {
  ref: GpsVehicleRef;
  carrierId: string;
  carrierUserId: string;
  opiekunId: string | null;
  plannerId: string | null;
  // Phase 11 — dispatch Team FK (replaces `dispatcherId`).
  dispatchTeamId: string | null;
  active: boolean;
}

function makeRepo(opts: {
  byId?: Record<string, OwnerRow | null>;
  byScope?: (scope: GpsScope) => GpsVehicleRef[];
}): GpsRepository {
  return {
    findOneForGps: jest.fn(async (id: string) => opts.byId?.[id] ?? null),
    findManyForGps: jest.fn(async (scope: GpsScope) =>
      opts.byScope ? opts.byScope(scope) : [],
    ),
  } as unknown as GpsRepository;
}

class StubProvider implements GpsProvider {
  readonly source = 'mock' as const;
  constructor(private readonly fixturesByPlate: Record<string, GpsPosition>) {}
  async getCurrentPositions(
    vehicles: GpsVehicleRef[],
  ): Promise<GpsPosition[]> {
    return vehicles
      .map((v) => this.fixturesByPlate[v.plateNumber])
      .filter((x): x is GpsPosition => Boolean(x));
  }
}

function authUser(
  role: AuthUser['role'],
  sub = 'u-1',
  teamId: string | null = null,
): AuthUser {
  return {
    sub,
    login: 'tester',
    email: 't@example.com',
    name: 'Tester',
    role,
    mustChangePassword: false,
    teamId,
  };
}

function makeFix(overrides: Partial<GpsPosition> = {}): GpsPosition {
  return {
    vehicleId: 'v-1',
    plateNumber: 'WA0001',
    lat: 52.0,
    lng: 21.0,
    speedKmh: 50,
    headingDeg: 90,
    recordedAt: '2026-05-03T12:00:00.000Z',
    fetchedAt: '2026-05-03T12:00:30.000Z',
    ignitionOn: true,
    odometerKm: null,
    source: 'mock',
    ...overrides,
  };
}

const VEHICLE_ID = '11111111-1111-4111-8111-111111111111';

const ownerByRole = {
  // Carrier user "u-self" owns vehicle v-1; opiekun "op-1"; planner "pl-1";
  // Phase 11 — the vehicle is on dispatch team "team-1".
  v1Default: (): OwnerRow => ({
    ref: { id: VEHICLE_ID, plateNumber: 'WA0001' },
    carrierId: 'c-1',
    carrierUserId: 'u-self',
    opiekunId: 'op-1',
    plannerId: 'pl-1',
    dispatchTeamId: 'team-1',
    active: true,
  }),
};

// ─── getOne ──────────────────────────────────────────────────

describe('GpsService.getOne', () => {
  it('404 when vehicle not found / gps disabled', async () => {
    const svc = new GpsService(
      makeRedis() as unknown as import('../../../redis/redis.service').RedisService,
      makeRepo({ byId: { [VEHICLE_ID]: null } }),
      makeConfig(),
      new StubProvider({}),
    );
    await expect(svc.getOne(authUser('admin'), VEHICLE_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns fresh position when cache hot', async () => {
    const fix = makeFix();
    const redis = makeRedis({
      [`gps:position:${VEHICLE_ID}`]: JSON.stringify({
        ...fix,
        vehicleId: VEHICLE_ID,
      }),
    });
    const svc = new GpsService(
      redis as unknown as import('../../../redis/redis.service').RedisService,
      makeRepo({ byId: { [VEHICLE_ID]: ownerByRole.v1Default() } }),
      makeConfig(),
      new StubProvider({}),
    );
    const out = await svc.getOne(authUser('admin'), VEHICLE_ID);
    expect(out.stale).toBe(false);
    expect(out.position?.vehicleId).toBe(VEHICLE_ID);
    expect(out.lastFetchedAt).toBe(fix.fetchedAt);
  });

  it('falls back to last-known with stale=true', async () => {
    const fix = makeFix({ vehicleId: VEHICLE_ID });
    const redis = makeRedis({
      [`gps:lastknown:${VEHICLE_ID}`]: JSON.stringify(fix),
    });
    const svc = new GpsService(
      redis as unknown as import('../../../redis/redis.service').RedisService,
      makeRepo({ byId: { [VEHICLE_ID]: ownerByRole.v1Default() } }),
      makeConfig(),
      new StubProvider({}),
    );
    const out = await svc.getOne(authUser('admin'), VEHICLE_ID);
    expect(out.stale).toBe(true);
    expect(out.position?.vehicleId).toBe(VEHICLE_ID);
    expect(out.lastFetchedAt).toBe(fix.fetchedAt);
  });

  it('cold cache returns position=null, stale=true', async () => {
    const svc = new GpsService(
      makeRedis() as unknown as import('../../../redis/redis.service').RedisService,
      makeRepo({ byId: { [VEHICLE_ID]: ownerByRole.v1Default() } }),
      makeConfig(),
      new StubProvider({}),
    );
    const out = await svc.getOne(authUser('admin'), VEHICLE_ID);
    expect(out.stale).toBe(true);
    expect(out.position).toBeNull();
    expect(out.lastFetchedAt).toBeNull();
  });

  // ── ownership matrix ────────────────────────────────────

  it.each([
    // [role, sub, teamId, allowed]. teamId is only consulted for dyspozytor
    // (Phase 11 — GPS read is team-scoped, not per-user). pracownik intentionally
    // omitted — narrow claims-only role with no GPS visibility (blocked upstream).
    ['admin', 'u-other', null, true],
    ['opiekun', 'op-1', null, true],
    ['opiekun', 'op-9', null, false],
    ['planista', 'pl-1', null, true],
    ['planista', 'pl-9', null, false],
    // Vehicle is on team-1: same team → allowed; other team / no team → 403.
    ['dyspozytor', 'dy-1', 'team-1', true],
    ['dyspozytor', 'dy-1', 'team-9', false],
    ['dyspozytor', 'dy-1', null, false],
    ['przewoznik', 'u-self', null, true],
    ['przewoznik', 'u-other', null, false],
  ] as Array<[AuthUser['role'], string, string | null, boolean]>)(
    '%s/%s (team=%s) allowed=%s',
    async (role, sub, teamId, allowed) => {
      const fix = makeFix({ vehicleId: VEHICLE_ID });
      const redis = makeRedis({
        [`gps:position:${VEHICLE_ID}`]: JSON.stringify(fix),
      });
      const svc = new GpsService(
        redis as unknown as import('../../../redis/redis.service').RedisService,
        makeRepo({ byId: { [VEHICLE_ID]: ownerByRole.v1Default() } }),
        makeConfig(),
        new StubProvider({}),
      );
      const call = svc.getOne(authUser(role, sub, teamId), VEHICLE_ID);
      if (allowed) {
        await expect(call).resolves.toMatchObject({ stale: false });
      } else {
        await expect(call).rejects.toThrow(ForbiddenException);
      }
    },
  );
});

// ─── getMany ─────────────────────────────────────────────────

describe('GpsService.getMany', () => {
  it('aggregates fresh fixes; stale=false when all hot', async () => {
    const v1: GpsVehicleRef = { id: 'a-1', plateNumber: 'WA1' };
    const v2: GpsVehicleRef = { id: 'a-2', plateNumber: 'WA2' };
    const fix1 = makeFix({
      vehicleId: 'a-1',
      plateNumber: 'WA1',
      fetchedAt: '2026-05-03T12:00:30.000Z',
    });
    const fix2 = makeFix({
      vehicleId: 'a-2',
      plateNumber: 'WA2',
      fetchedAt: '2026-05-03T12:00:50.000Z',
    });
    const redis = makeRedis({
      'gps:position:a-1': JSON.stringify(fix1),
      'gps:position:a-2': JSON.stringify(fix2),
    });
    const svc = new GpsService(
      redis as unknown as import('../../../redis/redis.service').RedisService,
      makeRepo({ byScope: () => [v1, v2] }),
      makeConfig(),
      new StubProvider({}),
    );
    const out = await svc.getMany(authUser('admin'));
    expect(out.items).toHaveLength(2);
    expect(out.stale).toBe(false);
    expect(out.lastFetchedAt).toBe('2026-05-03T12:00:50.000Z');
  });

  it('flags stale=true when any item falls back to last-known', async () => {
    const v1: GpsVehicleRef = { id: 'a-1', plateNumber: 'WA1' };
    const v2: GpsVehicleRef = { id: 'a-2', plateNumber: 'WA2' };
    const fix2 = makeFix({
      vehicleId: 'a-2',
      plateNumber: 'WA2',
      fetchedAt: '2026-05-03T12:00:50.000Z',
    });
    const lastKnown1 = makeFix({
      vehicleId: 'a-1',
      plateNumber: 'WA1',
      fetchedAt: '2026-05-03T11:55:00.000Z',
    });
    const redis = makeRedis({
      // a-1: only last-known, no hot key.
      'gps:lastknown:a-1': JSON.stringify(lastKnown1),
      // a-2: hot.
      'gps:position:a-2': JSON.stringify(fix2),
    });
    const svc = new GpsService(
      redis as unknown as import('../../../redis/redis.service').RedisService,
      makeRepo({ byScope: () => [v1, v2] }),
      makeConfig(),
      new StubProvider({}),
    );
    const out = await svc.getMany(authUser('admin'));
    expect(out.items).toHaveLength(2);
    expect(out.stale).toBe(true);
    expect(out.lastFetchedAt).toBe('2026-05-03T12:00:50.000Z');
  });

  it('empty fleet returns empty result', async () => {
    const svc = new GpsService(
      makeRedis() as unknown as import('../../../redis/redis.service').RedisService,
      makeRepo({ byScope: () => [] }),
      makeConfig(),
      new StubProvider({}),
    );
    const out = await svc.getMany(authUser('admin'));
    expect(out).toEqual({ items: [], stale: false, lastFetchedAt: null });
  });

  it.each([
    // [role, sub, teamId, expectedScope]. dyspozytor scopes by TEAM (Phase 11),
    // so its scope carries `teamId`, not `userId`. pracownik intentionally
    // omitted — no GPS scope (blocked upstream by @Roles).
    ['admin', 'u-x', null, { kind: 'all' }],
    ['opiekun', 'op-x', null, { kind: 'opiekun', userId: 'op-x' }],
    ['planista', 'pl-x', null, { kind: 'planista', userId: 'pl-x' }],
    ['dyspozytor', 'dy-x', 'team-x', { kind: 'dyspozytor', teamId: 'team-x' }],
    // Dyspozytor with no team → scope carries teamId: null (repo maps → 0 rows).
    ['dyspozytor', 'dy-x', null, { kind: 'dyspozytor', teamId: null }],
    ['przewoznik', 'pw-x', null, { kind: 'przewoznik', userId: 'pw-x' }],
  ] as Array<[AuthUser['role'], string, string | null, GpsScope]>)(
    'role=%s (team=%s) passes correct scope to repo',
    async (role, sub, teamId, expected) => {
      const captured: GpsScope[] = [];
      const repo = makeRepo({
        byScope: (s) => {
          captured.push(s);
          return [];
        },
      });
      const svc = new GpsService(
        makeRedis() as unknown as import('../../../redis/redis.service').RedisService,
        repo,
        makeConfig(),
        new StubProvider({}),
      );
      await svc.getMany(authUser(role, sub, teamId));
      expect(captured[0]).toEqual(expected);
    },
  );
});

// ─── populateFromProvider ────────────────────────────────────

describe('GpsService.populateFromProvider', () => {
  it('writes both fresh and last-known keys for every fix', async () => {
    const v1: GpsVehicleRef = { id: 'a-1', plateNumber: 'WA1' };
    const fix1 = makeFix({ vehicleId: 'a-1', plateNumber: 'WA1' });
    const redis = makeRedis();
    const svc = new GpsService(
      redis as unknown as import('../../../redis/redis.service').RedisService,
      makeRepo({ byScope: () => [v1] }),
      makeConfig(),
      new StubProvider({ WA1: fix1 }),
    );
    const out = await svc.populateFromProvider({ kind: 'all' });
    expect(out.written).toBe(1);
    expect(redis.setex).toHaveBeenCalledWith(
      'gps:position:a-1',
      300,
      expect.stringContaining('"vehicleId":"a-1"'),
    );
    expect(redis.client.set).toHaveBeenCalledWith(
      'gps:lastknown:a-1',
      expect.stringContaining('"vehicleId":"a-1"'),
    );
  });

  it('returns 0 written for empty fleet without invoking provider', async () => {
    const provider = new StubProvider({});
    const spy = jest.spyOn(provider, 'getCurrentPositions');
    const svc = new GpsService(
      makeRedis() as unknown as import('../../../redis/redis.service').RedisService,
      makeRepo({ byScope: () => [] }),
      makeConfig(),
      provider,
    );
    const out = await svc.populateFromProvider();
    expect(out.written).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
