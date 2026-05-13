// Unit tests for the Phase-4 in-transaction `AuditWriter`.
//
// Follows the project convention seen in users.service.spec.ts / carriers.
// service.spec.ts: hand-rolled fakes over `jest.fn`, no jest-mock-extended or
// prisma-mock dependency. The PrismaService is faked at the `client.auditLog`
// surface — the only delegate this service touches.

import type { Prisma } from '@magguarantee/database';

import type { PrismaService } from '../prisma/prisma.service';
import { AuditWriter } from './audit.service';
import type { AuditEntryInput } from './audit.types';

// ─── helpers ─────────────────────────────────────────────────

type CreateArgs = { data: Prisma.AuditLogUncheckedCreateInput };

function makePrisma(): {
  prisma: PrismaService;
  createCalls: CreateArgs[];
} {
  const createCalls: CreateArgs[] = [];
  const create = jest.fn(async (args: CreateArgs) => {
    createCalls.push(args);
    return { id: 'audit-row' };
  });
  const prisma = {
    client: { auditLog: { create } },
  } as unknown as PrismaService;
  return { prisma, createCalls };
}

function makeTx(): {
  tx: Prisma.TransactionClient;
  createCalls: CreateArgs[];
} {
  const createCalls: CreateArgs[] = [];
  const create = jest.fn(async (args: CreateArgs) => {
    createCalls.push(args);
    return { id: 'audit-tx-row' };
  });
  const tx = {
    auditLog: { create },
  } as unknown as Prisma.TransactionClient;
  return { tx, createCalls };
}

// ─── tests ───────────────────────────────────────────────────

describe('AuditWriter', () => {
  it('1. log() with explicit actor writes a row with the right columns', async () => {
    const { prisma, createCalls } = makePrisma();
    const svc = new AuditWriter(prisma);

    const input: AuditEntryInput = {
      action: 'updateClaim',
      targetType: 'Claim',
      targetKey: 'ZGL-2026-0001',
      before: { status: 'submitted', kmGwarant: 12_000 },
      after: { status: 'verified', kmGwarant: 12_000 },
      reason: 'verifier approved',
      metadata: { source: 'admin-ui' },
      actor: {
        userId: 'user-uuid-1',
        userRole: 'pracownik',
        ipAddress: '10.0.0.5',
      },
    };

    await svc.log(input);

    expect(createCalls).toHaveLength(1);
    const data = createCalls[0]!.data;
    expect(data.action).toBe('updateClaim');
    expect(data.targetType).toBe('Claim');
    expect(data.targetKey).toBe('ZGL-2026-0001');
    expect(data.userId).toBe('user-uuid-1');
    expect(data.userRole).toBe('pracownik');
    expect(data.ipAddress).toBe('10.0.0.5');
    expect(data.reason).toBe('verifier approved');
    expect(data.before).toEqual({ status: 'submitted', kmGwarant: 12_000 });
    expect(data.after).toEqual({ status: 'verified', kmGwarant: 12_000 });
    expect(data.metadata).toEqual({ source: 'admin-ui' });
  });

  it('2. log() with actor=system and action without "system." prefix throws', async () => {
    const { prisma, createCalls } = makePrisma();
    const svc = new AuditWriter(prisma);

    await expect(
      svc.log({
        action: 'cleanupExpiredTokens',
        actor: 'system',
      }),
    ).rejects.toThrow(/must start with "system\." prefix/);

    expect(createCalls).toHaveLength(0);
  });

  it('3. log() with actor=system and action "system.cleanup" writes a row with null user fields', async () => {
    const { prisma, createCalls } = makePrisma();
    const svc = new AuditWriter(prisma);

    await svc.log({
      action: 'system.cleanup',
      targetType: 'RefreshToken',
      actor: 'system',
    });

    expect(createCalls).toHaveLength(1);
    const data = createCalls[0]!.data;
    expect(data.action).toBe('system.cleanup');
    expect(data.userId).toBeNull();
    expect(data.userRole).toBeNull();
    expect(data.ipAddress).toBeNull();
  });

  it('4. log() with `before` containing undefined values strips them from the JSON', async () => {
    const { prisma, createCalls } = makePrisma();
    const svc = new AuditWriter(prisma);

    await svc.log({
      action: 'updateClaim',
      before: {
        status: 'submitted',
        kmGwarant: 12_000,
        // `undefined` keys disappear after JSON.parse(JSON.stringify(...))
        cancelledAt: undefined,
        nested: {
          ok: true,
          skip: undefined,
        },
      },
      actor: { userId: 'u-1', userRole: 'admin' },
    });

    expect(createCalls).toHaveLength(1);
    const before = createCalls[0]!.data.before as Record<string, unknown>;
    expect(before).toEqual({
      status: 'submitted',
      kmGwarant: 12_000,
      nested: { ok: true },
    });
    expect(Object.prototype.hasOwnProperty.call(before, 'cancelledAt')).toBe(
      false,
    );
  });

  it('5. log() with `tx` parameter writes through the transaction client, not PrismaService', async () => {
    const { prisma, createCalls: prismaCalls } = makePrisma();
    const { tx, createCalls: txCalls } = makeTx();
    const svc = new AuditWriter(prisma);

    await svc.log({
      action: 'verifyClaim',
      targetType: 'Claim',
      targetKey: 'ZGL-2026-0002',
      actor: { userId: 'u-2', userRole: 'pracownik' },
      tx,
    });

    expect(txCalls).toHaveLength(1);
    expect(prismaCalls).toHaveLength(0);
    expect(txCalls[0]!.data.action).toBe('verifyClaim');
    expect(txCalls[0]!.data.targetKey).toBe('ZGL-2026-0002');
  });

  it('6. log() with metadata={} persists an empty object, not null', async () => {
    const { prisma, createCalls } = makePrisma();
    const svc = new AuditWriter(prisma);

    await svc.log({
      action: 'noopProbe',
      metadata: {},
      actor: { userId: 'u-3', userRole: 'admin' },
    });

    expect(createCalls).toHaveLength(1);
    const meta = createCalls[0]!.data.metadata;
    expect(meta).toEqual({});
    // important: an empty object must not be coerced to null/undefined
    expect(meta).not.toBeNull();
    expect(meta).not.toBeUndefined();
  });

  // ─── extra coverage (not in the required 6, but cheap) ───

  it('does not swallow errors from the Prisma create call', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(new Error('DB unreachable'));
    const prisma = {
      client: { auditLog: { create } },
    } as unknown as PrismaService;
    const svc = new AuditWriter(prisma);

    await expect(
      svc.log({
        action: 'updateClaim',
        actor: { userId: 'u-1', userRole: 'admin' },
      }),
    ).rejects.toThrow('DB unreachable');
  });

  it('omits before/after when caller does not pass them (column stays NULL)', async () => {
    const { prisma, createCalls } = makePrisma();
    const svc = new AuditWriter(prisma);

    await svc.log({
      action: 'setLimits',
      actor: { userId: 'u-1', userRole: 'admin' },
    });

    const data = createCalls[0]!.data;
    expect(data.before).toBeUndefined();
    expect(data.after).toBeUndefined();
    expect(data.metadata).toBeUndefined();
    expect(data.reason).toBeNull();
  });
});
