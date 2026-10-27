// `effectivePermissions` / `toPermissionList` / `storedOverrideList` (docs/25
// §3 B4, B6). The strategy (`AuthUser.permissions`) and the wire
// (`UserDto.permissions`) both go through here, so this spec pins:
//   - the invariant of B6: a user WITHOUT overrides gets exactly
//     `permissionsFor(role, lider)`, for every role and both flag values;
//   - the override formula — `(base ∪ (extra ∩ GRANTABLE_EXTRA[role])) − denied`,
//     denial wins, both sides filtered, catalog order;
//   - unknown stored values: ignored, warned once per (userId, value).

import { Logger } from '@nestjs/common';

import { PERMISSIONS, permissionsFor, Role, type Permission } from '@magguarantee/shared';

import {
  effectivePermissions,
  storedOverrideList,
  toPermissionList,
  type PermissionSubject,
} from './effective-permissions';

const ROLES = Role.options;
const DOCS_READ: Permission = 'carrier_documents.read';
const DOCS_ADD: Permission = 'carrier_documents.add';
const DOCS_DELETE: Permission = 'carrier_documents.delete';

let nextId = 0;

/** A subject without overrides unless given; a fresh id per call (the warn dedupe keys on it). */
function subject(
  role: Role,
  over: Partial<Omit<PermissionSubject, 'role'>> = {},
): PermissionSubject {
  nextId += 1;
  return {
    id: `u-${nextId}`,
    role,
    lider: false,
    extraPermissions: [],
    deniedPermissions: [],
    ...over,
  };
}

describe('effectivePermissions — without overrides (the B6 invariant)', () => {
  it.each(ROLES.flatMap((role) => [[role, false] as const, [role, true] as const]))(
    '%s (lider=%s) = permissionsFor(role, lider)',
    (role, lider) => {
      expect([...effectivePermissions(subject(role, { lider }))]).toEqual(permissionsFor(role, lider));
    },
  );

  it('the leader flag is what grants vehicles.planner_transfer.decide to a planista', () => {
    const decide: Permission = 'vehicles.planner_transfer.decide';
    expect(effectivePermissions(subject('planista', { lider: false })).has(decide)).toBe(false);
    expect(effectivePermissions(subject('planista', { lider: true })).has(decide)).toBe(true);
  });

  it('returns a fresh set per call — one request cannot leak into another', () => {
    const user = subject('admin');
    const a = effectivePermissions(user);
    const b = effectivePermissions(user);
    expect(a).not.toBe(b);
    expect([...a]).toEqual([...b]);
  });

  it('fails closed on a string that is not a role — extras included', () => {
    const forged = subject('superadmin' as unknown as Role, {
      lider: true,
      extraPermissions: [DOCS_READ, DOCS_ADD],
    });
    expect(effectivePermissions(forged).size).toBe(0);
  });
});

describe('effectivePermissions — per-user overrides (B6)', () => {
  it('a przewoznik granted carrier_documents.read/.add holds them on top of his role', () => {
    const got = effectivePermissions(subject('przewoznik', { extraPermissions: [DOCS_READ, DOCS_ADD] }));
    expect(got.has(DOCS_READ)).toBe(true);
    expect(got.has(DOCS_ADD)).toBe(true);
    expect(got.has(DOCS_DELETE)).toBe(false);
    for (const p of permissionsFor('przewoznik')) expect(got.has(p)).toBe(true);
  });

  it('a denial removes a base right', () => {
    const got = effectivePermissions(subject('opiekun', { deniedPermissions: [DOCS_DELETE] }));
    expect([...got]).toEqual(permissionsFor('opiekun').filter((p) => p !== DOCS_DELETE));
  });

  it('denied wins — also over an extra on a row that missed a prune', () => {
    const got = effectivePermissions(
      subject('przewoznik', { extraPermissions: [DOCS_READ, DOCS_ADD], deniedPermissions: [DOCS_READ] }),
    );
    expect(got.has(DOCS_READ)).toBe(false);
    expect(got.has(DOCS_ADD)).toBe(true);
  });

  it('extra side filtered: a non-grantable right never widens access', () => {
    const planista = subject('planista', { extraPermissions: ['claims.verify', 'users.manage'] });
    const carrier = subject('przewoznik', { extraPermissions: [DOCS_DELETE] });
    expect([...effectivePermissions(planista)]).toEqual(permissionsFor('planista'));
    expect([...effectivePermissions(carrier)]).toEqual(permissionsFor('przewoznik'));
  });

  it('denied side filtered: a denial outside the base set changes nothing', () => {
    const got = effectivePermissions(subject('dyspozytor', { deniedPermissions: ['users.manage', DOCS_READ] }));
    expect([...got]).toEqual(permissionsFor('dyspozytor'));
  });

  it('lists in catalog order, whatever order the overrides are stored in', () => {
    const got = toPermissionList(
      effectivePermissions(subject('przewoznik', { extraPermissions: [DOCS_ADD, DOCS_READ] })),
    );
    expect(got).toEqual(PERMISSIONS.filter((p) => got.includes(p)));
  });
});

describe('effectivePermissions — unknown stored values', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('are ignored on both sides', () => {
    const got = effectivePermissions(
      subject('przewoznik', { extraPermissions: ['carriers.attachments.read'], deniedPermissions: ['KM.READ'] }),
    );
    expect([...got]).toEqual(permissionsFor('przewoznik'));
  });

  it('warn once per (userId, value) — not on every request', () => {
    const user = subject('przewoznik', {
      extraPermissions: ['gone.permission', DOCS_READ],
      deniedPermissions: ['gone.permission', 'other.gone'],
    });

    effectivePermissions(user);
    effectivePermissions(user);
    effectivePermissions(user);

    const calls = warn.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls).toEqual([
      { msg: 'unknown permission override ignored', userId: user.id, field: 'extraPermissions', value: 'gone.permission' },
      { msg: 'unknown permission override ignored', userId: user.id, field: 'deniedPermissions', value: 'other.gone' },
    ]);
  });

  it('another user with the same value is warned about separately', () => {
    effectivePermissions(subject('opiekun', { deniedPermissions: ['gone.permission'] }));
    effectivePermissions(subject('opiekun', { deniedPermissions: ['gone.permission'] }));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('a clean row warns about nothing', () => {
    effectivePermissions(subject('przewoznik', { extraPermissions: [DOCS_READ] }));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('toPermissionList', () => {
  it('lists the set in catalog order, whatever order it was built in', () => {
    const shuffled = new Set<Permission>(['users.manage', 'claims.read', 'audit.read']);
    expect(toPermissionList(shuffled)).toEqual(['claims.read', 'users.manage', 'audit.read']);
  });

  it('the full catalog round-trips to PERMISSIONS', () => {
    expect(toPermissionList(new Set(PERMISSIONS))).toEqual([...PERMISSIONS]);
  });

  it('an empty set lists nothing', () => {
    expect(toPermissionList(new Set())).toEqual([]);
  });

  it('never emits a value outside the catalog', () => {
    const polluted = new Set(['claims.read', 'not.a.permission']);
    expect(toPermissionList(polluted as ReadonlySet<string> as ReadonlySet<Permission>)).toEqual([
      'claims.read',
    ]);
  });

  it('returns a fresh array — mutating it cannot corrupt the permissionsFor cache', () => {
    const cached = [...permissionsFor('planista', true)];
    const list = toPermissionList(effectivePermissions(subject('planista', { lider: true })));
    list.length = 0;
    expect(permissionsFor('planista', true)).toEqual(cached);
  });

  it.each(ROLES)('round-trips effectivePermissions for %s with the catalog order', (role) => {
    for (const lider of [false, true]) {
      const listed = toPermissionList(effectivePermissions(subject(role, { lider })));
      expect(listed).toEqual(permissionsFor(role, lider));
    }
  });
});

describe('storedOverrideList (UserDtoFull)', () => {
  it('drops ids outside the catalog, deduplicates, catalog order — fit to the role is not judged', () => {
    expect(storedOverrideList([DOCS_ADD, 'gone.permission', DOCS_READ, DOCS_ADD, 'users.manage'])).toEqual([
      'carrier_documents.read',
      'carrier_documents.add',
      'users.manage',
    ]);
  });

  it('an empty list stays empty', () => {
    expect(storedOverrideList([])).toEqual([]);
  });
});
