// Phase 1 role → landing-path mapping. Three internal roles share `/employee`
// because their UIs converge in Phases 4–5; the rest each get a dedicated
// route group ready for Phase 2+ divergence.
//
// This file is also the source of truth for path-level role gating. Both
// middleware (edge) and route-group layouts (server) consult `isAllowed` /
// `roleForPath` to decide whether a given user may reach a path.

import type { Role } from '@magguarantee/shared';

export const ROLE_LANDING: Record<Role, string> = {
  admin: '/employee',
  pracownik: '/employee',
  opiekun: '/employee',
  przewoznik: '/carrier',
  planista: '/planista',
  dyspozytor: '/dyspozytor',
  // Phase 7 — these two single-destination roles land directly on their one
  // real screen. The `/eksport` and `/weryfikator` landing routes still exist
  // and `redirect()` there, but routing them straight to the real screen skips
  // the redirect hop entirely (post-login, access-denial bounce, and the header
  // home link all resolve here — no loop). docs/14-design-system.md §7.2 / §7.5.
  //
  // eksport → read-only delegations витрина; weryfikator → weekly km-board
  // (rework 2026-06-12 #3: the route-status board is absorbed into the daily
  // km-list, so the landing moves `/weryfikator/vehicles` → `/weryfikator/km`).
  eksport: '/eksport/delegations',
  weryfikator: '/weryfikator/km',
};

/** All authenticated landing paths (used by middleware to allow them). */
export const ROLE_LANDING_PATHS = Array.from(
  new Set(Object.values(ROLE_LANDING)),
);

export function landingFor(role: Role): string {
  return ROLE_LANDING[role];
}

// ─── Path-level access control ────────────────────────────────

/**
 * Per-role allow-list of route-group prefixes. A path is reachable for a role
 * iff it starts with one of these prefixes (with `/employee` having extra
 * sub-rules — see `ADMIN_ONLY_EMPLOYEE_PREFIXES`).
 *
 * Why admin lists every prefix: admin can switch into any panel, including
 * `/carrier` for debug-fallback (see docs/03-roles.md#admin — "В Carrier
 * panel видеть все wnioski").
 */
export const ROLE_ALLOWED_PREFIXES: Record<Role, readonly string[]> = {
  admin: ['/employee', '/carrier', '/planista', '/dyspozytor', '/eksport', '/weryfikator'],
  pracownik: ['/employee'],
  opiekun: ['/employee'],
  przewoznik: ['/carrier'],
  planista: ['/planista'],
  dyspozytor: ['/dyspozytor'],
  eksport: ['/eksport'],
  weryfikator: ['/weryfikator'],
};

/**
 * Sub-paths inside `/employee` that only `admin` may reach. `pracownik` and
 * `opiekun` share the employee shell but their nav row hides these tabs and
 * direct-URL access must be blocked too. See docs/03-roles.md#pracownik.
 *
 * Phase 5.1 — `carriers`, `vehicles`, `drivers`, `trailers` are now also
 * reachable by `opiekun` (ownership-scoped by the API). They've been removed
 * from this list and their page directories were moved out of the `(admin)`
 * route group accordingly. `trailer-types` stays admin-only per
 * docs/03-roles.md.
 */
export const ADMIN_ONLY_EMPLOYEE_PREFIXES: readonly string[] = [
  '/employee/trailer-types',
  // Phase 11 — admin «Zespoły prowadzące» (dispatch-team CRUD). Lives under the
  // `(admin)` route group; this entry bounces non-admin direct-URL nav at the
  // edge (docs/03-roles.md — only admin manages catalogs/teams).
  '/employee/teams',
  // Phase 4.5 — admin ops surfaces (users CRUD shipped in 4.4; limits / audit
  // / diagnostics added in 4.5). Each renders behind the `(admin)` layout
  // guard too, but middleware needs the same allow-list so direct-URL
  // navigation by non-admins is bounced at the edge.
  '/employee/users',
  '/employee/limits',
  '/employee/audit',
  '/employee/diagnostics',
  // Phase 6.x — admin all-access "Wyjazdy" (read-only delegations list).
  // Lives under the `(admin)` route group too; this entry bounces non-admin
  // direct-URL navigation at the edge. pracownik/opiekun must NEVER reach it
  // (docs/19-known-quirks.md #13 + roles matrix).
  '/employee/delegations',
];

function startsWithPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

function pathStartsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => startsWithPrefix(pathname, p));
}

/**
 * Returns true if `pathname` is reachable for `role`. The check is purely
 * path-level (no entity-scope ownership) — that part lives at the API.
 *
 * Always returns true for the root `/` (page itself redirects to landing) and
 * for unrecognized prefixes the caller is expected to handle separately.
 */
export function isAllowedForRole(pathname: string, role: Role): boolean {
  // Admin sub-section of `/employee` is reserved.
  if (
    role !== 'admin' &&
    pathStartsWithAny(pathname, ADMIN_ONLY_EMPLOYEE_PREFIXES)
  ) {
    return false;
  }
  return pathStartsWithAny(pathname, ROLE_ALLOWED_PREFIXES[role]);
}

/**
 * True if `pathname` falls under any role's owned route group (i.e. it's a
 * gated app path, not `/`, `/login`, or some unmapped URL). Used by
 * middleware to know when role-gating should run.
 */
export function isGatedPath(pathname: string): boolean {
  const allRoots = new Set<string>();
  for (const prefixes of Object.values(ROLE_ALLOWED_PREFIXES)) {
    for (const p of prefixes) allRoots.add(p);
  }
  return pathStartsWithAny(pathname, Array.from(allRoots));
}

// ─── Post-login redirect (?next=...) ──────────────────────────

const MAX_NEXT_LEN = 512;

/**
 * Validates a `?next=...` value attached by middleware on the login redirect.
 * Returns the original string if it's safe to use as a post-login destination
 * for `role`, or null otherwise.
 *
 * Safety checks (defends against open-redirect attacks):
 *  - must be a same-site absolute path: starts with a single `/`
 *  - rejects protocol-relative `//evil.com` and backslash escapes `/\evil`
 *  - rejects bounce-to-login (would loop)
 *  - rejects scheme-prefixed strings (`javascript:`, `data:`)
 *  - the path part (without `?...#...`) must pass `isAllowedForRole` for the
 *    target role — otherwise middleware would just bounce them anyway
 *  - max length cap to keep cookies/URLs sane
 */
export function safeNextPath(
  next: string | null | undefined,
  role: Role,
): string | null {
  if (!next) return null;
  if (next.length > MAX_NEXT_LEN) return null;
  if (!next.startsWith('/')) return null;
  // `//evil.com/...` is protocol-relative — browsers treat it as cross-origin.
  if (next.startsWith('//')) return null;
  // `/\evil.com` — some browsers normalise backslashes to forward slashes.
  if (next.startsWith('/\\')) return null;
  if (next === '/login' || next.startsWith('/login/')) return null;
  // Path portion only — query/fragment are preserved on success but ignored
  // for the role check.
  const pathOnly = next.split('?')[0]!.split('#')[0]!;
  if (!isAllowedForRole(pathOnly, role)) return null;
  return next;
}

/**
 * Resolves the post-login destination: a validated `?next` if present,
 * otherwise the role's default landing.
 */
export function resolveNext(
  next: string | null | undefined,
  role: Role,
): string {
  return safeNextPath(next, role) ?? landingFor(role);
}
