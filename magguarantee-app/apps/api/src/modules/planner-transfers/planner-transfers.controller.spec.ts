// Route-level contract of the planner transfer surface (docs/13, docs/29
// §3.1): who reaches each handler (`@Roles` + `RolesGuard`), which routes the
// opiekun ownership guard scopes, and the audit action of every mutation.
// The resource-level rules (lider of fromPlanner, author, current planista)
// are covered by `planner-transfers.service.spec.ts`.

import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import { AUDIT_METADATA_KEY } from '../../common/audit/audit.constants';
import type { AuditConfig } from '../../common/audit/audit.decorator';
import { OPIEKUN_OWNERSHIP_KEY } from '../../common/guards';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlannerTransfersController } from './planner-transfers.controller';

const reflector = new Reflector();

type Handler = keyof PlannerTransfersController;

function handlerOf(name: Handler): (...args: never[]) => unknown {
  return PlannerTransfersController.prototype[name] as (...args: never[]) => unknown;
}

function meta<T>(key: string, name: Handler): T | undefined {
  return reflector.get<T | undefined>(key, handlerOf(name));
}

function ctxFor(name: Handler, role: Role): ExecutionContext {
  const user: AuthUser = {
    sub: 'u-1',
    login: 'u',
    email: 'u@magtrans.eu',
    name: 'U',
    role,
    mustChangePassword: false,
  };
  return {
    getHandler: () => handlerOf(name),
    getClass: () => PlannerTransfersController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const EXPECTED_ROLES: Record<Handler, Role[]> = {
  // R2 + U1 — the opiekun or the current planista files; an admin never does.
  request: ['opiekun', 'planista'],
  // U11 — the service narrows planista to current / lider of current.
  history: ['admin', 'opiekun', 'planista'],
  list: ['admin', 'opiekun', 'planista'],
  // R3 — admin or a planista-lider; the lider check is resource-level.
  approve: ['admin', 'planista'],
  reject: ['admin', 'planista'],
  // U4 — authors only.
  cancel: ['opiekun', 'planista'],
};

describe('PlannerTransfersController — route contract', () => {
  const guard = new RolesGuard(reflector);

  it.each(Object.entries(EXPECTED_ROLES) as [Handler, Role[]][])(
    '%s is open to exactly %j',
    (name, roles) => {
      expect([...(meta<Role[]>(ROLES_METADATA_KEY, name) ?? [])].sort()).toEqual([...roles].sort());
    },
  );

  it.each(['przewoznik', 'dyspozytor', 'eksport', 'weryfikator', 'pracownik'] as const)(
    '%s is 403 on every route',
    (role) => {
      for (const name of Object.keys(EXPECTED_ROLES) as Handler[]) {
        expect(() => guard.canActivate(ctxFor(name, role))).toThrow(ForbiddenException);
      }
    },
  );

  it('an admin cannot file a request (U1) — RolesGuard 403', () => {
    expect(() => guard.canActivate(ctxFor('request', 'admin'))).toThrow(ForbiddenException);
  });

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
