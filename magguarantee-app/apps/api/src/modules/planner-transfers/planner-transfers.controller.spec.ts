// Route-level contract of the planner transfer surface (docs/13, docs/29
// §3.1): who reaches each handler, which routes the opiekun ownership guard
// scopes, and the audit action of every mutation. The resource-level rules
// (lider of fromPlanner, author, current planista) are covered by
// `planner-transfers.service.spec.ts`.
//
// Track B (docs/25 §3 B2): the routes carry `@RequirePermission` instead of
// `@Roles`. Same two layers as `delegations.controller.spec.ts`:
//   1. the `@RequirePermission(...)` metadata on each handler is exactly the
//      requirement recorded in the generated fixture
//      (`common/authz/__fixtures__/endpoint-permissions.snapshot.json`), and
//      the catalog maps it onto the documented role set — counting the leader
//      flag, as the snapshot does (approve / reject: a planista only as lider);
//   2. `PermissionsGuard` lets through / refuses users built the way
//      `JwtAccessStrategy` builds them (`makeAuthUser(role, { lider })`), over
//      the same role matrices the former `RolesGuard` checks used.

import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

import { rolesSatisfying, type Permission, type Role } from '@magguarantee/shared';

import { AUDIT_METADATA_KEY } from '../../common/audit/audit.constants';
import type { AuditConfig } from '../../common/audit/audit.decorator';
import { OPIEKUN_OWNERSHIP_KEY, OpiekunOwnershipGuard } from '../../common/guards';
import { makeAuthUser } from '../../common/testing/make-auth-user';
import { PERMISSIONS_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PlannerTransfersController } from './planner-transfers.controller';

const reflector = new Reflector();

type Handler = keyof PlannerTransfersController;

function handlerOf(name: Handler): (...args: never[]) => unknown {
  return PlannerTransfersController.prototype[name] as (...args: never[]) => unknown;
}

function meta<T>(key: string, name: Handler): T | undefined {
  return reflector.get<T | undefined>(key, handlerOf(name));
}

/** The live requirement, resolved like `PermissionsGuard` does (handler, then class). */
function requiredFor(name: Handler): Permission[] {
  return (
    reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_METADATA_KEY, [
      handlerOf(name),
      PlannerTransfersController,
    ]) ?? []
  );
}

/** Who the catalog admits through that requirement (leader rule as in the snapshot). */
function admittedRoles(name: Handler): Role[] {
  return rolesSatisfying(requiredFor(name), { lider: true });
}

function ctxFor(name: Handler, role: Role, lider = false): ExecutionContext {
  const user: AuthUser = makeAuthUser(role, {
    sub: 'u-1',
    login: 'u',
    email: 'u@magtrans.eu',
    name: 'U',
    mustChangePassword: false,
    ...(lider ? { lider: true } : {}),
  });
  return {
    getHandler: () => handlerOf(name),
    getClass: () => PlannerTransfersController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const EXPECTED_PERMISSIONS: Record<Handler, Permission[]> = {
  request: ['vehicles.planner_transfer.request'],
  history: ['vehicles.planner_history.read'],
  // One route, two inboxes: `scope=mine` (request) / `scope=decide` (decide).
  list: ['vehicles.planner_transfer.request', 'vehicles.planner_transfer.decide'],
  approve: ['vehicles.planner_transfer.decide'],
  reject: ['vehicles.planner_transfer.decide'],
  cancel: ['vehicles.planner_transfer.request'],
};

const EXPECTED_ROLES: Record<Handler, Role[]> = {
  // R2 + U1 (reversed 2026-10-23) — an admin (any vehicle), the opiekun or the
  // current planista files; the service narrows the last two.
  request: ['admin', 'opiekun', 'planista'],
  // U11 — the service narrows planista to current / lider of current.
  history: ['admin', 'opiekun', 'planista'],
  list: ['admin', 'opiekun', 'planista'],
  // R3 — admin or a planista-lider (the planista only through the leader
  // flag); the "lider of THIS fromPlanner" check is resource-level.
  approve: ['admin', 'planista'],
  reject: ['admin', 'planista'],
  // U4 — authors only; every role that files may be one.
  cancel: ['admin', 'opiekun', 'planista'],
};

describe('PlannerTransfersController — route contract', () => {
  const guard = new PermissionsGuard(reflector);

  it.each(Object.entries(EXPECTED_PERMISSIONS) as [Handler, Permission[]][])(
    '%s requires exactly %j',
    (name, permissions) => {
      expect([...requiredFor(name)].sort()).toEqual([...permissions].sort());
    },
  );

  it.each(Object.entries(EXPECTED_ROLES) as [Handler, Role[]][])(
    '%s is open to exactly %j',
    (name, roles) => {
      expect([...admittedRoles(name)].sort()).toEqual([...roles].sort());
    },
  );

  it('no gate on the class: every route states its own requirement', () => {
    expect(reflector.get(PERMISSIONS_METADATA_KEY, PlannerTransfersController)).toBeUndefined();
  });

  it('the class mounts only the opiekun ownership guard (authorization is global)', () => {
    expect(reflector.get(GUARDS_METADATA, PlannerTransfersController)).toEqual([
      OpiekunOwnershipGuard,
    ]);
  });

  it.each(['przewoznik', 'dyspozytor', 'eksport', 'weryfikator', 'pracownik'] as const)(
    '%s is 403 on every route',
    (role) => {
      for (const name of Object.keys(EXPECTED_ROLES) as Handler[]) {
        expect(() => guard.canActivate(ctxFor(name, role))).toThrow(ForbiddenException);
      }
    },
  );

  it('an admin reaches request and cancel (U1 reversed 2026-10-23) — PermissionsGuard lets him through', () => {
    for (const name of ['request', 'cancel'] as const) {
      expect(guard.canActivate(ctxFor(name, 'admin'))).toBe(true);
    }
  });

  it('an admin reaches every route', () => {
    for (const name of Object.keys(EXPECTED_ROLES) as Handler[]) {
      expect(guard.canActivate(ctxFor(name, 'admin'))).toBe(true);
    }
  });

  it('an opiekun reaches request, history, list and cancel, never approve or reject', () => {
    for (const name of ['request', 'history', 'list', 'cancel'] as const) {
      expect(guard.canActivate(ctxFor(name, 'opiekun'))).toBe(true);
    }
    for (const name of ['approve', 'reject'] as const) {
      expect(() => guard.canActivate(ctxFor(name, 'opiekun'))).toThrow(ForbiddenException);
    }
  });

  it('a planista-lider reaches every route, approve and reject included', () => {
    for (const name of Object.keys(EXPECTED_ROLES) as Handler[]) {
      expect(guard.canActivate(ctxFor(name, 'planista', true))).toBe(true);
    }
  });

  it('a planista without the leader flag files, reads and cancels; approve and reject stop at the guard', () => {
    for (const name of ['request', 'history', 'list', 'cancel'] as const) {
      expect(guard.canActivate(ctxFor(name, 'planista'))).toBe(true);
    }
    // `vehicles.planner_transfer.decide` comes with `LIDER_PERMISSIONS.planista`
    // only. Under `@Roles('admin','planista')` this user reached the handler and
    // got 403 PLANNER_TRANSFER_NOT_DECIDER from the service; now the guard 403s.
    for (const name of ['approve', 'reject'] as const) {
      expect(() => guard.canActivate(ctxFor(name, 'planista'))).toThrow(ForbiddenException);
    }
  });

  it.each(['dyspozytor', 'opiekun', 'pracownik', 'eksport'] as const)(
    'the leader flag opens no extra route for a lider %s',
    (role) => {
      for (const name of Object.keys(EXPECTED_ROLES) as Handler[]) {
        const call = (): boolean => guard.canActivate(ctxFor(name, role, true));
        if (EXPECTED_ROLES[name].includes(role)) expect(call()).toBe(true);
        else expect(call).toThrow(ForbiddenException);
      }
    },
  );

  it('an opiekun is scoped to vehicles of his carriers on the two vehicle routes', () => {
    for (const name of ['request', 'history'] as const) {
      expect(meta(OPIEKUN_OWNERSHIP_KEY, name)).toEqual({
        source: 'param',
        name: 'id',
        as: 'vehicleId',
      });
    }
  });

  it.each([
    ['request', 'plannerTransfer.request'],
    ['approve', 'plannerTransfer.approve'],
    ['reject', 'plannerTransfer.reject'],
    ['cancel', 'plannerTransfer.cancel'],
  ] as const)('%s is audited as %s, inside the interceptor transaction', (name, action) => {
    const cfg = meta<AuditConfig>(AUDIT_METADATA_KEY, name);
    expect(cfg?.action).toBe(action);
    expect(cfg?.targetType).toBe('VehiclePlannerTransfer');
    // The approval's SELECT … FOR UPDATE needs the ambient transaction.
    expect(cfg?.manualTransaction).toBeUndefined();
  });

  it('the reads are not audited', () => {
    expect(meta(AUDIT_METADATA_KEY, 'list')).toBeUndefined();
    expect(meta(AUDIT_METADATA_KEY, 'history')).toBeUndefined();
  });
});
