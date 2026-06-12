// Role-gated employee navigation per docs/14-design-system.md
// §"Role-gated navigation (реализация)" (Phase 4 spec).
//
// Single source of truth — hardcoded array, not a runtime feature flag.
// Each entry declares which roles may *see* the link; layouts filter the
// array in a server context before rendering, so what a role doesn't see
// isn't even shipped to the client (no client-side CSS hiding).
//
// Note on `iconName`: React component references aren't serialisable across
// the server/client boundary, so we keep the icon as a *string name* here
// and let the client-side sidebar (`<EmployeeSidebar>`) map `iconName`
// back to the Lucide component via a local lookup. That way the server
// can keep this config fully importable without crashing the RSC payload.
//
// Per-path access control (direct-URL navigation) is enforced separately
// in `lib/roles.ts` (`isAllowedForRole` / `ADMIN_ONLY_EMPLOYEE_PREFIXES`)
// and re-checked by each admin segment's `layout.tsx` server-side.

import type { Role } from '@magguarantee/shared';

export interface NavLink {
  /** Stable identifier — used as React key + for active-state matching. */
  key: string;
  href: string;
  /** i18n key under `nav.*`. */
  labelKey: string;
  /** Lucide icon component *name* — resolved on the client. */
  iconName: string;
  /** Roles allowed to see this link in the nav. */
  roles: readonly Role[];
}

/**
 * Employee-panel navigation. Layout filters by role before render.
 *
 *   `pracownik` sees exactly: Dashboard + Wnioski.
 *   `opiekun`   sees: Moja opieka + Carriers / Vehicles / Drivers / Trailers
 *               (the four CRUDs are ownership-scoped by the API — Phase 5.1).
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
    roles: ['admin', 'pracownik'],
  },
  {
    key: 'claims',
    href: '/employee/claims',
    labelKey: 'nav.claims',
    iconName: 'FileText',
    roles: ['admin', 'pracownik'],
  },
  // Opiekun + admin — Phase 5 ownership-scoped fleet view.
  {
    key: 'opieka',
    href: '/employee/opieka',
    labelKey: 'nav.opieka',
    iconName: 'HeartHandshake',
    roles: ['opiekun', 'admin'],
  },
  // Admin + opiekun — Phase 5.1 opened these four to opiekun (API auto-scopes
  // the list endpoints to the caller's ownership and 403s any cross-tenant
  // create/edit).
  {
    key: 'carriers',
    href: '/employee/carriers',
    labelKey: 'nav.carriers',
    iconName: 'Building2',
    roles: ['admin', 'opiekun'],
  },
  {
    key: 'vehicles',
    href: '/employee/vehicles',
    labelKey: 'nav.vehicles',
    iconName: 'Truck',
    roles: ['admin', 'opiekun'],
  },
  {
    key: 'drivers',
    href: '/employee/drivers',
    labelKey: 'nav.drivers',
    iconName: 'Users',
    roles: ['admin', 'opiekun'],
  },
  {
    key: 'trailers',
    href: '/employee/trailers',
    labelKey: 'nav.trailers',
    iconName: 'Container',
    roles: ['admin', 'opiekun'],
  },
  {
    key: 'trailer-types',
    href: '/employee/trailer-types',
    labelKey: 'nav.trailerTypes',
    iconName: 'Settings2',
    roles: ['admin'],
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
    roles: ['admin'],
  },
  // Admin-only read-only km-report (Phase 7.7) — the same <KmBoardScreen
  // mode="view"> the planista/dyspozytor/eksport see, unscoped for admin.
  {
    key: 'km',
    href: '/employee/km',
    labelKey: 'nav.km',
    iconName: 'Gauge',
    roles: ['admin'],
  },
  {
    key: 'limits',
    href: '/employee/limits',
    labelKey: 'nav.limits',
    iconName: 'Gauge',
    roles: ['admin'],
  },
  {
    key: 'users',
    href: '/employee/users',
    labelKey: 'nav.users',
    iconName: 'UserCog',
    roles: ['admin'],
  },
  {
    key: 'audit',
    href: '/employee/audit',
    labelKey: 'nav.audit',
    iconName: 'History',
    roles: ['admin'],
  },
  {
    key: 'diagnostics',
    href: '/employee/diagnostics',
    labelKey: 'nav.diagnostics',
    iconName: 'Activity',
    roles: ['admin'],
  },
];

/** Returns the subset of EMPLOYEE_NAV visible to the given role. */
export function filterNavForRole(role: Role): NavLink[] {
  return EMPLOYEE_NAV.filter((link) => link.roles.includes(role));
}
