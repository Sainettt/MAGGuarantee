// Authorization unit tests for the claims read pair (`GET /claims`,
// `GET /claims/:nrZgl`) and the limits-refresh pair
// (`POST /claims/:nrZgl/recalc-limits` + its dry run
// `GET /claims/:nrZgl/recalc-limits/preview`) — feature «wyłączane limity
// gwarancji», 2026-09-20.
//
// The read pair: opiekun lost all claims access on 2026-10-22 — see the
// `READ_ALLOWED` / `READ_REFUSED` block below.
//
// The limits-refresh endpoint re-prices a wniosek with the CURRENT
// `weekly_limits` and answers with a full `ClaimDto` (payout figures
// included), so its gate matters twice over — as a write gate AND as a read
// gate.
//
// Per docs/03-roles.md the section «Верифицировать заявление (изменить статус,
// пересчитать km/доплату)» belongs to `pracownik`; `weryfikator` owns the
// daily-km board + outing statuses and has NO `/claims` access at all. An
// earlier draft of this route listed `weryfikator` — this spec pins the
// corrected gate so the decorator cannot drift back.
//
// Track B (docs/25 §3 B2): the routes carry `@RequirePermission` instead of
// `@Roles`. Two layers, same pattern as `delegations.controller.spec.ts`:
//   1. the `@RequirePermission(...)` metadata on the handler is exactly the
//      requirement recorded in the generated fixture
//      (`common/authz/__fixtures__/endpoint-permissions.snapshot.json`), and
//      the catalog maps it onto exactly the documented role set;
//   2. `PermissionsGuard` really lets through / refuses users built the way
//      `JwtAccessStrategy` builds them (`makeAuthUser(role)` →
//      `permissionsFor(role, lider)`) — the role matrices below are the ones
//      the former `RolesGuard` spec used, so this still proves WHO gets
//      through, not just which string is written on the handler.

import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  RoleSchema,
  isLiderRole,
  rolesSatisfying,
  type Permission,
  type Role,
} from '@magguarantee/shared';

import { AUDIT_METADATA_KEY } from '../../common/audit/audit.constants';
import { makeAuthUser } from '../../common/testing/make-auth-user';
import { PERMISSIONS_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ClaimsController } from './claims.controller';

const reflector = new Reflector();
const guard = new PermissionsGuard(reflector);
const ALL_ROLES: readonly Role[] = RoleSchema.options;

/**
 * The refused roles that can carry the leader flag (`LIDER_ROLES`, docs/28):
 * the leader extras must not open a claims route either. A lider weryfikator
 * is a user `JwtAccessStrategy` can never build, so it is not modelled.
 */
function liders(roles: readonly Role[]): Role[] {
  return roles.filter((role) => isLiderRole(role));
}

function handlerOf(
  name: keyof ClaimsController,
): (...args: never[]) => unknown {
  return ClaimsController.prototype[name] as (...args: never[]) => unknown;
}

/** The live requirement, resolved like `PermissionsGuard` does (handler, then class). */
function requiredFor(name: keyof ClaimsController): Permission[] {
  return (
    reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_METADATA_KEY,
      [handlerOf(name), ClaimsController],
    ) ?? []
  );
}

/** Who the catalog admits through that requirement (leader rule as in the snapshot). */
function admittedRoles(name: keyof ClaimsController): Role[] {
  return rolesSatisfying(requiredFor(name), { lider: true });
}

function ctxFor(
  name: keyof ClaimsController,
  user: AuthUser | undefined,
): ExecutionContext {
  const handler = handlerOf(name);
  return {
    getHandler: () => handler,
    getClass: () => ClaimsController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

const VERIFY_ALLOWED: Role[] = ['admin', 'pracownik'];
const REFUSED: Role[] = [
  // The corrected gate — `weryfikator` has no `/claims` access whatsoever
  // (docs/03-roles.md), so it must not reprice a wniosek, and must not read
  // the figures through the dry run either.
  'weryfikator',
  'opiekun',
  'przewoznik',
  'planista',
  'dyspozytor',
  'eksport',
];

describe.each<{ label: string; handler: keyof ClaimsController }>([
  { label: 'POST /claims/:nrZgl/recalc-limits', handler: 'recalcLimits' },
  {
    label: 'GET /claims/:nrZgl/recalc-limits/preview',
    handler: 'recalcLimitsPreview',
  },
])('ClaimsController — $label authorization', ({ handler }) => {
  it('requires exactly claims.verify', () => {
    expect(requiredFor(handler)).toEqual(['claims.verify']);
  });

  it('which admits exactly the documented role set (admin + pracownik)', () => {
    expect(admittedRoles(handler).sort()).toEqual([...VERIFY_ALLOWED].sort());
  });

  it('the allowed + refused matrix covers every role', () => {
    expect([...VERIFY_ALLOWED, ...REFUSED].sort()).toEqual([...ALL_ROLES].sort());
  });

  it.each<Role>(VERIFY_ALLOWED)('%s is allowed', (role) => {
    expect(guard.canActivate(ctxFor(handler, makeAuthUser(role)))).toBe(true);
  });

  it.each<Role>(REFUSED)('%s is rejected (403)', (role) => {
    expect(() => guard.canActivate(ctxFor(handler, makeAuthUser(role)))).toThrow(
      ForbiddenException,
    );
  });

  it.each<Role>(liders(REFUSED))('a lider %s is rejected too (403)', (role) => {
    const user = makeAuthUser(role, { lider: true });
    expect(() => guard.canActivate(ctxFor(handler, user))).toThrow(
      ForbiddenException,
    );
  });

  it('matches the requirement of the other claim-mutating routes', () => {
    // `update` (decision PATCH) and `verify` (checkpoint) are the reference
    // pair; repricing — and previewing the repricing — belong to the same
    // «верификация» bucket.
    expect(requiredFor(handler)).toEqual(requiredFor('update'));
    expect(requiredFor(handler)).toEqual(requiredFor('verify'));
  });
});

// `GET /claims` + `GET /claims/:nrZgl` — the read pair. Decision 2026-10-22
// (docs/03-roles.md#opiekun, docs/13-api-design.md claims table): `opiekun`
// lost ALL claims access (it used to read its own carriers' wnioski), so the
// read set is exactly admin + pracownik (all) + przewoznik (own). The service
// re-refuses opiekun as defence-in-depth (`claims.service.list-scope.spec.ts`,
// `claims.service.preview.spec.ts` getOne cases).
const READ_ALLOWED: Role[] = ['admin', 'pracownik', 'przewoznik'];
const READ_REFUSED: Role[] = [
  'opiekun',
  'weryfikator',
  'planista',
  'dyspozytor',
  'eksport',
];

describe.each<{ label: string; handler: keyof ClaimsController }>([
  { label: 'GET /claims', handler: 'list' },
  { label: 'GET /claims/:nrZgl', handler: 'getOne' },
])('ClaimsController — $label read authorization', ({ handler }) => {
  it('requires exactly claims.read', () => {
    expect(requiredFor(handler)).toEqual(['claims.read']);
  });

  it('which admits exactly the documented role set (admin + pracownik + przewoznik)', () => {
    expect(admittedRoles(handler).sort()).toEqual([...READ_ALLOWED].sort());
  });

  it('does NOT admit opiekun, not even a lider opiekun (decision 2026-10-22)', () => {
    expect(admittedRoles(handler)).not.toContain('opiekun');
  });

  it('the allowed + refused matrix covers every role', () => {
    expect([...READ_ALLOWED, ...READ_REFUSED].sort()).toEqual([...ALL_ROLES].sort());
  });

  it.each<Role>(READ_ALLOWED)('%s is allowed', (role) => {
    expect(guard.canActivate(ctxFor(handler, makeAuthUser(role)))).toBe(true);
  });

  it.each<Role>(READ_REFUSED)('%s is rejected (403)', (role) => {
    expect(() => guard.canActivate(ctxFor(handler, makeAuthUser(role)))).toThrow(
      ForbiddenException,
    );
  });

  it.each<Role>(liders(READ_REFUSED))('a lider %s is rejected too (403)', (role) => {
    const user = makeAuthUser(role, { lider: true });
    expect(() => guard.canActivate(ctxFor(handler, user))).toThrow(
      ForbiddenException,
    );
  });
});

describe('ClaimsController — the dry run is a pure read', () => {
  it('GET /recalc-limits/preview carries NO @Audit (nothing is written)', () => {
    // Guarded from the other side by `audit-coverage.inverse.spec.ts`, which
    // only demands `@Audit()` on POST/PUT/PATCH/DELETE. Asserted here too so a
    // future "let's log who peeked" change is a conscious one.
    const meta = reflector.get<unknown>(
      AUDIT_METADATA_KEY,
      ClaimsController.prototype.recalcLimitsPreview,
    );
    expect(meta).toBeUndefined();
  });

  it('POST /recalc-limits DOES carry @Audit (claim.limitsRefresh)', () => {
    const meta = reflector.get<{ action: string } | undefined>(
      AUDIT_METADATA_KEY,
      ClaimsController.prototype.recalcLimits,
    );
    expect(meta?.action).toBe('claim.limitsRefresh');
  });
});
