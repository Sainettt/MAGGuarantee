// Permissions catalog (docs/25 §2, §3 B1; leader flag docs/28 §5).
//
// The route-level equivalence with today's `@Roles` lives in the api
// (`apps/api/src/common/authz/endpoint-permissions.spec.ts`, against the
// committed snapshot). Here: the catalog's own invariants, the decided
// assignments that no route pins (service capabilities, 2026-10-22/23
// decisions) and that docs/03 shows exactly what the code grants.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import * as shared from '../src';
import {
  LIDER_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasAnyPermission,
  hasPermission,
  isPermission,
  permissionsFor,
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

  it('{ lider: true } counts a role whose leader variant satisfies — @Roles(admin, planista) on decide', () => {
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

describe('packaging', () => {
  it('the barrel exports the catalog but not the docs matrix', () => {
    expect(shared.PERMISSIONS).toBe(PERMISSIONS);
    expect(typeof shared.permissionsFor).toBe('function');
    expect(typeof shared.rolesSatisfying).toBe('function');
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
