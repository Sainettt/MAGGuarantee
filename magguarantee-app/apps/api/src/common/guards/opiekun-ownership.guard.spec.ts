import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthUser } from '../../modules/auth/decorators/current-user.decorator';
import type { PrismaService } from '../../modules/prisma/prisma.service';
import { OpiekunOwnershipGuard } from './opiekun-ownership.guard';
import type { OwnershipMeta } from './ownership.constants';

interface FakePrismaState {
  carriers: Map<string, { id: string; opiekunId: string | null; deletedAt: Date | null }>;
  vehicles: Map<string, { id: string; carrierId: string; deletedAt: Date | null }>;
}

function makePrisma(state: Partial<FakePrismaState> = {}): PrismaService {
  const carriers = state.carriers ?? new Map();
  const vehicles = state.vehicles ?? new Map();
  return {
    client: {
      carrier: {
        findFirst: async ({
          where,
          select: _select,
        }: {
          where: { id: string; deletedAt: null };
          select?: unknown;
        }) => {
          const row = carriers.get(where.id);
          if (!row || row.deletedAt) return null;
          return row;
        },
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
      driver: { findFirst: async () => null },
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

describe('OpiekunOwnershipGuard', () => {
  it('passes through when no @OpiekunOwns metadata is set', async () => {
    const guard = new OpiekunOwnershipGuard(makeReflector(undefined), makePrisma());
    const ctx = makeCtx({ user: { sub: 'u', role: 'opiekun' } });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('passes through for admin (global access)', async () => {
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'carrierId' }),
      makePrisma(),
    );
    const ctx = makeCtx({
      user: { sub: 'admin-1', role: 'admin' },
      params: { id: 'c-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('passes through for pracownik (global access)', async () => {
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'carrierId' }),
      makePrisma(),
    );
    const ctx = makeCtx({
      user: { sub: 'p-1', role: 'pracownik' },
      params: { id: 'c-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('passes through for przewoznik (governed by other guards)', async () => {
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'carrierId' }),
      makePrisma(),
    );
    const ctx = makeCtx({
      user: { sub: 'pw-1', role: 'przewoznik' },
      params: { id: 'c-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('allows opiekun who owns the carrier', async () => {
    const carriers = new Map([
      ['c-1', { id: 'c-1', opiekunId: 'op-1', deletedAt: null }],
    ]);
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'carrierId' }),
      makePrisma({ carriers }),
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: { id: 'c-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('rejects opiekun who does NOT own the carrier (403)', async () => {
    const carriers = new Map([
      ['c-1', { id: 'c-1', opiekunId: 'op-2', deletedAt: null }],
    ]);
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'carrierId' }),
      makePrisma({ carriers }),
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: { id: 'c-1' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws 404 when the carrier does not exist', async () => {
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'carrierId' }),
      makePrisma(),
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: { id: 'missing' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });

  it('throws 400 when the request lacks the configured identifier', async () => {
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'carrierId' }),
      makePrisma(),
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: {},
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
  });

  it('resolves vehicleId → carrierId before checking ownership', async () => {
    const vehicles = new Map([
      ['v-1', { id: 'v-1', carrierId: 'c-1', deletedAt: null }],
    ]);
    const carriers = new Map([
      ['c-1', { id: 'c-1', opiekunId: 'op-1', deletedAt: null }],
    ]);
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'vehicleId' }),
      makePrisma({ carriers, vehicles }),
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: { id: 'v-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('reads the identifier from the body when source=body', async () => {
    const carriers = new Map([
      ['c-1', { id: 'c-1', opiekunId: 'op-1', deletedAt: null }],
    ]);
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'body', name: 'carrierId', as: 'carrierId' }),
      makePrisma({ carriers }),
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      body: { carrierId: 'c-1' },
    });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws 403 when req.user is missing', async () => {
    const guard = new OpiekunOwnershipGuard(
      makeReflector({ source: 'param', name: 'id', as: 'carrierId' }),
      makePrisma(),
    );
    const ctx = makeCtx({ user: null, params: { id: 'c-1' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
