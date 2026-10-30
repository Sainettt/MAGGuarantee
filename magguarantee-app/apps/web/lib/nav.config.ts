// Permission-gated employee navigation per docs/14-design-system.md
// §"Role-gated navigation (реализация)" (Phase 4 spec) and docs/25 §3 B4.
//
// Single source of truth — hardcoded array, not a runtime feature flag.
// Each entry declares which PERMISSION lets a user *see* the link (any-of
// when a list), plus — for exactly two entries — a `roles` scope qualifier;
// layouts filter the array in a server context before rendering, so what a
// user doesn't see isn't even shipped to the client (no client-side CSS
// hiding). `nav.config.test.ts` freezes the per-role output.
//
// Note on `iconName`: React component references aren't serialisable across
// the server/client boundary, so we keep the icon as a *string name* here
// and let the client-side sidebar (`<EmployeeSidebar>`) map `iconName`
// back to the Lucide component via a local lookup. That way the server
// can keep this config fully importable without crashing the RSC payload.
//
// Per-path access control (direct-URL navigation) is enforced separately
// in `lib/roles.ts` (`isAllowedForRole` / `PATH_PERMISSIONS`) and re-checked
// server-side by every page (`requirePermission` — UWAGI #17). `roles.test.ts`
// pins the edge to this array, `lib/auth/pageGates.test.ts` the page gates.

import type { Role } from '@magguarantee/shared';

import { canAny, type Permission, type PermissionRule } from './auth/permissions';

export interface NavLink {
  /** Stable identifier — used as React key + for active-state matching. */
  key: string;
  href: string;
  /** i18n key under `nav.*`. */
  labelKey: string;
  /** Lucide icon component *name* — resolved on the client. */
  iconName: string;
  /** Permission needed to see this link (any-of when a list). */
  permission: PermissionRule;
  /**
   * scope: an extra ROLE qualifier on top of `permission` — for a link whose
   * permission is shared by roles that must land on DIFFERENT screens for the
   * same data (the two «Wyjazdy» entries). Not an access right: who may read
   * at all is `permission`; this only picks which of the two lists he gets.
   */
  roles?: readonly Role[];
}

/**
 * scope: the roles whose panel IS the employee shell — `(employee)/layout.tsx`
 * admits exactly these (a panel is a role, docs/25 §3 B4). The nav belongs to
 * that panel, so `filterNav` returns nothing for any other role even when a
 * permission would match (a planista holds `vehicles.read` but has his own
 * shell).
 */
export const EMPLOYEE_SHELL_ROLES: readonly Role[] = ['admin', 'pracownik', 'opiekun'];

/**
 * Employee-panel navigation. Layout filters by permission before render.
 *
 *   `pracownik` sees exactly: Dashboard + Wnioski.
 *   `opiekun`   sees: Moja opieka + Przebieg + Wyjazdy + Carriers / Vehicles /
 *               Drivers / Trailers (all ownership-scoped by the API — Phase 5.1;
 *               Wyjazdy is read-only oversight).
 *   `admin`     sees the full list (Dashboard + Wnioski + Opieka + 10 admin items).
 *
 * Other roles (planista, dyspozytor, eksport, weryfikator) get their own
 * panels/route-groups — they don't reach the employee shell.
 */
export const EMPLOYEE_NAV: readonly NavLink[] = [
  // Both admin + pracownik
  {
    key: 'dashboard',
    href: '/employee/dashboard',
    labelKey: 'nav.dashboard',
    iconName: 'LayoutDashboard',
    permission: 'dashboard.read',
  },
  {
    key: 'claims',
    href: '/employee/claims',
    labelKey: 'nav.claims',
    iconName: 'FileText',
    permission: 'claims.read',
  },
  // Opiekun + admin — Phase 5 ownership-scoped fleet view.
  {
    key: 'opieka',
    href: '/employee/opieka',
    labelKey: 'nav.opieka',
    iconName: 'HeartHandshake',
    permission: 'panel.opiekun',
  },
  // Opiekun + admin — Phase 5.2 «Alerty»: expiring/expired documents (OCP
  // insurance, transport licence, fuel card, driving licence). In-app only.
  // Carries a red count pill (expired + expires-today) — the "visible" notice.
  {
    key: 'alerts',
    href: '/employee/alerts',
    labelKey: 'nav.alerts',
    iconName: 'BellRing',
    permission: 'panel.opiekun',
  },
  // Opiekun + admin — Phase 7.8 «Moje pojazdy — przebieg» (docs/14 §7.8): the
  // read-only multi-carrier weekly km tab scoped to the carriers the opiekun
  // supervises. Label reuses the `myKm.tab` key. NOT admin-only (lives outside
  // the `(admin)` segment) so the opiekun can reach it.
  {
    key: 'moje-pojazdy',
    href: '/employee/moje-pojazdy',
    labelKey: 'myKm.tab',
    iconName: 'Gauge',
    permission: 'km.read',
  },
  // Opiekun — read-only «Wyjazdy» across every supervised carrier. Lives at
  // `/employee/opieka/delegations`, NOT `/employee/delegations`: that path is
  // admin-only (see `SCOPE_RESTRICTED_EMPLOYEE_PREFIXES`). Admin is intentionally
  // absent here — they already have the unscoped `delegations` entry below, and
  // two «Wyjazdy» rows in one sidebar would be noise. pracownik must never see
  // delegacje (docs/19-known-quirks.md #13).
  {
    key: 'opieka-delegations',
    href: '/employee/opieka/delegations',
    labelKey: 'nav.delegations',
    iconName: 'MapPin',
    permission: 'delegations.read',
    // scope: the opiekun's scoped list; admin reads the unscoped one below.
    roles: ['opiekun'],
  },
  // Admin + opiekun — Phase 5.1 opened these four to opiekun (API auto-scopes
  // the list endpoints to the caller's ownership and 403s any cross-tenant
  // create/edit).
  {
    key: 'carriers',
    href: '/employee/carriers',
    labelKey: 'nav.carriers',
    iconName: 'Building2',
    permission: 'carriers.read',
  },
  {
    key: 'vehicles',
    href: '/employee/vehicles',
    labelKey: 'nav.vehicles',
    iconName: 'Truck',
    permission: 'vehicles.read',
  },
  // docs/29 / docs/14 §17.4.1 — vehicle planner transfers, right after the
  // vehicles (a transfer is an action on a vehicle). Admin: the inbox with a
  // pending pill; opiekun: his own requests (D5, no pill). NOT admin-only —
  // but closed to pracownik (`PATH_PERMISSIONS` in lib/roles.ts).
  {
    key: 'transfers',
    href: '/employee/przekazania',
    labelKey: 'nav.transfers',
    iconName: 'ArrowLeftRight',
    permission: [
      'vehicles.planner_transfer.request',
      'vehicles.planner_transfer.decide',
    ],
  },
  {
    key: 'drivers',
    href: '/employee/drivers',
    labelKey: 'nav.drivers',
    iconName: 'Users',
    permission: 'drivers.read',
  },
  {
    key: 'trailers',
    href: '/employee/trailers',
    labelKey: 'nav.trailers',
    iconName: 'Container',
    permission: 'trailers.read',
  },
  {
    key: 'trailer-types',
    href: '/employee/trailer-types',
    labelKey: 'nav.trailerTypes',
    iconName: 'Settings2',
    permission: 'trailer_types.manage',
  },
  // Phase 11 — admin «Zespoły dyspozytorów» (dispatch-team CRUD). Replaces the
  // external "raport DAF" Excel; vehicles are assigned to a team, every
  // dispatcher in the team sees them.
  {
    key: 'teams',
    href: '/employee/teams',
    labelKey: 'nav.teams',
    iconName: 'Users2',
    permission: 'teams.manage',
  },
  // Admin-only all-access "Wyjazdy" — the same read-only delegations view
  // planista/dyspozytor/carrier see, but unscoped (admin is all-access on
  // `GET /delegations`). NOT visible to pracownik/opiekun (docs/19-known-
  // quirks.md #13 — pracownik must never see delegacje; roles matrix).
  {
    key: 'delegations',
    href: '/employee/delegations',
    labelKey: 'nav.delegations',
    iconName: 'MapPin',
    permission: 'delegations.read',
    // scope: the unscoped all-carriers list is the admin's view; the opiekun
    // (who reads delegations too) gets `opieka-delegations` above.
    roles: ['admin'],
  },
  // NB: the admin «Raport km» (Phase 7.7 `/employee/km`) entry was removed —
  // it duplicated «Przebieg» (`moje-pojazdy`, Phase 7.8): both render the same
  // read-only `<KmBoardScreen mode="view">` off the same `useVehicleKmReport`
  // endpoint (admin is all-access, so both show every vehicle). «Przebieg» is
  // the surviving km view for admin.
  {
    key: 'limits',
    href: '/employee/limits',
    labelKey: 'nav.limits',
    iconName: 'Gauge',
    permission: 'limits.manage',
  },
  {
    key: 'users',
    href: '/employee/users',
    labelKey: 'nav.users',
    iconName: 'UserCog',
    permission: 'users.manage',
  },
  {
    key: 'sso',
    href: '/employee/sso',
    labelKey: 'nav.sso',
    iconName: 'KeyRound',
    permission: 'sso.manage',
  },
  {
    key: 'audit',
    href: '/employee/audit',
    labelKey: 'nav.audit',
    iconName: 'History',
    permission: 'audit.read',
  },
  {
    key: 'diagnostics',
    href: '/employee/diagnostics',
    labelKey: 'nav.diagnostics',
    iconName: 'Activity',
    permission: 'diagnostics.manage',
  },
];

/** The in-shell «Brak dostępu» page (mirrors `EMPLOYEE_FORBIDDEN_PATH` of `lib/auth/server.ts`). */
const EMPLOYEE_FORBIDDEN = '/employee/forbidden';

/**
 * Where `/employee` sends a signed-in employee — and with it every «landing»
 * redirect of the shell's pages (`requirePermission(…, { onDenied: 'landing' })`
 * → `landingFor(role)` = `/employee`): the FIRST nav entry he can see.
 *
 * For the role sets this is what the root always did — admin / pracownik →
 * Dashboard, opiekun → Moja opieka (`navLanding.test.ts` pins it). With
 * per-user revocations (docs/25 B6) a fixed target could loop: a pracownik
 * whose `dashboard.read` was revoked would bounce `/employee/dashboard` →
 * `/employee` → `/employee/dashboard`. The first visible entry is one he holds
 * the right for, so its page never sends him back; with no entry left he gets
 * the «Brak dostępu» page inside the shell.
 */
export function employeeLandingPath(
  permissions: readonly Permission[],
  role: Role,
): string {
  return filterNav(permissions, role)[0]?.href ?? EMPLOYEE_FORBIDDEN;
}

/**
 * The subset of EMPLOYEE_NAV visible to a user with these EFFECTIVE
 * `permissions` (`effectivePermissionsOf(user)`) and this `role` (used only
 * for the shell scope and the `roles` qualifier). Array order is kept.
 */
export function filterNav(
  permissions: readonly Permission[],
  role: Role,
): NavLink[] {
  if (!EMPLOYEE_SHELL_ROLES.includes(role)) return [];
  return EMPLOYEE_NAV.filter(
    (link) =>
      canAny(permissions, link.permission) &&
      (link.roles === undefined || link.roles.includes(role)),
  );
}
