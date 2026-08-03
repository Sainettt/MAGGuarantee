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
  // Opiekun + admin — Phase 5.2 «Alerty»: expiring/expired documents (OCP
  // insurance, transport licence, fuel card, driving licence). In-app only.
  // Carries a red count pill (expired + expires-today) — the "visible" notice.
  {
    key: 'alerts',
    href: '/employee/alerts',
    labelKey: 'nav.alerts',
    iconName: 'BellRing',
    roles: ['opiekun', 'admin'],
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
    roles: ['opiekun', 'admin'],
  },
  // Opiekun — read-only «Wyjazdy» across every supervised carrier. Lives at
  // `/employee/opieka/delegations`, NOT `/employee/delegations`: that path is
  // admin-only (see `ADMIN_ONLY_EMPLOYEE_PREFIXES`). Admin is intentionally
  // absent here — they already have the unscoped `delegations` entry below, and
  // two «Wyjazdy» rows in one sidebar would be noise. pracownik must never see
  // delegacje (docs/19-known-quirks.md #13).
  {
    key: 'opieka-delegations',
    href: '/employee/opieka/delegations',
    labelKey: 'nav.delegations',
    iconName: 'MapPin',
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
  // Phase 11 — admin «Zespoły prowadzące» (dispatch-team CRUD). Replaces the
  // external "raport DAF" Excel; vehicles are assigned to a team, every
  // dispatcher in the team sees them.
  {
    key: 'teams',
    href: '/employee/teams',
    labelKey: 'nav.teams',
    iconName: 'Users2',
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
