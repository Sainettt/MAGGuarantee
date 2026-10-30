// Phase 1 role → landing-path mapping. Three internal roles share `/employee`
// because their UIs converge in Phases 4–5; the rest each get a dedicated
// route group ready for Phase 2+ divergence.
//
// This file is also the source of truth for path-level gating. Both
// middleware (edge) and route-group layouts (server) consult `isAllowed` /
// `roleForPath` to decide whether a given user may reach a path.

// Type-only on purpose: `middleware.ts` (edge) imports this file, and the
// shared package's runtime barrel pulls every zod schema — a value import
// from it here would drag all of that into the edge bundle (docs/28 §9.2 #18).
// The permissions catalog comes through `./auth/permissions`, which imports
// the dependency-free `@magguarantee/shared/permissions` subpath instead;
// `lib/auth/edge-imports.test.ts` fails on a value import from the barrel.
import type { LiderRole, Role } from '@magguarantee/shared';

import { hasAnyPermission, type Permission } from './auth/permissions';

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

// ─── Role labels (docs/28 — leaders) ──────────────────────────

/**
 * The roles that may carry the leader flag — a local mirror of shared
 * `LIDER_ROLES`, kept here as a plain object so this edge-imported file needs
 * no runtime import from `@magguarantee/shared` (see the import note above).
 *
 * `satisfies Record<LiderRole, true>` keeps the mirror honest at compile
 * time: a role added to (or removed from) `LIDER_ROLES` without touching this
 * object is a missing / excess property, so the build fails. `roles.test.ts`
 * double-checks the key set against the runtime `LIDER_ROLES`.
 *
 * A leader is NOT a role (docs/28 §0, R1): landing, prefixes and edge gating
 * above stay keyed by `Role` alone. The flag only changes the label.
 */
export const LIDER_LABEL_ROLES = {
  planista: true,
  dyspozytor: true,
  opiekun: true,
  pracownik: true,
  eksport: true,
} as const satisfies Record<LiderRole, true>;

/** A full next-intl key under the root namespace: `roles.<role>` or `roles.lider.<role>`. */
export type RoleLabelKey = `roles.${Role}` | `roles.lider.${LiderRole}`;

function isLiderLabelRole(role: Role): role is LiderRole {
  return (LIDER_LABEL_ROLES as Partial<Record<Role, true>>)[role] === true;
}

/**
 * i18n key for a user's role label, for a translator bound to the ROOT
 * namespace (`useTranslations()`): «Lider planistów» for `planista` + `lider`,
 * «Planista» otherwise. A `lider` flag on a role that cannot carry it (admin,
 * przewoznik, weryfikator — the database forbids the pair anyway) falls back
 * to the base label rather than to a missing key.
 */
export function roleLabelKey(role: Role, lider?: boolean): RoleLabelKey {
  return lider === true && isLiderLabelRole(role)
    ? `roles.lider.${role}`
    : `roles.${role}`;
}

// ─── Path-level access control ────────────────────────────────

/**
 * Per-role allow-list of route-group prefixes. A path is reachable for a role
 * iff it starts with one of these prefixes (with `/employee` having extra
 * sub-rules — see `PATH_PERMISSIONS` and `SCOPE_RESTRICTED_EMPLOYEE_PREFIXES`).
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
 * Sub-paths inside `/employee` that need a PERMISSION (any-of when a list) on
 * top of the role's prefix allow-list (docs/25 §3 B4). `pracownik` and
 * `opiekun` share the employee shell; their nav hides what they lack and
 * direct-URL access is bounced here too.
 *
 * The edge only knows the JWT role, so the check is the role catalog with
 * `lider = false` and no per-user overrides (docs/25 R3) — the server pages
 * re-check the EFFECTIVE list from `/auth/me` (`requirePermission`).
 * `roles.test.ts` pins `isAllowedForRole` to the role lists this replaced
 * plus the UWAGI #17 additions, and checks the edge against the nav.
 *
 * Decision 2026-10-27 (UWAGI #17) — every employee nav page has its edge twin
 * here, keyed by the permission of its `EMPLOYEE_NAV` entry, so a typed URL is
 * bounced to the landing instead of rendering page chrome over a 403. The
 * opiekun still reaches `carriers`, `vehicles`, `drivers`, `trailers` (Phase
 * 5.1, ownership-scoped by the API) — they are listed because the pracownik
 * must not. Per-user overrides are invisible here (R3): an opiekun whose
 * `panel.opiekun` was revoked passes the edge and is stopped by the page.
 */
export const PATH_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  // Catalog of trailer types — admin only (docs/03-roles.md).
  '/employee/trailer-types': ['trailer_types.manage'],
  // Phase 11 — «Zespoły dyspozytorów» (dispatch-team CRUD).
  '/employee/teams': ['teams.manage'],
  // Phase 4.5 — ops surfaces (users CRUD 4.4; limits / audit / diagnostics
  // 4.5). Each renders behind the `(admin)` layout + its own page check too.
  '/employee/users': ['users.manage'],
  // Google SSO — the stanowisko → role mapping (docs/24 §A5). Handing out
  // roles is as privileged as user CRUD.
  '/employee/sso': ['sso.manage'],
  '/employee/limits': ['limits.manage'],
  '/employee/audit': ['audit.read'],
  '/employee/diagnostics': ['diagnostics.manage'],
  // docs/29 / docs/14 §17.4.1 — «Przekazania»: admin decides every vehicle
  // transfer request, the opiekun follows his own (D5); `pracownik` has no
  // part in it (the api would 403 both `scope=decide` and `scope=mine`).
  '/employee/przekazania': [
    'vehicles.planner_transfer.request',
    'vehicles.planner_transfer.decide',
  ],
  // opiekun has no claims (wnioski) access at all — decision 2026-10-22,
  // docs/03-roles.md §opiekun (the api drops him from GET /claims and
  // GET /claims/:nrZgl). Closes the edge layer for a typed URL or a stale
  // `?nrZgl=` deeplink; the page's `requirePermission` is the server twin.
  '/employee/claims': ['claims.read'],
  // Decision 2026-10-27, UWAGI #17 — the edge twins of the remaining nav
  // pages (role catalog only; each page re-checks with `requirePermission`).
  // Dashboard: admin + pracownik; the opiekun lands on «Moja opieka».
  '/employee/dashboard': ['dashboard.read'],
  // «Moja opieka» — covers `/carriers/[login]`, `/porozumienia` and
  // `/delegations` (that page re-checks `delegations.read` itself).
  '/employee/opieka': ['panel.opiekun'],
  '/employee/alerts': ['panel.opiekun'],
  '/employee/moje-pojazdy': ['km.read'],
  // Fleet CRUD — admin + opiekun (ownership-scoped by the API); not pracownik.
  '/employee/carriers': ['carriers.read'],
  '/employee/vehicles': ['vehicles.read'],
  '/employee/drivers': ['drivers.read'],
  '/employee/trailers': ['trailers.read'],
};

/**
 * scope: sub-paths inside `/employee` kept for the listed ROLES — not an
 * access right but which screen a role gets for data it may read.
 *
 * Phase 6.x — the admin's all-access «Wyjazdy» (read-only, unscoped). It
 * cannot be a permission without a behaviour change: the opiekun holds
 * `delegations.read` too, but his list is `/employee/opieka/delegations`.
 * pracownik/opiekun must NEVER reach this one (docs/19-known-quirks.md #13).
 */
export const SCOPE_RESTRICTED_EMPLOYEE_PREFIXES: Readonly<
  Record<string, readonly Role[]>
> = {
  '/employee/delegations': ['admin'],
};

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
  // Edge = role catalog only: lider = false, no overrides (docs/25 R3).
  for (const [prefix, rule] of Object.entries(PATH_PERMISSIONS)) {
    if (startsWithPrefix(pathname, prefix) && !hasAnyPermission(role, rule, false)) {
      return false;
    }
  }
  for (const [prefix, roles] of Object.entries(SCOPE_RESTRICTED_EMPLOYEE_PREFIXES)) {
    if (startsWithPrefix(pathname, prefix) && !roles.includes(role)) return false;
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
