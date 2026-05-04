import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthUser } from '../../modules/auth/decorators/current-user.decorator';
import type { PrismaService } from '../../modules/prisma/prisma.service';
import { CarrierOwnershipGuard } from './carrier-ownership.guard';
import type { OwnershipMeta } from './ownership.constants';

interface FakePrismaState {
  carriersByUser: Map<string, { id: string }>;
  vehicles: Map<string, { id: string; carrierId: string; deletedAt: Date | null }>;
  drivers: Map<string, { id: string; carrierId: string; deletedAt: Date | null }>;
}

function makePrisma(state: Partial<FakePrismaState> = {}): PrismaService {
  const carriersByUser = state.carriersByUser ?? new Map();
  const vehicles = state.vehicles ?? new Map();
  const drivers = state.drivers ?? new Map();
  return {
    client: {
      carrier: {
        findFirst: async ({
          where,
        }: {
          where: { userId: string; deletedAt: null };
        }) => carriersByUser.get(where.userId) ?? null,
      },
      vehicle: {
        findFirst: async ({
          where,
        }: {
          where: { id: string; deletedAt: null };
        }) => {
          const row = vehicles.get(where.id);
          if (!row || row.deletedAt) return null;
          return row;
        },
      },
      driver: {
        findFirst: async ({
          where,
        }: {
          where: { id: string; deletedAt: null };
        }) => {
          const row = drivers.get(where.id);
          if (!row || row.deletedAt) return null;
          return row;
        },
      },
      trailer: { findFirst: async () => null },
      claim: { findFirst: async () => null },
      delegation: { findFirst: async () => null },
    },
  } as unknown as PrismaService;
}

function makeReflector(meta: OwnershipMeta | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(meta),
  } as unknown as Reflector;
}

function makeCtx(req: {
  user?: Partial<AuthUser> | null;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('CarrierOwnershipGuard', () => {
  it('passes through when no @CarrierOwns metadata is set', async () => {
    const guard = new CarrierOwnershipGuard(makeReflector(undefined), makePrisma());
    const ctx = makeCtx({ user: { sub: 'u', role: 'przewoznik' } });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('passes through for admin', async () => {
    const guard = new CarrierOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'vehicleId' }),
      makePrisma(),
    );
    const ctx = makeCtx({
      user: { sub: 'a-1', role: 'admin' },
      params: { id: 'v-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('passes through for opiekun (governed by OpiekunOwnershipGuard)', async () => {
    const guard = new CarrierOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'vehicleId' }),
      makePrisma(),
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: { id: 'v-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('allows przewoznik who owns the vehicle', async () => {
    const guard = new CarrierOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'vehicleId' }),
      makePrisma({
        carriersByUser: new Map([['u-1', { id: 'c-1' }]]),
        vehicles: new Map([
          ['v-1', { id: 'v-1', carrierId: 'c-1', deletedAt: null }],
        ]),
      }),
    );
    const ctx = makeCtx({
      user: { sub: 'u-1', role: 'przewoznik' },
      params: { id: 'v-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('rejects przewoznik when the vehicle belongs to a different carrier (403)', async () => {
    const guard = new CarrierOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'vehicleId' }),
      makePrisma({
        carriersByUser: new Map([['u-1', { id: 'c-1' }]]),
        vehicles: new Map([
          ['v-1', { id: 'v-1', carrierId: 'c-OTHER', deletedAt: null }],
        ]),
      }),
    );
    const ctx = makeCtx({
      user: { sub: 'u-1', role: 'przewoznik' },
      params: { id: 'v-1' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws 404 when the resource does not exist', async () => {
    const guard = new CarrierOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'vehicleId' }),
      makePrisma({
        carriersByUser: new Map([['u-1', { id: 'c-1' }]]),
      }),
    );
    const ctx = makeCtx({
      user: { sub: 'u-1', role: 'przewoznik' },
      params: { id: 'missing' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws 403 when the carrier user has no carrier profile row', async () => {
    const guard = new CarrierOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'vehicleId' }),
      makePrisma(),
    );
    const ctx = makeCtx({
      user: { sub: 'u-orphan', role: 'przewoznik' },
      params: { id: 'v-1' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws 400 when the configured identifier is missing on the request', async () => {
    const guard = new CarrierOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'vehicleId' }),
      makePrisma({
        carriersByUser: new Map([['u-1', { id: 'c-1' }]]),
      }),
    );
    const ctx = makeCtx({
      user: { sub: 'u-1', role: 'przewoznik' },
      params: {},
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
  });

  it('handles driverId resource kind', async () => {
    const guard = new CarrierOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'driverId' }),
      makePrisma({
        carriersByUser: new Map([['u-1', { id: 'c-1' }]]),
        drivers: new Map([
          ['d-1', { id: 'd-1', carrierId: 'c-1', deletedAt: null }],
        ]),
      }),
    );
    const ctx = makeCtx({
      user: { sub: 'u-1', role: 'przewoznik' },
      params: { id: 'd-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws 403 when req.user is missing', async () => {
    const guard = new CarrierOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'vehicleId' }),
      makePrisma(),
    );
    const ctx = makeCtx({ user: null, params: { id: 'v-1' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
