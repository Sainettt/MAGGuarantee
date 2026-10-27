// `roleLabelKey` (docs/28 — leaders): the label key for every role × lider
// flag, plus the guarantees that the local runtime mirror of `LIDER_ROLES`
// matches shared and that every key it can return exists in both bundles.
// Below: the edge path rules (`isAllowedForRole`) — per route, against the
// frozen pre-B4 role lists, and against the employee nav (UWAGI #17).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIDER_ROLES, RoleSchema, type Role } from '@magguarantee/shared';

import { hasAnyPermission, permissionsFor, type Permission } from './auth/permissions';
import { EMPLOYEE_NAV, EMPLOYEE_SHELL_ROLES, filterNav } from './nav.config';
import {
  LIDER_LABEL_ROLES,
  PATH_PERMISSIONS,
  ROLE_ALLOWED_PREFIXES,
  ROLE_LANDING,
  SCOPE_RESTRICTED_EMPLOYEE_PREFIXES,
  isAllowedForRole,
  roleLabelKey,
  safeNextPath,
} from './roles';

const ALL_ROLES: readonly Role[] = RoleSchema.options;

const EXPECTED_LIDER: Record<Role, string> = {
  admin: 'roles.admin',
  pracownik: 'roles.lider.pracownik',
  opiekun: 'roles.lider.opiekun',
  przewoznik: 'roles.przewoznik',
  planista: 'roles.lider.planista',
  dyspozytor: 'roles.lider.dyspozytor',
  eksport: 'roles.lider.eksport',
  weryfikator: 'roles.weryfikator',
};

type Messages = { [key: string]: string | Messages };

function load(locale: 'pl' | 'en'): Messages {
  const file = fileURLToPath(
    new URL(`../messages/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(file, 'utf8')) as Messages;
}

function lookup(messages: Messages, key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

describe('roleLabelKey', () => {
  it('covers all 8 roles', () => {
    expect(ALL_ROLES).toHaveLength(8);
  });

  describe.each(ALL_ROLES)('%s', (role) => {
    it('lider: true → leader key for LIDER_ROLES, base key otherwise', () => {
      expect(roleLabelKey(role, true)).toBe(EXPECTED_LIDER[role]);
    });

    it('lider: false → base key', () => {
      expect(roleLabelKey(role, false)).toBe(`roles.${role}`);
    });

    it('lider: undefined → base key', () => {
      expect(roleLabelKey(role, undefined)).toBe(`roles.${role}`);
      expect(roleLabelKey(role)).toBe(`roles.${role}`);
    });
  });

  it.each(['admin', 'przewoznik', 'weryfikator'] as const)(
    'a lider flag on %s falls back to the base label',
    (role) => {
      expect(roleLabelKey(role, true)).toBe(`roles.${role}`);
    },
  );

  it('the local runtime mirror matches shared LIDER_ROLES', () => {
    expect(Object.keys(LIDER_LABEL_ROLES).sort()).toEqual(
      [...LIDER_ROLES].sort(),
    );
  });

  it.each(['pl', 'en'] as const)(
    'every key it can return exists in %s.json',
    (locale) => {
      const messages = load(locale);
      const keys = new Set(
        ALL_ROLES.flatMap((r) => [roleLabelKey(r, true), roleLabelKey(r, false)]),
      );
      const missing = [...keys].filter(
        (k) => typeof lookup(messages, k) !== 'string',
      );
      expect(missing).toEqual([]);
    },
  );
});

// docs/29 / docs/14 §17.4 — the vehicle-transfer routes. Leadership is not a
// role, so the edge only knows `planista`; the lider-only approvals route is
// guarded on the client (`vehicles.planner_transfer.decide` from `/auth/me`),
// the rest by role / role permissions here.
describe('isAllowedForRole — planner-transfer routes', () => {
  const cases: [string, Role, boolean][] = [
    ['/employee/przekazania', 'admin', true],
    ['/employee/przekazania', 'opiekun', true],
    ['/employee/przekazania', 'pracownik', false],
    ['/employee/przekazania', 'planista', false],
    ['/employee/przekazania', 'przewoznik', false],
    ['/planista/przekazania', 'planista', true],
    ['/planista/zatwierdzenia', 'planista', true],
    ['/planista/zatwierdzenia', 'admin', true],
    ['/planista/przekazania', 'opiekun', false],
    ['/planista/zatwierdzenia', 'dyspozytor', false],
    // Unrelated employee routes keep their previous rules.
    ['/employee/claims', 'pracownik', true],
    ['/employee/vehicles', 'opiekun', true],
  ];
  it.each(cases)('%s for %s → %s', (path, role, allowed) => {
    expect(isAllowedForRole(path, role)).toBe(allowed);
  });
});

// docs/03-roles.md §opiekun (decision 2026-10-22) — opiekun has no claims
// (wnioski) access at all, so the edge bounces him off `/employee/claims`
// even on a typed URL or a stale `?nrZgl=` deeplink.
describe('isAllowedForRole — employee claims route', () => {
  const cases: [string, Role, boolean][] = [
    ['/employee/claims', 'admin', true],
    ['/employee/claims', 'pracownik', true],
    ['/employee/claims', 'opiekun', false],
    ['/employee/claims/GWA/1/01/26', 'opiekun', false],
    ['/employee/claims/GWA/1/01/26', 'pracownik', true],
    // Prefix match is segment-wise: a sibling sharing the stem is untouched.
    ['/employee/claimsx', 'opiekun', true],
    // The opiekun's own landing stays reachable — no redirect loop.
    ['/employee/opieka', 'opiekun', true],
  ];
  it.each(cases)('%s for %s → %s', (path, role, allowed) => {
    expect(isAllowedForRole(path, role)).toBe(allowed);
  });

  it('a ?nrZgl= deeplink is rejected as a post-login target for opiekun', () => {
    const next = '/employee/claims?nrZgl=GWA%2F1%2F01%2F26';
    expect(safeNextPath(next, 'opiekun')).toBeNull();
    expect(safeNextPath(next, 'pracownik')).toBe(next);
    expect(safeNextPath(next, 'admin')).toBe(next);
  });
});

// Decision 2026-10-27 (UWAGI #17) — every employee nav page has an edge twin
// in `PATH_PERMISSIONS`, so a typed URL bounces to the landing instead of
// rendering the page chrome over a 403. Role catalog only (R3): the pages'
// `requirePermission` handles per-user revocations.
describe('isAllowedForRole — employee nav pages (UWAGI #17)', () => {
  const OPIEKUN_PAGES: readonly string[] = [
    '/employee/opieka',
    '/employee/alerts',
    '/employee/moje-pojazdy',
    '/employee/carriers',
    '/employee/vehicles',
    '/employee/drivers',
    '/employee/trailers',
    // Sub-paths of `/employee/opieka` — the same edge rule covers them.
    '/employee/opieka/carriers/x',
    '/employee/opieka/porozumienia',
    '/employee/opieka/delegations',
  ];

  it.each(OPIEKUN_PAGES)('%s — pracownik refused, admin and opiekun allowed', (path) => {
    expect(isAllowedForRole(path, 'pracownik')).toBe(false);
    expect(isAllowedForRole(path, 'admin')).toBe(true);
    expect(isAllowedForRole(path, 'opiekun')).toBe(true);
  });

  it('/employee/dashboard — opiekun refused, pracownik and admin allowed', () => {
    expect(isAllowedForRole('/employee/dashboard', 'opiekun')).toBe(false);
    expect(isAllowedForRole('/employee/dashboard', 'pracownik')).toBe(true);
    expect(isAllowedForRole('/employee/dashboard', 'admin')).toBe(true);
  });

  const cases: [string, Role, boolean][] = [
    // Prefix match is segment-wise: a sibling sharing the stem is untouched.
    ['/employee/carriersx', 'pracownik', true],
    ['/employee/opiekax', 'pracownik', true],
    ['/employee/dashboardx', 'opiekun', true],
    // The shell root, the «Brak dostępu» page and the pracownik's own pages
    // stay reachable — no redirect loop.
    ['/employee', 'pracownik', true],
    ['/employee/forbidden', 'pracownik', true],
    ['/employee/claims', 'pracownik', true],
    ['/employee', 'opiekun', true],
    ['/employee/forbidden', 'opiekun', true],
  ];
  it.each(cases)('%s for %s → %s', (path, role, allowed) => {
    expect(isAllowedForRole(path, role)).toBe(allowed);
  });

  it('a refused page is no post-login target', () => {
    expect(safeNextPath('/employee/carriers', 'pracownik')).toBeNull();
    expect(safeNextPath('/employee/carriers', 'opiekun')).toBe('/employee/carriers');
    expect(safeNextPath('/employee/dashboard', 'opiekun')).toBeNull();
  });
});

// Golden: the edge agrees with the nav for every employee-shell role, on the
// role catalog (lider = false, no overrides — the edge's own view, R3).
//   (i)  an entry the role SEES is reachable at the edge — no dead link;
//   (ii) a permission-only entry whose right the role LACKS is refused at the
//        edge — no page chrome over a 403.
// Entries with a `roles` qualifier are scope rules (which of two lists a role
// gets), not rights — they get check (i) only.
describe('edge ≡ nav at the role level (UWAGI #17)', () => {
  const asList = (rule: Permission | readonly Permission[]): readonly Permission[] =>
    typeof rule === 'string' ? [rule] : rule;

  describe.each(EMPLOYEE_SHELL_ROLES)('%s', (role) => {
    const visible = new Set(filterNav(permissionsFor(role, false), role).map((l) => l.key));

    it('(i) every nav entry he sees passes the edge', () => {
      const dead = EMPLOYEE_NAV.filter(
        (l) => visible.has(l.key) && !isAllowedForRole(l.href, role),
      ).map((l) => l.href);
      expect(dead).toEqual([]);
    });

    it('(ii) every permission-only entry he lacks is refused at the edge', () => {
      const open = EMPLOYEE_NAV.filter(
        (l) =>
          l.roles === undefined &&
          !hasAnyPermission(role, asList(l.permission), false) &&
          isAllowedForRole(l.href, role),
      ).map((l) => l.href);
      expect(open).toEqual([]);
    });
  });

  it('is not vacuous — both checks see entries for the non-admin roles', () => {
    const lacking = (role: Role) =>
      EMPLOYEE_NAV.filter(
        (l) => l.roles === undefined && !hasAnyPermission(role, asList(l.permission), false),
      ).map((l) => l.key);
    expect(lacking('pracownik')).toEqual(
      expect.arrayContaining(['opieka', 'alerts', 'moje-pojazdy', 'carriers', 'trailers']),
    );
    expect(lacking('opiekun')).toEqual(expect.arrayContaining(['dashboard', 'claims']));
    expect(filterNav(permissionsFor('opiekun', false), 'opiekun').length).toBeGreaterThan(0);
  });
});

// ─── docs/25 §3 B4 — PATH_PERMISSIONS ≡ the role lists it replaced ─────────
// The pre-B4 lists, frozen as a literal fixture, and the pre-B4 check built
// from them. `isAllowedForRole` (now permission-keyed, lider = false, no
// overrides — R3) must agree with it for all 8 roles on every old and new
// prefix, their sub-paths, stem siblings and every role root / landing.
//
// Decision 2026-10-27 (UWAGI #17) added the edge twins of the remaining
// employee nav pages. They are a SECOND literal fixture, written as the role
// lists they amount to, folded into the legacy check as one more
// role-restricted layer — the pre-B4 fixture itself stays frozen.
describe('isAllowedForRole ≡ the pre-B4 role lists', () => {
  const LEGACY_ADMIN_ONLY_EMPLOYEE_PREFIXES: readonly string[] = [
    '/employee/trailer-types',
    '/employee/teams',
    '/employee/users',
    '/employee/sso',
    '/employee/limits',
    '/employee/audit',
    '/employee/diagnostics',
    '/employee/delegations',
  ];
  const LEGACY_ROLE_RESTRICTED_EMPLOYEE_PREFIXES: Readonly<
    Record<string, readonly Role[]>
  > = {
    '/employee/przekazania': ['admin', 'opiekun'],
    '/employee/claims': ['admin', 'pracownik'],
  };
  // Decision 2026-10-27, UWAGI #17 — the role lists the new edge rules mean.
  const UWAGI17_PERMISSION_PREFIXES: Readonly<Record<string, readonly Role[]>> = {
    '/employee/dashboard': ['admin', 'pracownik'],
    '/employee/opieka': ['admin', 'opiekun'],
    '/employee/alerts': ['admin', 'opiekun'],
    '/employee/moje-pojazdy': ['admin', 'opiekun'],
    '/employee/carriers': ['admin', 'opiekun'],
    '/employee/vehicles': ['admin', 'opiekun'],
    '/employee/drivers': ['admin', 'opiekun'],
    '/employee/trailers': ['admin', 'opiekun'],
  };
  const LEGACY_ROLE_ALLOWED_PREFIXES: Record<Role, readonly string[]> = {
    admin: ['/employee', '/carrier', '/planista', '/dyspozytor', '/eksport', '/weryfikator'],
    pracownik: ['/employee'],
    opiekun: ['/employee'],
    przewoznik: ['/carrier'],
    planista: ['/planista'],
    dyspozytor: ['/dyspozytor'],
    eksport: ['/eksport'],
    weryfikator: ['/weryfikator'],
  };

  const under = (path: string, prefix: string) =>
    path === prefix || path.startsWith(prefix + '/');

  function legacyIsAllowedForRole(path: string, role: Role): boolean {
    if (
      role !== 'admin' &&
      LEGACY_ADMIN_ONLY_EMPLOYEE_PREFIXES.some((p) => under(path, p))
    ) {
      return false;
    }
    for (const [prefix, roles] of Object.entries(LEGACY_ROLE_RESTRICTED_EMPLOYEE_PREFIXES)) {
      if (under(path, prefix) && !roles.includes(role)) return false;
    }
    // Second role-restricted layer — UWAGI #17 (decision 2026-10-27).
    for (const [prefix, roles] of Object.entries(UWAGI17_PERMISSION_PREFIXES)) {
      if (under(path, prefix) && !roles.includes(role)) return false;
    }
    return LEGACY_ROLE_ALLOWED_PREFIXES[role].some((p) => under(path, p));
  }

  const prefixes = new Set<string>([
    ...LEGACY_ADMIN_ONLY_EMPLOYEE_PREFIXES,
    ...Object.keys(LEGACY_ROLE_RESTRICTED_EMPLOYEE_PREFIXES),
    ...Object.keys(UWAGI17_PERMISSION_PREFIXES),
    ...Object.keys(PATH_PERMISSIONS),
    ...Object.keys(SCOPE_RESTRICTED_EMPLOYEE_PREFIXES),
    ...Object.values(LEGACY_ROLE_ALLOWED_PREFIXES).flat(),
    ...Object.values(ROLE_ALLOWED_PREFIXES).flat(),
    ...Object.values(ROLE_LANDING),
    // Sub-pages of the UWAGI #17 `/employee/opieka` prefix (each gates itself).
    '/employee/opieka/carriers',
    '/employee/opieka/porozumienia',
    '/employee/opieka/delegations',
    // Routes outside every list — must stay as they were.
    '/employee/forbidden',
    '/planista/przekazania',
    '/planista/zatwierdzenia',
  ]);
  const paths = [...prefixes].flatMap((p) => [p, `${p}/x`, `${p}x`]);

  it('the fixtures list every prefix the new tables gate', () => {
    for (const p of Object.keys(PATH_PERMISSIONS)) {
      expect(
        LEGACY_ADMIN_ONLY_EMPLOYEE_PREFIXES.includes(p) ||
          p in LEGACY_ROLE_RESTRICTED_EMPLOYEE_PREFIXES ||
          p in UWAGI17_PERMISSION_PREFIXES,
        p,
      ).toBe(true);
    }
    expect(ROLE_ALLOWED_PREFIXES).toEqual(LEGACY_ROLE_ALLOWED_PREFIXES);
  });

  it('the UWAGI #17 fixture adds prefixes, it never re-states a pre-B4 one', () => {
    const overlap = Object.keys(UWAGI17_PERMISSION_PREFIXES).filter(
      (p) =>
        LEGACY_ADMIN_ONLY_EMPLOYEE_PREFIXES.includes(p) ||
        p in LEGACY_ROLE_RESTRICTED_EMPLOYEE_PREFIXES,
    );
    expect(overlap).toEqual([]);
  });

  it.each(ALL_ROLES)('%s — identical on every path', (role) => {
    const diff = paths.filter(
      (path) => isAllowedForRole(path, role) !== legacyIsAllowedForRole(path, role),
    );
    expect(diff).toEqual([]);
  });

  it('only `/employee/delegations` stays a role scope (no edge gates beyond the fixtures)', () => {
    expect(SCOPE_RESTRICTED_EMPLOYEE_PREFIXES).toEqual({
      '/employee/delegations': ['admin'],
    });
    expect(Object.keys(PATH_PERMISSIONS).sort()).toEqual(
      [
        ...LEGACY_ADMIN_ONLY_EMPLOYEE_PREFIXES.filter((p) => p !== '/employee/delegations'),
        ...Object.keys(LEGACY_ROLE_RESTRICTED_EMPLOYEE_PREFIXES),
        ...Object.keys(UWAGI17_PERMISSION_PREFIXES),
      ].sort(),
    );
  });
});
