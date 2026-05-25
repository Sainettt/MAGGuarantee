// Unit tests for the ambient-aware `tx` getter on PrismaService.
//
// We intentionally do NOT spin up a real Prisma client here — the surface we
// care about is the routing logic between `client` and `AuditContext.current().tx`.
// The OnModuleDestroy path is exercised separately and would require a live
// connection to be meaningful.

import type { Prisma } from '@magguarantee/database';

import { AuditContext } from '../../common/audit/audit-context';
import { PrismaService } from './prisma.service';

describe('PrismaService.tx', () => {
  it('falls back to the root client when no AuditContext is active', () => {
    const svc = new PrismaService();
    // No `run(...)` on the stack → tx === client.
    expect(svc.tx).toBe(svc.client);
  });

  it('returns the ambient transaction client when inside AuditContext.run()', async () => {
    const svc = new PrismaService();
    const sentinelTx = { __sentinel: 'tx' } as unknown as Prisma.TransactionClient;
    await AuditContext.run(
      {
        tx: sentinelTx,
        actor: { userId: 'u', userRole: 'admin' },
        ipAddress: null,
      },
      async () => {
        // The getter must reach into the ALS-managed store.
        expect(svc.tx).toBe(sentinelTx);
      },
    );
    // Once the run completes, we're back to the root client.
    expect(svc.tx).toBe(svc.client);
  });

  it('survives nested run() — inner tx wins inside, outer restored on exit', async () => {
    const svc = new PrismaService();
    const outer = { id: 'outer' } as unknown as Prisma.TransactionClient;
    const inner = { id: 'inner' } as unknown as Prisma.TransactionClient;
    await AuditContext.run(
      { tx: outer, actor: { userId: 'u', userRole: 'admin' }, ipAddress: null },
      async () => {
        expect(svc.tx).toBe(outer);
        await AuditContext.run(
          { tx: inner, actor: { userId: 'u', userRole: 'admin' }, ipAddress: null },
          async () => {
            expect(svc.tx).toBe(inner);
          },
        );
        expect(svc.tx).toBe(outer);
      },
    );
  });
});
