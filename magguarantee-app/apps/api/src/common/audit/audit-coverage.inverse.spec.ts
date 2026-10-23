// Inverse audit-coverage test (2026-08-14 logging/audit-trail audit, item 18).
//
// `audit-coverage.spec.ts` proves that a HAND-PICKED list of critical routes
// carries a correct `@Audit()`. It cannot notice a NEW mutating route that
// nobody added to that list. This spec inverts the direction: it discovers
// every controller actually registered in `AppModule` (Nest's own
// `DependenciesScanner`, no providers instantiated — see
// `common/testing/route-discovery.ts`) and requires every POST / PUT / PATCH / DELETE
// handler to either
//   - carry `@Audit()` metadata (resolved exactly like `AuditInterceptor`:
//     handler first, then class), or
//   - be listed in `UNAUDITED_MUTATING_ROUTES` below with a reason.
// `@Audit({ manualTransaction: true })` routes carry the decorator, so they
// pass like any other.
//
// The allowlist is kept honest in both directions: an entry whose route no
// longer exists, is no longer mutating, or has since gained `@Audit()` fails
// the suite, so it cannot rot into a blanket exemption.
//
// Adding a mutating route? Decorate it with `@Audit(...)`. Only if the route
// genuinely mutates nothing auditable (a read-only POST, a Redis cache) or is
// audited from its service (a `@Public()` route — `@Audit` there is a 500, see
// `auth.controller.audit.spec.ts`) add it below, with the reason.

// `AppModule` evaluates `ConfigModule.forRoot({ validate: validateEnv })` at
// import time; the unit-test CI job has no `.env`, so the real validator would
// reject. Only the module graph matters here — pass the raw env through.
jest.mock('../../config/env.schema', () => ({
  ...jest.requireActual<object>('../../config/env.schema'),
  validateEnv: (raw: Record<string, unknown>): Record<string, unknown> => raw,
}));

import { join } from 'node:path';

import type { Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AppModule } from '../../app.module';
import { IS_PUBLIC_KEY } from '../../modules/auth/auth.constants';
import {
  controllersOnDisk,
  discoverControllers,
  isMutating,
  listRoutes,
  type DiscoveredRoute,
} from '../testing/route-discovery';

/**
 * Mutating routes that intentionally have NO `@Audit()` decorator.
 * Key: `METHOD /path` without the `api/v1` prefix. Value: why.
 */
const UNAUDITED_MUTATING_ROUTES: Readonly<Record<string, string>> = {
  // ── @Public auth routes: no req.user, so the interceptor's `system` actor
  //    would make AuditWriter throw (500). They audit from AuthService, where
  //    the person is known (auth.controller.audit.spec.ts guards this).
  'POST /auth/login':
    '@Public. Password step only issues a 2FA challenge; AuthService audits lockAccount on lockout, refusals go to the auth security log. The sign-in row (passwordLogin) is written at /auth/verify-code.',
  'POST /auth/verify-code':
    '@Public. AuthService audits passwordLogin, lockTwoFactorSession and system.rejectOrphanedVerificationCode.',
  'POST /auth/google':
    '@Public. AuthService audits googleLogin; DirectoryService audits provisioning/linking and system.* refusals.',
  'POST /auth/resend-code':
    '@Public. Re-sends the pending 2FA code (Redis + mail queue only, no DB change); opaque response by design (anti-enumeration).',
  'POST /auth/forgot-password':
    '@Public. Issues a reset code in Redis + enqueues mail, no DB change; opaque for unknown logins. The actual change is audited as resetPassword.',
  'POST /auth/reset-password':
    '@Public. AuthService audits resetPassword and lockPasswordResetSession.',
  'POST /auth/resend-reset-code':
    '@Public. Re-sends the pending reset code (Redis + mail queue only, no DB change).',
  'POST /auth/refresh':
    '@Public (JwtRefreshGuard). Routine token rotation is session plumbing, not an operator action; AuthService audits detectRefreshTokenReuse.',
  'POST /auth/logout':
    'Audited from AuthService (logout), best-effort AFTER revoking, so a failed audit write can never keep the session alive or the cookies set.',

  // ── Read-only POSTs: nothing persisted.
  'POST /claims/preview':
    'Read-only km-calc preview for the new-claim form (ClaimsService.previewKmCalc persists nothing).',
  'POST /claims/:nrZgl/preview':
    'Read-only km-calc preview for an existing claim (ClaimsService.previewForExisting persists nothing).',
  'POST /integrations/vies/check':
    'Read-only VIES lookup; POST only so the VAT number stays out of URLs/logs.',
  'POST /integrations/whitelist/check':
    'Read-only Biała Lista lookup; POST only so NIP/account stay out of URLs/logs.',
  'POST /integrations/whitelist/search':
    'Read-only Biała Lista lookup; POST only so the NIP stays out of URLs/logs.',
  'POST /integrations/gps/refresh':
    'Admin re-fill of the GPS position cache — writes Redis only, no DB row changes.',
};

const reflector = new Reflector();

function describeRoute(r: DiscoveredRoute): string {
  return `${r.key} (${r.controller}.${r.handler})`;
}

describe('audit coverage (inverse) — every mutating route is audited or allowlisted', () => {
  let controllers: Array<Type<unknown>>;
  let routes: DiscoveredRoute[];
  let mutating: DiscoveredRoute[];

  beforeAll(async () => {
    controllers = await discoverControllers(AppModule);
    routes = listRoutes(controllers);
    mutating = routes.filter((r) => isMutating(r.verb));
  });

  // ── discovery sanity: a broken scan must not pass vacuously ──

  it('discovers every @Controller class that exists under src/', () => {
    const registered = new Set(controllers);
    const missing = controllersOnDisk(join(__dirname, '..', '..'))
      .filter((c) => !registered.has(c))
      .map((c) => c.name);
    // A controller on disk that no module registers would not be served —
    // but more likely it means the scan missed a branch of the graph.
    expect(missing).toEqual([]);
    expect(controllers.length).toBeGreaterThanOrEqual(20);
  });

  it('finds known audited and allowlisted routes (sanity check on route extraction)', () => {
    const keys = new Set(routes.map((r) => r.key));
    for (const key of [
      'POST /claims',
      'PATCH /claims/:nrZgl',
      'DELETE /carriers/:id/hard',
      'PUT /limits/:yearMonth',
      'POST /auth/logout',
      'GET /health',
    ]) {
      expect(keys).toContain(key);
    }
    expect(mutating.length).toBeGreaterThan(50);
  });

  it('no two handlers resolve to the same METHOD /path', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const r of routes) {
      const prev = seen.get(r.key);
      if (prev) dupes.push(`${r.key}: ${prev} vs ${r.controller}.${r.handler}`);
      else seen.set(r.key, `${r.controller}.${r.handler}`);
    }
    expect(dupes).toEqual([]);
  });

  // ── the actual contract ──

  it('every POST/PUT/PATCH/DELETE handler has @Audit() or an allowlist entry', () => {
    const uncovered = mutating
      .filter((r) => !r.audit && !(r.key in UNAUDITED_MUTATING_ROUTES))
      .map(describeRoute);
    // Fix: add `@Audit({ action, targetType, targetKey })` to the handler, or —
    // only for a genuine exception — an entry with a reason above.
    expect(uncovered).toEqual([]);
  });

  it('every @Audit() on a mutating route names a non-empty action', () => {
    const bad = mutating
      .filter((r) => r.audit && !(typeof r.audit.action === 'string' && r.audit.action.trim()))
      .map(describeRoute);
    expect(bad).toEqual([]);
  });

  it('no @Public() route anywhere carries @Audit() (interceptor would 500 on the system actor)', () => {
    const bad = routes
      .filter((r) => {
        const isPublic = reflector.getAllAndOverride<boolean | undefined>(
          IS_PUBLIC_KEY,
          [r.handlerRef, r.controllerRef],
        );
        return Boolean(isPublic) && Boolean(r.audit);
      })
      .map(describeRoute);
    expect(bad).toEqual([]);
  });

  // ── allowlist hygiene ──

  it.each(Object.entries(UNAUDITED_MUTATING_ROUTES))(
    'allowlist entry %s still points at an existing, mutating, un-audited route',
    (key, reason) => {
      expect(reason.trim().length).toBeGreaterThan(20);
      const matches = routes.filter((r) => r.key === key);
      // Stale: route removed or renamed → delete the entry.
      expect(matches.map((r) => r.key)).toEqual([key]);
      const route = matches[0]!;
      // Stale: verb changed to GET → delete the entry.
      expect(isMutating(route.verb)).toBe(true);
      // Stale: route is now decorated → delete the entry.
      expect(route.audit).toBeUndefined();
    },
  );
});
