// Phase 8 — audit-coverage spot-checks (roadmap item 3).
//
// Goal: prove that the MOST CRITICAL mutating endpoints actually emit an audit
// row through the real `@Audit()` → `AuditInterceptor` → `AuditWriter.log()`
// path. Not a re-test of the interceptor mechanics (those live in
// `audit.interceptor.spec.ts`) — this asserts each *named endpoint* carries a
// correct decorator and that decorator produces the expected
// action/targetType/targetKey (+ `before` snapshot / `reason` metadata where
// the flow captures them).
//
// Why this layer and not the existing service specs: the service-level specs
// (`claims.service.update.spec.ts` et al.) open the ambient `AuditContext`
// themselves via a `withAuditContext()` helper. That simulates what the
// interceptor does — so a controller method MISSING its `@Audit()` decorator
// still passes those specs, because the test opens a context the production
// interceptor never would. This harness reads the decorator straight off the
// controller via a real `Reflector` and runs the production interceptor, so a
// missing/incorrect decorator fails here. (It caught exactly that on
// `PATCH /claims/:nrZgl` — see git history / the Phase 8 report.)
//
// No live DB: Prisma `$transaction` + `AuditWriter` are faked by the harness.
//
// Complement: `audit-coverage.inverse.spec.ts` scans EVERY registered route and
// fails on any POST/PUT/PATCH/DELETE without `@Audit()` that is not in its
// reasoned allowlist. This file checks the decorator's CONTENT on the critical
// routes; that one checks that no route is forgotten.

import { CarriersController } from '../../modules/carriers/carriers.controller';
import { ClaimsController } from '../../modules/claims/claims.controller';
import { DelegationsController } from '../../modules/delegations/delegations.controller';
import { MARK_READY_AUDIT_ACTIONS } from '../../modules/delegations/delegations.service';
import { DriversController } from '../../modules/drivers/drivers.controller';
import { LimitsController } from '../../modules/limits/limits.controller';
import { TrailerTypesController } from '../../modules/trailer-types/trailer-types.controller';
import { TrailersController } from '../../modules/trailers/trailers.controller';
import { UsersController } from '../../modules/users/users.controller';
import { AuditContext } from './audit-context';
import {
  readAuditConfig,
  runAuditedHandler,
  type HarnessRequest,
} from './testing/audit-coverage.harness';
import { makeAuthUser } from '../testing/make-auth-user';

// ─── shared fixtures ─────────────────────────────────────────

const ADMIN: HarnessRequest['user'] = makeAuthUser('admin', {
  sub: 'admin-1',
  login: 'admin',
  email: 'admin@magtrans.eu',
  name: 'Admin',
  mustChangePassword: false,
});
const PRACOWNIK: HarnessRequest['user'] = makeAuthUser('pracownik', {
  sub: 'prac-1',
  login: 'prac',
  email: 'prac@magtrans.eu',
  name: 'Pracownik',
  mustChangePassword: false,
});

function req(over: Partial<HarnessRequest>): HarnessRequest {
  return {
    user: ADMIN,
    params: {},
    body: {},
    headers: { 'user-agent': 'jest' },
    ip: '10.0.0.7',
    method: 'POST',
    url: '/api/v1/x',
    ...over,
  };
}

interface AuditConfigShape {
  action: string;
  targetType?: string;
  targetKey?: (r: unknown, result: unknown) => string | undefined;
}

// ─── 1. Decorator presence (catches a wholly-missing @Audit) ───

describe('audit coverage — decorator presence on critical mutating endpoints', () => {
  const cases: Array<{
    name: string;
    controller: new (...args: never[]) => object;
    method: string;
    action: string;
    targetType: string;
  }> = [
    {
      name: 'PATCH /claims/:nrZgl (verification)',
      controller: ClaimsController,
      method: 'update',
      action: 'updateClaim',
      targetType: 'Claim',
    },
    {
      name: 'PATCH /claims/:nrZgl/verification',
      controller: ClaimsController,
      method: 'verify',
      action: 'claim.verify',
      targetType: 'Claim',
    },
    {
      name: 'PUT /limits/:yearMonth',
      controller: LimitsController,
      method: 'upsert',
      action: 'limits.update',
      targetType: 'MonthlyLimit',
    },
    {
      name: 'POST /limits/bulk',
      controller: LimitsController,
      method: 'bulkUpsert',
      action: 'limits.bulkUpdate',
      targetType: 'MonthlyLimit',
    },
    {
      name: 'POST /claims/:nrZgl/recalc-limits',
      controller: ClaimsController,
      method: 'recalcLimits',
      action: 'claim.limitsRefresh',
      targetType: 'Claim',
    },
    {
      name: 'POST /users',
      controller: UsersController,
      method: 'create',
      action: 'createUser',
      targetType: 'User',
    },
    {
      name: 'PATCH /users/:id',
      controller: UsersController,
      method: 'update',
      action: 'updateUser',
      targetType: 'User',
    },
    {
      name: 'DELETE /users/:id',
      controller: UsersController,
      method: 'delete',
      action: 'deleteUser',
      targetType: 'User',
    },
    {
      name: 'DELETE /carriers/:id/hard',
      controller: CarriersController,
      method: 'hardDelete',
      action: 'hardDeleteCarrier',
      targetType: 'Carrier',
    },
    {
      name: 'DELETE /drivers/:id/hard',
      controller: DriversController,
      method: 'hardDelete',
      action: 'hardDeleteDriver',
      targetType: 'Driver',
    },
    {
      name: 'DELETE /trailers/:id/hard',
      controller: TrailersController,
      method: 'hardDelete',
      action: 'hardDeleteTrailer',
      targetType: 'Trailer',
    },
    {
      name: 'DELETE /trailer-types/:id/hard',
      controller: TrailerTypesController,
      method: 'hardDelete',
      action: 'hardDeleteTrailerType',
      targetType: 'TrailerType',
    },
  ];

  it.each(cases)(
    '$name carries @Audit({ action: $action, targetType: $targetType })',
    ({ controller, method, action, targetType }) => {
      const config = readAuditConfig(controller, method) as
        | AuditConfigShape
        | undefined;
      expect(config).toBeDefined();
      expect(config!.action).toBe(action);
      expect(config!.targetType).toBe(targetType);
      // Every critical endpoint resolves a stable target key.
      expect(typeof config!.targetKey).toBe('function');
    },
  );
});

// ─── 2. End-to-end: interceptor writes a row with correct fields ───

describe('audit coverage — interceptor writes a row end-to-end', () => {
  it('PATCH /claims/:nrZgl → updateClaim row, targetKey=nrZgl, before snapshot', async () => {
    // The service stashes a `before` snapshot via AuditContext.setBefore(...)
    // mid-handler; we simulate that exact contribution here so the assertion
    // covers the service's audit responsibility too.
    const out = await runAuditedHandler({
      controller: ClaimsController,
      method: 'update',
      req: req({
        user: PRACOWNIK,
        params: { nrZgl: 'ZGL-2026-04-0007' },
        method: 'PATCH',
        url: '/api/v1/claims/ZGL-2026-04-0007',
      }),
      result: { nrZgl: 'ZGL-2026-04-0007', status: 'ZAAKCEPTOWANO' },
      duringHandler: () =>
        AuditContext.setBefore({ status: 'NA_WERYFIKACJI' }),
    });

    expect(out.entries).toHaveLength(1);
    expect(out.entry!.action).toBe('updateClaim');
    expect(out.entry!.targetType).toBe('Claim');
    expect(out.entry!.targetKey).toBe('ZGL-2026-04-0007');
    expect(out.entry!.actor).toEqual({
      userId: 'prac-1',
      userRole: 'pracownik',
      ipAddress: '10.0.0.7',
    });
    // `before` snapshot survives to the writer, trimmed to after's key-set
    // (`status` is present in both → kept).
    expect(out.entry!.before).toEqual({ status: 'NA_WERYFIKACJI' });
    expect(out.entry!.after).toMatchObject({ status: 'ZAAKCEPTOWANO' });
    // Decision endpoint must commit atomically (ambient transaction).
    expect(out.txOpens).toBe(1);
    expect(out.committed).toBe(true);
  });

  it('PATCH /claims/:nrZgl/verification → claim.verify row, targetKey=nrZgl, before snapshot', async () => {
    const out = await runAuditedHandler({
      controller: ClaimsController,
      method: 'verify',
      req: req({
        user: PRACOWNIK,
        params: { nrZgl: 'ZGL-2026-04-0007' },
        method: 'PATCH',
        url: '/api/v1/claims/ZGL-2026-04-0007/verification',
      }),
      result: { nrZgl: 'ZGL-2026-04-0007', verifiedAt: '2026-05-15T10:00:00.000Z' },
      duringHandler: () => AuditContext.setBefore({ verifiedAt: null }),
    });

    expect(out.entries).toHaveLength(1);
    expect(out.entry!.action).toBe('claim.verify');
    expect(out.entry!.targetType).toBe('Claim');
    expect(out.entry!.targetKey).toBe('ZGL-2026-04-0007');
    expect(out.entry!.before).toEqual({ verifiedAt: null });
    expect(out.entry!.after).toMatchObject({
      verifiedAt: '2026-05-15T10:00:00.000Z',
    });
    // Checkpoint must commit atomically (ambient transaction).
    expect(out.txOpens).toBe(1);
    expect(out.committed).toBe(true);
  });

  it('PUT /limits/:yearMonth → limits.update row, targetKey=yearMonth', async () => {
    const out = await runAuditedHandler({
      controller: LimitsController,
      method: 'upsert',
      req: req({
        params: { yearMonth: '2026-04' },
        method: 'PUT',
        url: '/api/v1/limits/2026-04',
      }),
      result: { year: 2026, month: 4, kmPerDay: 500, ratePerKm: 0.9 },
    });

    expect(out.entry!.action).toBe('limits.update');
    expect(out.entry!.targetType).toBe('MonthlyLimit');
    expect(out.entry!.targetKey).toBe('2026-04');
    expect(out.txOpens).toBe(1);
    expect(out.committed).toBe(true);
  });

  it('POST /limits/bulk → limits.bulkUpdate row, targetKey = `YYYY-MM..MM`', async () => {
    const out = await runAuditedHandler({
      controller: LimitsController,
      method: 'bulkUpsert',
      req: req({
        method: 'POST',
        url: '/api/v1/limits/bulk',
        body: { year: 2026, months: [3, 1, 12], kmPerDay: 0 },
      }),
      // The handler returns an ARRAY of rows — the interceptor keeps the
      // service's `before` object whole in that case (no key-trim).
      result: [{ year: 2026, month: 1, kmPerDay: 0 }],
      duringHandler: () =>
        AuditContext.setBefore({ year: 2026, months: [1, 3, 12], rows: [] }),
    });

    expect(out.entry!.action).toBe('limits.bulkUpdate');
    expect(out.entry!.targetType).toBe('MonthlyLimit');
    // Year + first/last month touched (months are sorted first).
    expect(out.entry!.targetKey).toBe('2026-01..12');
    expect(out.entry!.before).toEqual({
      year: 2026,
      months: [1, 3, 12],
      rows: [],
    });
    // Bulk MUST be atomic — one ambient transaction for N months + audit row.
    expect(out.txOpens).toBe(1);
    expect(out.committed).toBe(true);
  });

  it('POST /claims/:nrZgl/recalc-limits → claim.limitsRefresh row with before/after', async () => {
    const out = await runAuditedHandler({
      controller: ClaimsController,
      method: 'recalcLimits',
      req: req({
        user: ADMIN,
        params: { nrZgl: 'ZGL-2026-04-0007' },
        method: 'POST',
        url: '/api/v1/claims/ZGL-2026-04-0007/recalc-limits',
      }),
      result: { nrZgl: 'ZGL-2026-04-0007', kmGuaranteed: 5_400, paymentEur: 0 },
      duringHandler: () =>
        AuditContext.setBefore({ kmGuaranteed: 10_800, paymentEur: 1_400 }),
    });

    expect(out.entry!.action).toBe('claim.limitsRefresh');
    expect(out.entry!.targetType).toBe('Claim');
    expect(out.entry!.targetKey).toBe('ZGL-2026-04-0007');
    expect(out.entry!.before).toEqual({
      kmGuaranteed: 10_800,
      paymentEur: 1_400,
    });
    expect(out.entry!.after).toMatchObject({ kmGuaranteed: 5_400 });
    expect(out.txOpens).toBe(1);
    expect(out.committed).toBe(true);
  });

  it('POST /users → createUser row, targetKey from result.login', async () => {
    const out = await runAuditedHandler({
      controller: UsersController,
      method: 'create',
      req: req({ url: '/api/v1/users' }),
      result: { id: 'u-1', login: 'jkowalski', temporaryPassword: 'secret123' },
    });

    expect(out.entry!.action).toBe('createUser');
    expect(out.entry!.targetType).toBe('User');
    expect(out.entry!.targetKey).toBe('jkowalski');
    // Sensitive result fields scrubbed in the persisted `after`.
    const after = out.entry!.after as Record<string, unknown>;
    expect(after.login).toBe('jkowalski');
    expect(after.temporaryPassword).not.toBe('secret123');
  });

  it('PATCH /users/:id → updateUser row, targetKey from path param', async () => {
    const out = await runAuditedHandler({
      controller: UsersController,
      method: 'update',
      req: req({
        params: { id: 'user-uuid-7' },
        method: 'PATCH',
        url: '/api/v1/users/user-uuid-7',
      }),
      result: { id: 'user-uuid-7', login: 'jkowalski', active: true },
    });

    expect(out.entry!.action).toBe('updateUser');
    expect(out.entry!.targetType).toBe('User');
    expect(out.entry!.targetKey).toBe('user-uuid-7');
  });

  it('PATCH /users/:id → a per-user permission change (docs/25 B6) lands in updateUser before → after', async () => {
    // Decision Q3: an admin edit (grant, revocation, or the prune a role
    // change forces) is recorded by THIS row — `UserDtoFull` carries both
    // lists — not by a separate `system.pruneUserPermissions` row.
    const out = await runAuditedHandler({
      controller: UsersController,
      method: 'update',
      req: req({
        params: { id: 'user-uuid-8' },
        method: 'PATCH',
        url: '/api/v1/users/user-uuid-8',
        body: { extraPermissions: ['carrier_documents.read', 'carrier_documents.add'] },
      }),
      duringHandler: () =>
        AuditContext.setBefore({ id: 'user-uuid-8', extraPermissions: [], deniedPermissions: [] }),
      result: {
        id: 'user-uuid-8',
        extraPermissions: ['carrier_documents.read', 'carrier_documents.add'],
        deniedPermissions: [],
      },
    });

    expect(out.entries).toHaveLength(1);
    expect(out.entry!.action).toBe('updateUser');
    expect(out.entry!.before).toMatchObject({ extraPermissions: [], deniedPermissions: [] });
    expect(out.entry!.after).toMatchObject({
      extraPermissions: ['carrier_documents.read', 'carrier_documents.add'],
      deniedPermissions: [],
    });
  });

  it('DELETE /users/:id → deleteUser row, void result', async () => {
    const out = await runAuditedHandler({
      controller: UsersController,
      method: 'delete',
      req: req({
        params: { id: 'user-uuid-9' },
        method: 'DELETE',
        url: '/api/v1/users/user-uuid-9',
      }),
      result: undefined,
    });

    expect(out.entry!.action).toBe('deleteUser');
    expect(out.entry!.targetType).toBe('User');
    expect(out.entry!.targetKey).toBe('user-uuid-9');
    expect(out.committed).toBe(true);
  });

  // ─── one route, two intents: runtime action override ───
  // `POST /delegations/:id/ready` is the `zgloszony → gotowy` flip by default
  // and the `gotowy → zgloszony` rollback with `rollback: true`. The service
  // renames the row via `AuditContext.setAction` (2026-08-14 audit, item 22).

  const EKSPORT: HarnessRequest['user'] = makeAuthUser('eksport', {
    sub: 'eks-1',
    login: 'eks',
    email: 'eks@magtrans.eu',
    name: 'Eksport',
    mustChangePassword: false,
  });
  const readyReq = req({
    user: EKSPORT,
    params: { id: 'deleg-uuid-1' },
    url: '/api/v1/delegations/deleg-uuid-1/ready',
  });

  it('POST /delegations/:id/ready (rollback) → delegation.rollbackReady row, diff gotowy → zgloszony', async () => {
    const out = await runAuditedHandler({
      controller: DelegationsController,
      method: 'markReady',
      req: readyReq,
      result: { id: 'deleg-uuid-1', status: 'zgloszony', spedOrderNumber: null },
      // Mirrors `DelegationsService._auditMarkReady` on the rollback branch.
      duringHandler: () => {
        AuditContext.setAction(MARK_READY_AUDIT_ACTIONS.rollback);
        AuditContext.setBefore({ status: 'gotowy', spedOrderNumber: 'SPED-1' });
      },
    });

    expect(out.entries).toHaveLength(1);
    expect(out.entry!.action).toBe('delegation.rollbackReady');
    expect(out.entry!.targetType).toBe('Delegation');
    expect(out.entry!.targetKey).toBe('deleg-uuid-1');
    expect(out.entry!.before).toEqual({ status: 'gotowy', spedOrderNumber: 'SPED-1' });
    expect(out.entry!.after).toMatchObject({ status: 'zgloszony', spedOrderNumber: null });
    expect(out.committed).toBe(true);
  });

  it('POST /delegations/:id/ready (flip) → decorator default delegation.markReady', async () => {
    const out = await runAuditedHandler({
      controller: DelegationsController,
      method: 'markReady',
      req: readyReq,
      result: { id: 'deleg-uuid-1', status: 'gotowy', spedOrderNumber: 'SPED-2' },
      duringHandler: () =>
        AuditContext.setBefore({ status: 'zgloszony', spedOrderNumber: null }),
    });

    expect(out.entries).toHaveLength(1);
    expect(out.entry!.action).toBe(MARK_READY_AUDIT_ACTIONS.ready);
    expect(out.entry!.action).toBe('delegation.markReady');
    expect(out.entry!.before).toEqual({ status: 'zgloszony', spedOrderNumber: null });
  });

  // ─── hard-deletes: before snapshot + reason metadata ───

  const hardDeleteCases: Array<{
    name: string;
    controller: new (...args: never[]) => object;
    action: string;
    targetType: string;
    beforeSnapshot: Record<string, unknown>;
  }> = [
    {
      name: 'carriers',
      controller: CarriersController,
      action: 'hardDeleteCarrier',
      targetType: 'Carrier',
      beforeSnapshot: { id: 'c-1', login: 'pwz1', name: 'Some Carrier' },
    },
    {
      name: 'drivers',
      controller: DriversController,
      action: 'hardDeleteDriver',
      targetType: 'Driver',
      beforeSnapshot: { id: 'd-1', name: 'Jan Kierowca' },
    },
    {
      name: 'trailers',
      controller: TrailersController,
      action: 'hardDeleteTrailer',
      targetType: 'Trailer',
      beforeSnapshot: { id: 't-1', plateNumber: 'WX-TR-99' },
    },
    {
      name: 'trailer-types',
      controller: TrailerTypesController,
      action: 'hardDeleteTrailerType',
      targetType: 'TrailerType',
      beforeSnapshot: { id: 'tt-1', name: 'Plandeka' },
    },
  ];

  it.each(hardDeleteCases)(
    'DELETE /$name/:id/hard → $action row with before snapshot + reason metadata',
    async ({ controller, action, targetType, beforeSnapshot }) => {
      const out = await runAuditedHandler({
        controller,
        method: 'hardDelete',
        req: req({
          params: { id: String(beforeSnapshot.id) },
          method: 'DELETE',
          url: `/api/v1/x/${String(beforeSnapshot.id)}/hard`,
        }),
        result: undefined,
        // Mirror the service: stash the full pre-delete row + the operator's
        // reason before the destructive write.
        duringHandler: () => {
          AuditContext.setBefore(beforeSnapshot);
          AuditContext.setMetadata({ reason: 'duplicate registration' });
        },
      });

      expect(out.entries).toHaveLength(1);
      expect(out.entry!.action).toBe(action);
      expect(out.entry!.targetType).toBe(targetType);
      expect(out.entry!.targetKey).toBe(String(beforeSnapshot.id));
      // `omitResultBody` is NOT set on these routes; with a void result the
      // `after` is undefined, so the full `before` snapshot is preserved.
      expect(out.entry!.before).toEqual(beforeSnapshot);
      // `reason` is the audit-trail's non-optional field for hard-deletes
      // (docs/04-data-model.md) — it must land in metadata.
      expect(out.entry!.metadata).toMatchObject({
        reason: 'duplicate registration',
      });
      expect(out.committed).toBe(true);
    },
  );
});
