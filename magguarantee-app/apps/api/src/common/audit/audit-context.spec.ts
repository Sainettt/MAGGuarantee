// Unit tests for the AsyncLocalStorage-based AuditContext primitive.

import type { Prisma } from '@magguarantee/database';

import { AuditContext, type AuditContextStore } from './audit-context';

function makeStore(overrides: Partial<AuditContextStore> = {}): AuditContextStore {
  return {
    tx: { __tx: 'sentinel' } as unknown as Prisma.TransactionClient,
    actor: { userId: 'u-1', userRole: 'admin' },
    ipAddress: null,
    ...overrides,
  };
}

describe('AuditContext', () => {
  it('current() returns undefined outside any run() call', () => {
    expect(AuditContext.current()).toBeUndefined();
  });

  it('current() returns the store inside run()', async () => {
    const store = makeStore();
    await AuditContext.run(store, async () => {
      expect(AuditContext.current()).toBe(store);
    });
    expect(AuditContext.current()).toBeUndefined();
  });

  it('run() propagates the store across await boundaries', async () => {
    const store = makeStore();
    await AuditContext.run(store, async () => {
      await Promise.resolve();
      // After an `await`, the AsyncLocalStorage must still resolve to the
      // same store — that's the whole point of using ALS over module-level
      // state.
      expect(AuditContext.current()).toBe(store);
      await Promise.resolve();
      expect(AuditContext.current()?.actor).toEqual(store.actor);
    });
  });

  it('run() nesting: inner store wins, outer restored on exit', async () => {
    const outer = makeStore({ actor: { userId: 'outer', userRole: 'admin' } });
    const inner = makeStore({ actor: { userId: 'inner', userRole: 'pracownik' } });
    await AuditContext.run(outer, async () => {
      expect(AuditContext.current()).toBe(outer);
      await AuditContext.run(inner, async () => {
        expect(AuditContext.current()).toBe(inner);
      });
      expect(AuditContext.current()).toBe(outer);
    });
  });

  it('setBefore() mutates the active store', async () => {
    const store = makeStore();
    expect(store.before).toBeUndefined();
    await AuditContext.run(store, async () => {
      AuditContext.setBefore({ status: 'OLD' });
      expect(AuditContext.current()?.before).toEqual({ status: 'OLD' });
    });
    // outside the run, mutations stayed on the store reference
    expect(store.before).toEqual({ status: 'OLD' });
  });

  it('setBefore() is a silent no-op outside any run()', () => {
    // Must not throw — defensive for callers that do not know whether they
    // are inside an audited request path.
    expect(() => AuditContext.setBefore({ x: 1 })).not.toThrow();
  });

  it('concurrent run()s do not leak stores into each other', async () => {
    // Two simultaneous async chains, each with its own store. Each must see
    // only its own — that's the ALS contract we rely on.
    const a = makeStore({ actor: { userId: 'a', userRole: 'admin' } });
    const b = makeStore({ actor: { userId: 'b', userRole: 'admin' } });

    const runA = AuditContext.run(a, async () => {
      await Promise.resolve();
      const seen = AuditContext.current();
      await Promise.resolve();
      return seen?.actor;
    });
    const runB = AuditContext.run(b, async () => {
      await Promise.resolve();
      const seen = AuditContext.current();
      await Promise.resolve();
      return seen?.actor;
    });
    const [seenA, seenB] = await Promise.all([runA, runB]);
    expect(seenA).toEqual({ userId: 'a', userRole: 'admin' });
    expect(seenB).toEqual({ userId: 'b', userRole: 'admin' });
  });
});
