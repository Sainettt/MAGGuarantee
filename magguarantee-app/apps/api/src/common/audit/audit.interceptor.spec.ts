import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, throwError, lastValueFrom } from 'rxjs';

import { AUDIT_METADATA_KEY, AUDIT_REDACTED } from './audit.constants';
import { AuditInterceptor } from './audit.interceptor';
import type { AuditConfig } from './audit.decorator';
import type { AuditService, AuditWrite } from './audit.service';

function makeReflector(config: AuditConfig | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(config),
  } as unknown as Reflector;
}

function makeAudit(): { svc: AuditService; writes: AuditWrite[] } {
  const writes: AuditWrite[] = [];
  const svc = {
    write: jest.fn(async (w: AuditWrite) => {
      writes.push(w);
    }),
  } as unknown as AuditService;
  return { svc, writes };
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

async function flushMicrotasks(): Promise<void> {
  // The interceptor uses a fire-and-forget Promise inside `tap.next`. After
  // the result observable completes we still need a tick for the void
  // Promise to resolve and call AuditService.write.
  await Promise.resolve();
  await Promise.resolve();
}

describe('AuditInterceptor', () => {
  it('does nothing when no @Audit metadata is set', async () => {
    const { svc, writes } = makeAudit();
    const interceptor = new AuditInterceptor(makeReflector(undefined), svc);
    const ctx = makeCtx({});
    const out = await lastValueFrom(
      interceptor.intercept(ctx, makeNext(of({ ok: true }))),
    );
    expect(out).toEqual({ ok: true });
    await flushMicrotasks();
    expect(writes).toHaveLength(0);
  });

  it('writes an audit row on a successful response', async () => {
    const { svc, writes } = makeAudit();
    const config: AuditConfig = {
      action: 'createCarrier',
      targetType: 'Carrier',
      targetKey: (_req, result) => (result as { id: string }).id,
    };
    const interceptor = new AuditInterceptor(makeReflector(config), svc);
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: {},
      body: {},
      ip: '10.0.0.1',
      url: '/api/v1/carriers',
      method: 'POST',
      headers: { 'user-agent': 'jest' },
    });

    const result = { id: 'c-99', login: 'foo' };
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of(result))));
    await flushMicrotasks();

    expect(writes).toHaveLength(1);
    const w = writes[0]!;
    expect(w.action).toBe('createCarrier');
    expect(w.targetType).toBe('Carrier');
    expect(w.targetKey).toBe('c-99');
    expect(w.userId).toBe('op-1');
    expect(w.userRole).toBe('opiekun');
    expect(w.ipAddress).toBe('10.0.0.1');
    expect(w.metadata).toEqual({
      method: 'POST',
      route: '/api/v1/carriers',
      userAgent: 'jest',
    });
    expect(w.after).toEqual(result);
  });

  it('does NOT write a row when the controller throws', async () => {
    const { svc, writes } = makeAudit();
    const config: AuditConfig = { action: 'fails' };
    const interceptor = new AuditInterceptor(makeReflector(config), svc);
    const ctx = makeCtx({ user: { sub: 'u', role: 'admin' }, headers: {} });
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, makeNext(throwError(() => new Error('boom')))),
      ),
    ).rejects.toThrow('boom');
    await flushMicrotasks();
    expect(writes).toHaveLength(0);
  });

  it('scrubs sensitive fields in the result body before writing', async () => {
    const { svc, writes } = makeAudit();
    const config: AuditConfig = {
      action: 'resetPassword',
      targetType: 'User',
      targetKey: (req) => req.params?.id,
    };
    const interceptor = new AuditInterceptor(makeReflector(config), svc);
    const ctx = makeCtx({
      user: { sub: 'admin-1', role: 'admin' },
      params: { id: 'u-7' },
      headers: {},
    });

    const result = { id: 'u-7', password: 'newpass', tokenHash: 'h' };
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of(result))));
    await flushMicrotasks();

    const after = writes[0]!.after as Record<string, unknown>;
    expect(after.id).toBe('u-7');
    expect(after.password).toBe(AUDIT_REDACTED);
    expect(after.tokenHash).toBe(AUDIT_REDACTED);
  });

  it('omits the result body when omitResultBody=true', async () => {
    const { svc, writes } = makeAudit();
    const config: AuditConfig = {
      action: 'deactivateCarrier',
      targetType: 'Carrier',
      targetKey: (req) => req.params?.id,
      omitResultBody: true,
    };
    const interceptor = new AuditInterceptor(makeReflector(config), svc);
    const ctx = makeCtx({
      user: { sub: 'op-1', role: 'opiekun' },
      params: { id: 'c-1' },
      headers: {},
    });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({ ok: true }))));
    await flushMicrotasks();
    expect(writes[0]?.after).toBeUndefined();
  });

  it('survives a buggy targetKey extractor', async () => {
    const { svc, writes } = makeAudit();
    const config: AuditConfig = {
      action: 'noisy',
      targetKey: () => {
        throw new Error('extractor bug');
      },
    };
    const interceptor = new AuditInterceptor(makeReflector(config), svc);
    const ctx = makeCtx({ user: { sub: 'u', role: 'admin' }, headers: {} });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({ ok: 1 }))));
    await flushMicrotasks();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.targetKey).toBeNull();
  });

  it('reads ip from x-forwarded-for when present', async () => {
    const { svc, writes } = makeAudit();
    const config: AuditConfig = { action: 'ping' };
    const interceptor = new AuditInterceptor(makeReflector(config), svc);
    const ctx = makeCtx({
      user: { sub: 'u', role: 'admin' },
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      ip: '127.0.0.1',
    });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({}))));
    await flushMicrotasks();
    expect(writes[0]?.ipAddress).toBe('203.0.113.5');
  });

  it('falls back to req.ip when no x-forwarded-for', async () => {
    const { svc, writes } = makeAudit();
    const config: AuditConfig = { action: 'ping' };
    const interceptor = new AuditInterceptor(makeReflector(config), svc);
    const ctx = makeCtx({
      user: { sub: 'u', role: 'admin' },
      headers: {},
      ip: '127.0.0.1',
    });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({}))));
    await flushMicrotasks();
    expect(writes[0]?.ipAddress).toBe('127.0.0.1');
  });

  it('uses null userId / userRole when the request is unauthenticated', async () => {
    const { svc, writes } = makeAudit();
    const config: AuditConfig = { action: 'public-thing' };
    const interceptor = new AuditInterceptor(makeReflector(config), svc);
    const ctx = makeCtx({ headers: {} });
    await lastValueFrom(interceptor.intercept(ctx, makeNext(of({}))));
    await flushMicrotasks();
    expect(writes[0]?.userId).toBeNull();
    expect(writes[0]?.userRole).toBeNull();
  });

  it('reads metadata via getAllAndOverride with the audit key', () => {
    const reflector = makeReflector(undefined);
    const interceptor = new AuditInterceptor(reflector, makeAudit().svc);
    const ctx = makeCtx({});
    interceptor.intercept(ctx, makeNext(of({})));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      AUDIT_METADATA_KEY,
      expect.any(Array),
    );
  });
});
