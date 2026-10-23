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
// `monthly_limits` and answers with a full `ClaimDto` (payout figures
// included), so its role set matters twice over — as a write gate AND as a
// read gate.
//
// Per docs/03-roles.md the section «Верифицировать заявление (изменить статус,
// пересчитать km/доплату)» belongs to `pracownik`; `weryfikator` owns the
// daily-km board + outing statuses and has NO `/claims` access at all. An
// earlier draft of this route listed `weryfikator` — this spec pins the
// corrected pair so the decorator cannot drift back.
//
// Two layers, same pattern as `delegations.controller.spec.ts`:
//   1. the `@Roles(...)` metadata on the handler is exactly the documented set;
//   2. `RolesGuard` really accepts/rejects the right tokens.

import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import { AUDIT_METADATA_KEY } from '../../common/audit/audit.constants';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClaimsController } from './claims.controller';
import { makeAuthUser } from '../../common/testing/make-auth-user';

const reflector = new Reflector();

function handlerOf(
  name: keyof ClaimsController,
): (...args: never[]) => unknown {
  return ClaimsController.prototype[name] as (...args: never[]) => unknown;
}

function rolesFor(name: keyof ClaimsController): Role[] {
  return (
    reflector.get<Role[] | undefined>(ROLES_METADATA_KEY, handlerOf(name)) ?? []
  );
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

function userWith(role: Role): AuthUser {
  return makeAuthUser(role, {
    sub: `u-${role}`,
    login: role,
    email: `${role}@magtrans.eu`,
    name: role,
    mustChangePassword: false,
  });
}

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
  const guard = new RolesGuard(reflector);

  it('carries exactly the documented role set (admin + pracownik)', () => {
    expect(rolesFor(handler).sort()).toEqual(['admin', 'pracownik']);
  });

  it.each<Role>(['admin', 'pracownik'])('%s is allowed', (role) => {
    expect(guard.canActivate(ctxFor(handler, userWith(role)))).toBe(true);
  });

  it.each<Role>(REFUSED)('%s is rejected (403)', (role) => {
    expect(() => guard.canActivate(ctxFor(handler, userWith(role)))).toThrow(
      ForbiddenException,
    );
  });

  it('matches the role set of the other claim-mutating routes', () => {
    // `update` (decision PATCH) and `verify` (checkpoint) are the reference
    // pair; repricing — and previewing the repricing — belong to the same
    // «верификация» bucket.
    expect(rolesFor(handler).sort()).toEqual(rolesFor('update').sort());
    expect(rolesFor(handler).sort()).toEqual(rolesFor('verify').sort());
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
  const guard = new RolesGuard(reflector);

  it('carries exactly the documented role set (admin + pracownik + przewoznik)', () => {
    expect(rolesFor(handler).sort()).toEqual(
      ['admin', 'pracownik', 'przewoznik'].sort(),
    );
  });

  it('does NOT list opiekun (decision 2026-10-22)', () => {
    expect(rolesFor(handler)).not.toContain('opiekun');
  });

  it.each<Role>(READ_ALLOWED)('%s is allowed', (role) => {
    expect(guard.canActivate(ctxFor(handler, userWith(role)))).toBe(true);
  });

  it.each<Role>(READ_REFUSED)('%s is rejected (403)', (role) => {
    expect(() => guard.canActivate(ctxFor(handler, userWith(role)))).toThrow(
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
