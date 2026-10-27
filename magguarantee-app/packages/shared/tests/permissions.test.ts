// Permissions catalog (docs/25 §2, §3 B1; leader flag docs/28 §5).
//
// The route-level equivalence with the pre-track-B access lives in the api
// (`apps/api/src/common/authz/endpoint-permissions.spec.ts`, the generated
// permission fixture against the frozen roles fixture). Here: the catalog's
// own invariants, the decided assignments that no route pins (service
// capabilities, 2026-10-22/23 decisions) and that docs/03 shows exactly what
// the code grants. B6: the per-user overrides (`GRANTABLE_EXTRA`,
// `DEPENDENT_PERMISSIONS`, `effectivePermissionsFor`, `pruneOverrides`).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as shared from '../src';
import {
  DEPENDENT_PERMISSIONS,
  GRANTABLE_EXTRA,
  LIDER_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  effectivePermissionsFor,
  grantableExtraFor,
  hasAnyPermission,
  hasPermission,
  isPermission,
  permissionsDependingOn,
  permissionsFor,
  pruneOverrides,
  revocablePermissionsFor,
  rolesSatisfying,
  type Permission,
} from '../src/permissions';
import { PERMISSION_DESCRIPTIONS, renderPermissionMatrix } from '../src/permissions-matrix';
import { Role } from '../src/schemas/auth';
import { LIDER_ROLES, RoleSchema } from '../src/schemas/common';

const ROLES = RoleSchema.options;

/** CI runs from `magguarantee-app` with the full checkout — the doc is 4 levels up. */
const DOCS_03 = resolve(__dirname, '../../../../docs/03-roles.md');
const MATRIX_START = '<!-- authz:matrix:start -->';
const MATRIX_END = '<!-- authz:matrix:end -->';

function grantedTo(permission: Permission, lider = false): string[] {
  return ROLES.filter((role) => hasPermission(role, permission, lider));
}

describe('catalog', () => {
  it('has no duplicate and only `domain.action` names (snake_case segments)', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    const malformed = PERMISSIONS.filter((p) => !/^[a-z][a-z_]*(\.[a-z][a-z_]*)+$/.test(p));
    expect(malformed).toEqual([]);
  });

  it('every permission is granted to at least one role by role', () => {
    const orphans = PERMISSIONS.filter((p) => grantedTo(p).length === 0);
    expect(orphans).toEqual([]);
  });

  it('role and leader lists hold only catalog strings, each at most once', () => {
    const lists: Array<[string, readonly string[]]> = [
      ...Object.entries(ROLE_PERMISSIONS),
      ...Object.entries(LIDER_PERMISSIONS).map(
        ([role, list]): [string, readonly string[]] => [`lider:${role}`, list ?? []],
      ),
    ];
    for (const [owner, list] of lists) {
      expect({ owner, unknown: list.filter((p) => !isPermission(p)) }).toEqual({ owner, unknown: [] });
      expect({ owner, unique: new Set(list).size }).toEqual({ owner, unique: list.length });
    }
  });

  it('isPermission rejects strings outside the catalog', () => {
    expect(isPermission('claims.read')).toBe(true);
    for (const s of ['', 'claims', 'claims.READ', 'claims.read ', 'carriers.attachments.read', 'toString']) {
      expect(isPermission(s)).toBe(false);
    }
  });
});

describe('roles', () => {
  it('ROLE_PERMISSIONS has exactly the eight roles, in RoleSchema.options order', () => {
    expect(Object.keys(ROLE_PERMISSIONS)).toEqual([...ROLES]);
  });

  it('the two role types (schemas/auth#Role, schemas/common#RoleSchema) are the same set', () => {
    expect([...Role.options].sort()).toEqual([...RoleSchema.options].sort());
  });

  it('LIDER_PERMISSIONS only names leader roles — and is the decided { planista: decide }', () => {
    const notLider = Object.keys(LIDER_PERMISSIONS).filter(
      (r) => !(LIDER_ROLES as readonly string[]).includes(r),
    );
    expect(notLider).toEqual([]);
    expect(LIDER_PERMISSIONS).toEqual({ planista: ['vehicles.planner_transfer.decide'] });
  });
});

describe('permissionsFor / hasPermission / hasAnyPermission', () => {
  it.each(ROLES)('%s: the leader flag only adds (permissionsFor(r, true) ⊇ permissionsFor(r, false))', (role) => {
    const plain = permissionsFor(role, false);
    const lider = new Set(permissionsFor(role, true));
    expect(plain.filter((p) => !lider.has(p))).toEqual([]);
  });

  it.each(ROLES)('%s: by role alone = ROLE_PERMISSIONS, in catalog order', (role) => {
    const plain = permissionsFor(role);
    expect([...plain].sort()).toEqual([...ROLE_PERMISSIONS[role]].sort());
    expect(plain).toEqual(PERMISSIONS.filter((p) => plain.includes(p)));
  });

  it('a leader planista gains exactly vehicles.planner_transfer.decide', () => {
    const plain = new Set(permissionsFor('planista'));
    expect(permissionsFor('planista', true).filter((p) => !plain.has(p))).toEqual([
      'vehicles.planner_transfer.decide',
    ]);
    expect(hasPermission('planista', 'vehicles.planner_transfer.decide')).toBe(false);
    expect(hasPermission('planista', 'vehicles.planner_transfer.decide', true)).toBe(true);
  });

  it('the flag is a no-op for roles without leader permissions', () => {
    for (const role of ROLES.filter((r) => r !== 'planista')) {
      expect(permissionsFor(role, true)).toEqual(permissionsFor(role, false));
    }
  });

  it('fails closed for a string that is not a role (e.g. an unverified edge claim)', () => {
    for (const bogus of ['lider_planista', 'constructor', '__proto__', '']) {
      expect(permissionsFor(bogus as Role, true)).toEqual([]);
      expect(hasAnyPermission(bogus as Role, [...PERMISSIONS], true)).toBe(false);
    }
  });

  it('hasAnyPermission is any-of; an empty requirement admits nobody', () => {
    expect(hasAnyPermission('opiekun', ['users.manage', 'carriers.read'])).toBe(true);
    expect(hasAnyPermission('opiekun', ['users.manage', 'audit.read'])).toBe(false);
    expect(hasAnyPermission('admin', [])).toBe(false);
  });
});

describe('rolesSatisfying (the B1/B2 equivalence helper)', () => {
  it('returns admitted roles in role order', () => {
    expect(rolesSatisfying(['km.read'])).toEqual([
      'admin',
      'opiekun',
      'planista',
      'dyspozytor',
      'przewoznik',
      'eksport',
      'weryfikator',
    ]);
    expect(rolesSatisfying(['delegations.cancel', 'delegations.mark_ready'])).toEqual([
      'admin',
      'przewoznik',
      'eksport',
    ]);
  });

  it('{ lider: true } counts a role whose leader variant satisfies — admin + planista on the decide routes', () => {
    expect(rolesSatisfying(['vehicles.planner_transfer.decide'])).toEqual(['admin']);
    expect(rolesSatisfying(['vehicles.planner_transfer.decide'], { lider: true })).toEqual([
      'admin',
      'planista',
    ]);
  });

  it('an empty requirement admits nobody', () => {
    expect(rolesSatisfying([], { lider: true })).toEqual([]);
  });
});

describe('decided assignments without a route of their own', () => {
  // Service capabilities (docs/25 §1.2) — B3 swaps the role checks for these.
  it.each<[Permission, string[]]>([
    // claims.service `_assertMayVerifyInStatus` (422 CLAIM_VERIFY_ADMIN_ONLY)
    ['claims.verify_pending_authorization', ['admin']],
    // vehicles.service `_scrubForViewer`
    ['vehicles.fuel_card.read', ['admin', 'opiekun', 'przewoznik']],
    // vehicles.service `_scrubForViewer` (vehicle card: admin/opiekun/planista/
    // przewoznik) + delegations.service `_scrubVehicleRates` (modal: everyone
    // but dyspozytor, docs/14 §6.4.1) — eksport/weryfikator only reach the modal.
    ['vehicles.rates.read', ['admin', 'opiekun', 'planista', 'przewoznik', 'eksport', 'weryfikator']],
    // bugbot-handoff.service `_assertKindAllowed` — kind=idea
    ['bugbot.submit_idea', ['admin']],
  ])('%s → %j', (permission, roles) => {
    expect(grantedTo(permission)).toEqual(roles);
  });

  it('carrier documents: admin + opiekun by role, przewoznik nothing by role (B6 grants read/add)', () => {
    for (const p of ['carrier_documents.read', 'carrier_documents.add', 'carrier_documents.delete'] as const) {
      expect(grantedTo(p, true)).toEqual(['admin', 'opiekun']);
    }
  });

  it('claims.read has no opiekun (2026-10-22)', () => {
    expect(grantedTo('claims.read', true)).toEqual(['admin', 'pracownik', 'przewoznik']);
  });

  it('admin is not "every permission": no wniosek / outing filing, no carrier panel', () => {
    const missing = PERMISSIONS.filter((p) => !hasPermission('admin', p, true));
    expect(missing).toEqual(['claims.submit', 'delegations.create', 'panel.carrier']);
  });

  it('admin files planner-transfer requests too (docs/29 U1 reversed 2026-10-23)', () => {
    expect(grantedTo('vehicles.planner_transfer.request')).toEqual(['admin', 'opiekun', 'planista']);
  });
});

// ─── Per-user overrides (docs/25 §3 B6) ────────────────────

const DOCS_READ: Permission = 'carrier_documents.read';
const DOCS_ADD: Permission = 'carrier_documents.add';
const DOCS_DELETE: Permission = 'carrier_documents.delete';

describe('GRANTABLE_EXTRA (B6)', () => {
  it('is the decided first case: przewoznik → carrier_documents.read / .add', () => {
    expect(GRANTABLE_EXTRA).toEqual({ przewoznik: [DOCS_READ, DOCS_ADD] });
  });

  it('carrier_documents.delete is never grantable to przewoznik', () => {
    expect(grantableExtraFor('przewoznik')).not.toContain(DOCS_DELETE);
  });

  it('keys are roles; entries are catalog strings, each at most once', () => {
    for (const [role, list] of Object.entries(GRANTABLE_EXTRA)) {
      expect((ROLES as readonly string[]).includes(role)).toBe(true);
      expect((list ?? []).filter((p) => !isPermission(p))).toEqual([]);
      expect(new Set(list).size).toBe((list ?? []).length);
    }
  });

  it.each(ROLES)('%s: no grantable right is already held by role (leader included)', (role) => {
    const held = new Set(permissionsFor(role, true));
    expect(grantableExtraFor(role).filter((p) => held.has(p))).toEqual([]);
  });

  it('grantableExtraFor: catalog order; nothing for a role without an entry or a non-role', () => {
    expect(grantableExtraFor('przewoznik')).toEqual([DOCS_READ, DOCS_ADD]);
    for (const role of ROLES.filter((r) => r !== 'przewoznik')) {
      expect(grantableExtraFor(role)).toEqual([]);
    }
    for (const bogus of ['__proto__', 'constructor', 'toString', '']) {
      expect(grantableExtraFor(bogus as Role)).toEqual([]);
    }
  });
});

describe('revocablePermissionsFor (B6)', () => {
  it('admin can never be denied anything (decision Q4)', () => {
    expect(revocablePermissionsFor('admin', false)).toEqual([]);
    expect(revocablePermissionsFor('admin', true)).toEqual([]);
  });

  it.each(ROLES.filter((r) => r !== 'admin'))('%s: the base set, leader flag included', (role) => {
    expect(revocablePermissionsFor(role, false)).toEqual(permissionsFor(role, false));
    expect(revocablePermissionsFor(role, true)).toEqual(permissionsFor(role, true));
  });
});

describe('DEPENDENT_PERMISSIONS (B6)', () => {
  const entries = Object.entries(DEPENDENT_PERMISSIONS) as Array<[Permission, readonly Permission[]]>;

  it('holds only catalog strings, no self-dependency, no duplicate', () => {
    for (const [right, needs] of entries) {
      expect(isPermission(right)).toBe(true);
      expect(needs.filter((p) => !isPermission(p))).toEqual([]);
      expect(needs).not.toContain(right);
      expect(new Set(needs).size).toBe(needs.length);
    }
  });

  it('is acyclic', () => {
    const state = new Map<Permission, 'visiting' | 'done'>();
    const cycles: string[] = [];
    const visit = (p: Permission, path: Permission[]): void => {
      if (state.get(p) === 'done') return;
      if (state.get(p) === 'visiting') {
        cycles.push([...path, p].join(' → '));
        return;
      }
      state.set(p, 'visiting');
      for (const next of DEPENDENT_PERMISSIONS[p] ?? []) visit(next, [...path, p]);
      state.set(p, 'done');
    };
    for (const p of PERMISSIONS) visit(p, []);
    expect(cycles).toEqual([]);
  });

  it('pins the decided edges', () => {
    expect(DEPENDENT_PERMISSIONS['claims.verify']).toEqual(['claims.read']);
    expect(DEPENDENT_PERMISSIONS['claims.verify_pending_authorization']).toEqual(['claims.verify']);
    expect(DEPENDENT_PERMISSIONS['claims.submit']).toEqual(['claims.read']);
    expect(DEPENDENT_PERMISSIONS[DOCS_ADD]).toEqual([DOCS_READ]);
    expect(DEPENDENT_PERMISSIONS[DOCS_DELETE]).toEqual([DOCS_READ]);
    expect(DEPENDENT_PERMISSIONS['km.verify']).toEqual(['km.read']);
    expect(DEPENDENT_PERMISSIONS['gps.refresh']).toEqual(['gps.read']);
    expect(entries).toHaveLength(16);
  });

  it('permissionsDependingOn follows chains, in catalog order', () => {
    expect(permissionsDependingOn('claims.read')).toEqual([
      'claims.submit',
      'claims.verify',
      'claims.verify_pending_authorization',
    ]);
    expect(permissionsDependingOn(DOCS_READ)).toEqual([DOCS_ADD, DOCS_DELETE]);
    expect(permissionsDependingOn('vehicles.read')).toEqual([
      'vehicles.rates.read',
      'vehicles.fuel_card.read',
      'vehicles.planner_transfer.request',
      'vehicles.planner_transfer.decide',
      'vehicles.planner_history.read',
    ]);
    expect(permissionsDependingOn('delegations.read')).toEqual([
      'delegations.create',
      'delegations.cancel',
      'delegations.mark_ready',
      'delegations.transit',
    ]);
    expect(permissionsDependingOn('users.manage')).toEqual([]);
  });
});

describe('effectivePermissionsFor (B6)', () => {
  it.each(ROLES.flatMap((role) => [[role, false] as const, [role, true] as const]))(
    '%s (lider=%s) without overrides = permissionsFor(role, lider)',
    (role, lider) => {
      expect(effectivePermissionsFor(role, lider, [], [])).toEqual(permissionsFor(role, lider));
    },
  );

  it('a przewoznik granted read/add holds them on top of his role, in catalog order', () => {
    const got = effectivePermissionsFor('przewoznik', false, [DOCS_ADD, DOCS_READ], []);
    const expected = new Set<Permission>([...permissionsFor('przewoznik'), DOCS_READ, DOCS_ADD]);
    expect(got).toEqual(PERMISSIONS.filter((p) => expected.has(p)));
    expect(got).not.toContain(DOCS_DELETE);
  });

  it('a denial removes a base right', () => {
    const got = effectivePermissionsFor('opiekun', false, [], [DOCS_DELETE]);
    expect(got).toEqual(permissionsFor('opiekun').filter((p) => p !== DOCS_DELETE));
  });

  it('denied wins — even over an extra on a row that missed a prune', () => {
    expect(effectivePermissionsFor('przewoznik', false, [DOCS_READ], [DOCS_READ])).not.toContain(DOCS_READ);
  });

  it('extra side is filtered: a right outside GRANTABLE_EXTRA[role] never widens access', () => {
    expect(effectivePermissionsFor('przewoznik', false, [DOCS_DELETE, 'users.manage'], [])).toEqual(
      permissionsFor('przewoznik'),
    );
    expect(effectivePermissionsFor('planista', false, ['claims.verify', DOCS_READ], [])).toEqual(
      permissionsFor('planista'),
    );
    expect(effectivePermissionsFor('admin', false, ['claims.submit', 'panel.carrier'], [])).toEqual(
      permissionsFor('admin'),
    );
  });

  it('denied side is filtered: a denial outside the base set has nothing to remove', () => {
    expect(effectivePermissionsFor('planista', false, [], ['users.manage', DOCS_READ])).toEqual(
      permissionsFor('planista'),
    );
  });

  it('strings outside the catalog are inert on both sides', () => {
    expect(
      effectivePermissionsFor('przewoznik', false, ['carriers.attachments.read', ''], ['claims', 'KM.READ']),
    ).toEqual(permissionsFor('przewoznik'));
  });

  it('duplicates and input order do not matter', () => {
    expect(effectivePermissionsFor('przewoznik', false, [DOCS_ADD, DOCS_READ, DOCS_ADD], [])).toEqual(
      effectivePermissionsFor('przewoznik', false, [DOCS_READ, DOCS_ADD], []),
    );
  });

  it('the leader flag still applies under overrides', () => {
    const got = effectivePermissionsFor('planista', true, [], ['vehicles.planner_transfer.request']);
    expect(got).toContain('vehicles.planner_transfer.decide');
    expect(got).not.toContain('vehicles.planner_transfer.request');
  });

  it('fails closed for a non-role, extras included', () => {
    expect(effectivePermissionsFor('superadmin' as Role, true, [...PERMISSIONS], [])).toEqual([]);
  });

  it('returns a fresh array — mutating it cannot corrupt the permissionsFor cache', () => {
    const cached = [...permissionsFor('opiekun')];
    const got = effectivePermissionsFor('opiekun', false, [], []);
    got.length = 0;
    expect(permissionsFor('opiekun')).toEqual(cached);
  });
});

describe('pruneOverrides (B6)', () => {
  it('keeps what still fits, deduplicated, in catalog order — nothing removed', () => {
    expect(pruneOverrides('przewoznik', false, [DOCS_ADD, DOCS_READ, DOCS_ADD], ['delegations.cancel'])).toEqual({
      extra: [DOCS_READ, DOCS_ADD],
      denied: ['delegations.cancel'],
      removed: { extra: [], denied: [] },
    });
  });

  it('role change: denials the new role does not have are dropped', () => {
    expect(pruneOverrides('planista', false, [], [DOCS_DELETE, 'vehicles.read'])).toEqual({
      extra: [],
      denied: ['vehicles.read'],
      removed: { extra: [], denied: [DOCS_DELETE] },
    });
  });

  it('leader loss: a denied leader right is dropped with the flag', () => {
    const decide: Permission = 'vehicles.planner_transfer.decide';
    expect(pruneOverrides('planista', true, [], [decide]).removed.denied).toEqual([]);
    expect(pruneOverrides('planista', false, [], [decide])).toEqual({
      extra: [],
      denied: [],
      removed: { extra: [], denied: [decide] },
    });
  });

  it('admin: every denial is dropped (decision Q4)', () => {
    expect(pruneOverrides('admin', false, [], ['users.manage', 'claims.read'])).toEqual({
      extra: [],
      denied: [],
      removed: { extra: [], denied: ['users.manage', 'claims.read'] },
    });
  });

  it('extras the role may not be granted are dropped', () => {
    expect(pruneOverrides('pracownik', false, [DOCS_READ], [])).toEqual({
      extra: [],
      denied: [],
      removed: { extra: [DOCS_READ], denied: [] },
    });
  });

  it('an extra that is also denied is dropped (it never took effect), and so is the denial', () => {
    expect(pruneOverrides('przewoznik', false, [DOCS_READ, DOCS_ADD], [DOCS_READ])).toEqual({
      extra: [DOCS_ADD],
      denied: [],
      removed: { extra: [DOCS_READ], denied: [DOCS_READ] },
    });
  });

  it('unknown strings are dropped and reported once each, in input order', () => {
    expect(pruneOverrides('przewoznik', false, ['x.y', DOCS_READ, 'x.y'], ['zz', 'claims.read', 'zz'])).toEqual({
      extra: [DOCS_READ],
      denied: ['claims.read'],
      removed: { extra: ['x.y'], denied: ['zz'] },
    });
  });

  it('never changes what a non-admin row grants; on admin it only drops denials', () => {
    const samples: Array<[string[], string[]]> = [
      [[], []],
      [[DOCS_READ, DOCS_ADD], []],
      [[DOCS_READ, DOCS_DELETE, 'junk'], [DOCS_READ, 'claims.read']],
      [['users.manage'], ['vehicles.read', 'km.read', DOCS_DELETE]],
      [[...PERMISSIONS], [...PERMISSIONS].slice(0, 12)],
      [[DOCS_ADD], ['vehicles.planner_transfer.decide', 'panel.planista']],
    ];
    for (const role of ROLES) {
      for (const lider of [false, true]) {
        for (const [extra, denied] of samples) {
          const pruned = pruneOverrides(role, lider, extra, denied);
          const before = effectivePermissionsFor(role, lider, extra, denied);
          const after = effectivePermissionsFor(role, lider, pruned.extra, pruned.denied);
          if (role === 'admin') {
            expect(after).toEqual(permissionsFor('admin', lider));
          } else {
            expect({ role, lider, extra, denied, after }).toEqual({ role, lider, extra, denied, after: before });
          }
        }
      }
    }
  });
});

describe('packaging', () => {
  it('the barrel exports the catalog but not the docs matrix', () => {
    expect(shared.PERMISSIONS).toBe(PERMISSIONS);
    expect(typeof shared.permissionsFor).toBe('function');
    expect(typeof shared.rolesSatisfying).toBe('function');
    // B6
    expect(shared.GRANTABLE_EXTRA).toBe(GRANTABLE_EXTRA);
    expect(shared.DEPENDENT_PERMISSIONS).toBe(DEPENDENT_PERMISSIONS);
    expect(typeof shared.effectivePermissionsFor).toBe('function');
    expect(typeof shared.pruneOverrides).toBe('function');
    expect('renderPermissionMatrix' in shared).toBe(false);
    expect('PERMISSION_DESCRIPTIONS' in shared).toBe(false);
  });

  it('permissions.ts imports types only — no zod at runtime (edge middleware imports it)', () => {
    const source = readFileSync(resolve(__dirname, '../src/permissions.ts'), 'utf8');
    const imports = source.split(/\r?\n/).filter((line) => /^\s*import\s/.test(line));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((line) => !/^\s*import\s+type\s/.test(line))).toEqual([]);
    expect(source).not.toMatch(/\brequire\(/);
  });
});

describe('docs/03 matrix', () => {
  it('every permission has a description', () => {
    const empty = PERMISSIONS.filter((p) => !PERMISSION_DESCRIPTIONS[p]?.trim());
    expect(empty).toEqual([]);
  });

  it('renders one row per permission, a lider sub-row only where LIDER_PERMISSIONS adds one', () => {
    const lines = renderPermissionMatrix().split('\n');
    const liderRows = lines.filter((l) => l.startsWith('| ↳ + lider |'));
    expect(lines[0]).toBe(`| Permission | ${ROLES.join(' | ')} | Покрывает |`);
    expect(liderRows).toHaveLength(1);
    expect(lines).toHaveLength(2 + PERMISSIONS.length + liderRows.length);
    const decideRow = lines.findIndex((l) => l.startsWith('| `vehicles.planner_transfer.decide` |'));
    expect(lines[decideRow + 1]).toBe(liderRows[0]);
  });

  it('docs/03-roles.md carries exactly renderPermissionMatrix() between the markers', () => {
    const doc = readFileSync(DOCS_03, 'utf8').replace(/\r\n/g, '\n');
    const start = doc.indexOf(MATRIX_START);
    const end = doc.indexOf(MATRIX_END);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(doc.indexOf(MATRIX_START, start + 1)).toBe(-1);
    const embedded = doc.slice(start + MATRIX_START.length, end).trim();
    // Out of date? `npm run -s authz:matrix -w @magguarantee/shared` and paste.
    expect(embedded).toBe(renderPermissionMatrix());
  });
});
