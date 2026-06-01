// Unit tests for the pre-Phase-4.4 AuditInterceptor.
//
// What changed vs. the Wave-2 fire-and-forget design:
//  - The interceptor now opens `prisma.$transaction(...)` and runs the
//    handler under `AuditContext.run(...)`.
//  - The audit row is written through `AuditWriter` BEFORE the transaction
//    commits.
//  - Handler errors, audit-write errors, or anything else thrown inside
//    `$transaction` must roll the whole thing back — including any handler-
//    side mutation. From the outside, mutation + audit-row are atomic.

import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, Observable, of, throwError } from 'rxjs';

import type { Prisma } from '@magguarantee/database';

import type { AuditWriter } from '../../modules/audit/audit.service';
import type { AuditEntryInput } from '../../modules/audit/audit.types';
import type { PrismaService } from '../../modules/prisma/prisma.service';
import { AuditContext } from './audit-context';
import { AUDIT_METADATA_KEY, AUDIT_REDACTED } from './audit.constants';
import type { AuditConfig } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';

// ─── helpers ─────────────────────────────────────────────────

function makeReflector(config: AuditConfig | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(config),
  } as unknown as Reflector;
}

function makeAudit(opts: { throwOnLog?: boolean } = {}): {
  writer: AuditWriter;
  logs: AuditEntryInput[];
} {
  const logs: AuditEntryInput[] = [];
  const writer = {
    log: jest.fn(async (entry: AuditEntryInput) => {
      if (opts.throwOnLog) {
        throw new Error('audit write blew up');
      }
      logs.push(entry);
    }),
  } as unknown as AuditWriter;
  return { writer, logs };
}

interface FakePrisma {
  prisma: PrismaService;
  txCalls: number;
  /** Records each handler invocation order so we can assert call sequence. */
  txClient: Prisma.TransactionClient;
  /** True when the most recent transaction rolled back. */
  rolledBack: boolean;
  /** True when the most recent transaction committed. */
  committed: boolean;
}

function makePrisma(): FakePrisma {
  const state = {
    rolledBack: false,
    committed: false,
    txCalls: 0,
  };
  const txClient = { __tx: 'sentinel' } as unknown as Prisma.TransactionClient;
  const prisma = {
    $transaction: jest.fn(
      async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => {
        state.txCalls += 1;
        try {
          const result = await fn(txClient);
          state.committed = true;
          return result;
        } catch (err) {
          state.rolledBack = true;
          throw err;
        }
      },
    ),
  } as unknown as PrismaService;
  return {
    prisma,
    txClient,
    get txCalls() {
      return state.txCalls;
    },
    get rolledBack() {
      return state.rolledBack;
    },
    get committed() {
      return state.committed;
    },
  };
}

function makeCtx(req: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeNext(stream: Observable<unknown>): CallHandler {
  return { handle: () => stream } as CallHandler;
}

// ─── tests ───────────────────────────────────────────────────

describe('AuditInterceptor (pre-Phase-4.4 ambient-tx variant)', () => {
  it('does nothing when no @Audit metadata is set', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const interceptor = new AuditInterceptor(
      makeReflector(undefined),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({});

    const out = await lastValueFrom(
      interceptor.intercept(ctx, makeNext(of({ ok: true }))),
    );

    expect(out).toEqual({ ok: true });
    expect(logs).toHaveLength(0);
    // Crucially: no transaction was opened. Routes without @Audit must
    // continue to use whatever per-call connection their repos pick.
    expect(fp.txCalls).toBe(0);
  });

  it('happy path: mutation handler + audit row commit together', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = {
      action: 'createCarrier',
      targetType: 'Carrier',
      targetKey: (_req, result) => (result as { id: string }).id,
    };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: {},
      body: {},
      ip: '10.0.0.1',
      url: '/api/v1/carriers',
      method: 'POST',
      headers: { 'user-agent': 'jest' },
    });

    // The "handler" is a fake observable. Inside the transaction it must see
    // the ambient AuditContext.
    let observedTxFromHandler: Prisma.TransactionClient | undefined;
    const handler = new Observable<unknown>((subscriber) => {
      observedTxFromHandler = AuditContext.current()?.tx;
      subscriber.next({ id: 'c-99', login: 'foo' });
      subscriber.complete();
    });

    const out = await lastValueFrom(interceptor.intercept(ctx, makeNext(handler)));

    expect(out).toEqual({ id: 'c-99', login: 'foo' });
    expect(observedTxFromHandler).toBe(fp.txClient);
    expect(fp.txCalls).toBe(1);
    expect(fp.committed).toBe(true);
    expect(fp.rolledBack).toBe(false);

    expect(logs).toHaveLength(1);
    const w = logs[0]!;
    expect(w.action).toBe('createCarrier');
    expect(w.targetType).toBe('Carrier');
    expect(w.targetKey).toBe('c-99');
    expect(w.actor).toEqual({
      userId: 'op-1',
      userRole: 'opiekun',
      ipAddress: '10.0.0.1',
    });
    expect(w.metadata).toEqual({
      method: 'POST',
      route: '/api/v1/carriers',
      userAgent: 'jest',
    });
    expect(w.after).toEqual({ id: 'c-99', login: 'foo' });
    // Same transaction client passed through to the writer.
    expect(w.tx).toBe(fp.txClient);
  });

  it('handler throws → transaction rolls back, no audit row', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = { action: 'fails' };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({ user: { sub: 'u', role: 'admin' }, headers: {} });

    await expect(
      lastValueFrom(
        interceptor.intercept(
          ctx,
          makeNext(throwError(() => new Error('boom'))),
        ),
      ),
    ).rejects.toThrow('boom');

    expect(logs).toHaveLength(0);
    expect(fp.committed).toBe(false);
    expect(fp.rolledBack).toBe(true);
  });

  it('audit write fails → transaction rolls back, mutation undone', async () => {
    const { writer } = makeAudit({ throwOnLog: true });
    const fp = makePrisma();
    const config: AuditConfig = {
      action: 'createCarrier',
      targetKey: (_req, result) => (result as { id: string }).id,
    };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'u', role: 'admin' },
      headers: {},
    });

    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, makeNext(of({ id: 'c-1' }))),
      ),
    ).rejects.toThrow('audit write blew up');

    // Caller sees a 500 — the underlying mutation must NOT have been
    // committed (the rollback is the audit-trail invariant).
    expect(fp.committed).toBe(false);
    expect(fp.rolledBack).toBe(true);
  });

  it('scrubs sensitive fields in the result body before writing', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = {
      action: 'resetPassword',
      targetType: 'User',
      targetKey: (req) => req.params?.id,
    };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'admin-1', role: 'admin' },
      params: { id: 'u-7' },
      headers: {},
    });

    const result = { id: 'u-7', password: 'newpass', tokenHash: 'h' };
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of(result))));

    const after = logs[0]!.after as Record<string, unknown>;
    expect(after.id).toBe('u-7');
    expect(after.password).toBe(AUDIT_REDACTED);
    expect(after.tokenHash).toBe(AUDIT_REDACTED);
  });

  it('omits the result body when omitResultBody=true', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = {
      action: 'deactivateCarrier',
      targetType: 'Carrier',
      targetKey: (req) => req.params?.id,
      omitResultBody: true,
    };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: { id: 'c-1' },
      headers: {},
    });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({ ok: true }))));
    expect(logs[0]?.after).toBeUndefined();
  });

  it('survives a buggy targetKey extractor', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = {
      action: 'noisy',
      targetKey: () => {
        throw new Error('extractor bug');
      },
    };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({ user: { sub: 'u', role: 'admin' }, headers: {} });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({ ok: 1 }))));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.targetKey).toBeUndefined();
  });

  it('reads ip from x-forwarded-for when present', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = { action: 'ping' };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'u', role: 'admin' },
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      ip: '127.0.0.1',
    });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({}))));
    // Actor's ipAddress reflects the X-Forwarded-For first hop.
    expect(logs[0]?.actor).toMatchObject({ ipAddress: '203.0.113.5' });
  });

  it('falls back to req.ip when no x-forwarded-for', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = { action: 'ping' };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'u', role: 'admin' },
      headers: {},
      ip: '127.0.0.1',
    });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({}))));
    expect(logs[0]?.actor).toMatchObject({ ipAddress: '127.0.0.1' });
  });

  it('uses actor="system" when the request is unauthenticated (misconfig safety net)', async () => {
    const { writer } = makeAudit();
    const fp = makePrisma();
    // Action WITHOUT the `system.` prefix → AuditWriter would normally reject
    // such a system-actor write. Use an action that DOES have the prefix so
    // the test asserts only the actor mapping. (Unauthenticated @Audit'd
    // routes are a misconfig, but the writer must not crash here.)
    const config: AuditConfig = { action: 'system.unattributed' };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({ headers: {} });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({}))));
    expect(writer.log).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'system' }),
    );
  });

  it('reads metadata via getAllAndOverride with the audit key', () => {
    const reflector = makeReflector(undefined);
    const { writer } = makeAudit();
    const fp = makePrisma();
    const interceptor = new AuditInterceptor(reflector, writer, fp.prisma);
    const ctx = makeCtx({});
    interceptor.intercept(ctx, makeNext(of({})));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      AUDIT_METADATA_KEY,
      expect.any(Array),
    );
  });

  it('picks up the `before` snapshot stashed by the service via AuditContext.setBefore', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = {
      action: 'updateCarrier',
      targetType: 'Carrier',
      targetKey: (req) => req.params?.id,
    };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: { id: 'c-9' },
      headers: {},
    });

    // Simulate a service that snapshots the row before its update.
    const handler = new Observable<unknown>((subscriber) => {
      AuditContext.setBefore({ name: 'Old Name', active: true });
      subscriber.next({ id: 'c-9', name: 'New Name', active: true });
      subscriber.complete();
    });

    await lastValueFrom(interceptor.intercept(ctx, makeNext(handler)));

    expect(logs).toHaveLength(1);
    // `before` is trimmed to the keys present in `after` (= `id`, `name`,
    // `active`) — same shape as before because all fields of `before` overlap.
    expect(logs[0]!.before).toEqual({ name: 'Old Name', active: true });
    expect(logs[0]!.after).toEqual({
      id: 'c-9',
      name: 'New Name',
      active: true,
    });
  });

  it('trims `before` to the key set of `after` plus id', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = {
      action: 'updateVehicle',
      targetType: 'Vehicle',
      targetKey: (req) => req.params?.id,
    };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: { id: 'v-1' },
      headers: {},
    });

    // Service stashes the FULL row; only plateNumber is in `after`.
    const fullBefore = {
      id: 'v-1',
      plateNumber: 'OLD-1',
      brand: 'Mercedes',
      model: 'Actros',
      year: 2018,
      euro: 'VI',
      sideNumber: 'A-12',
      // ...and 25 more fields
      notes: 'pre-update notes',
    };
    const handler = new Observable<unknown>((subscriber) => {
      AuditContext.setBefore(fullBefore);
      subscriber.next({ id: 'v-1', plateNumber: 'NEW-1' });
      subscriber.complete();
    });

    await lastValueFrom(interceptor.intercept(ctx, makeNext(handler)));

    expect(logs).toHaveLength(1);
    // Only `id` + `plateNumber` survived the trim.
    expect(logs[0]!.before).toEqual({ id: 'v-1', plateNumber: 'OLD-1' });
    expect(logs[0]!.after).toEqual({ id: 'v-1', plateNumber: 'NEW-1' });
  });

  it('keeps full `before` when omitResultBody=true and after is empty', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = {
      action: 'hardDeleteCarrier',
      targetType: 'Carrier',
      targetKey: (req) => req.params?.id,
      omitResultBody: true,
    };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'admin-1', role: 'admin' },
      params: { id: 'c-1' },
      headers: {},
    });

    const before = {
      id: 'c-1',
      login: 'pwz1',
      name: 'Some Carrier',
      nip: '0000000000',
    };
    const handler = new Observable<unknown>((subscriber) => {
      AuditContext.setBefore(before);
      AuditContext.setMetadata({ reason: 'gdpr removal request' });
      subscriber.next(undefined);
      subscriber.complete();
    });

    await lastValueFrom(interceptor.intercept(ctx, makeNext(handler)));

    expect(logs).toHaveLength(1);
    // No after → no trimming, full snapshot preserved.
    expect(logs[0]!.before).toEqual(before);
    expect(logs[0]!.after).toBeUndefined();
  });

  it('merges service-side metadata onto routing metadata', async () => {
    const { writer, logs } = makeAudit();
    const fp = makePrisma();
    const config: AuditConfig = {
      action: 'hardDeleteVehicle',
      targetType: 'Vehicle',
      targetKey: (req) => req.params?.id,
    };
    const interceptor = new AuditInterceptor(
      makeReflector(config),
      writer,
      fp.prisma,
    );
    const ctx = makeCtx({
      user: { sub: 'admin-1', role: 'admin' },
      params: { id: 'v-7' },
      method: 'DELETE',
      url: '/api/v1/vehicles/v-7/hard',
      headers: { 'user-agent': 'jest' },
    });

    const handler = new Observable<unknown>((subscriber) => {
      AuditContext.setMetadata({ reason: 'duplicate registration' });
      subscriber.next(undefined);
      subscriber.complete();
    });

    await lastValueFrom(interceptor.intercept(ctx, makeNext(handler)));

    expect(logs).toHaveLength(1);
    expect(logs[0]!.metadata).toEqual({
      method: 'DELETE',
      route: '/api/v1/vehicles/v-7/hard',
      userAgent: 'jest',
      reason: 'duplicate registration',
    });
  });
});
