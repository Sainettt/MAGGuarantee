import { describe, expect, it } from 'vitest';
import { RoleSchema, type Role } from '@magguarantee/shared';

import {
  grantableExtraFor,
  permissionsFor,
  revocablePermissionsFor,
  type Permission,
} from '@/lib/auth/permissions';

import {
  applyDependents,
  deniedOptions,
  dependentsOf,
  droppedOnRoleChange,
  effectivePreview,
  extraOptions,
  isLiderPermission,
  overridesMarker,
  overridesPatch,
  overridesRole,
  requiredFor,
  toggleDenied,
  toggleExtra,
} from './permissionOverrides';

const ALL_ROLES: readonly Role[] = RoleSchema.options;
const NONE = { extra: [] as Permission[], denied: [] as Permission[] };

describe('overridesRole (A.3 — the W16 rule)', () => {
  it('local account → role', () => {
    expect(overridesRole({ role: 'pracownik', managedBy: 'local', roleOverride: 'opiekun' })).toBe(
      'pracownik',
    );
  });

  it('MAGSpace account → the hand-granted role when set, else role', () => {
    expect(overridesRole({ role: 'pracownik', managedBy: 'magspace', roleOverride: 'opiekun' })).toBe(
      'opiekun',
    );
    expect(overridesRole({ role: 'pracownik', managedBy: 'magspace', roleOverride: '' })).toBe(
      'pracownik',
    );
    expect(overridesRole({ role: 'pracownik', managedBy: 'magspace', roleOverride: null })).toBe(
      'pracownik',
    );
  });

  it('a carrier row is always przewoznik', () => {
    expect(overridesRole({ role: 'przewoznik', managedBy: 'magspace', roleOverride: 'opiekun' })).toBe(
      'przewoznik',
    );
  });
});

describe('extraOptions / deniedOptions (A.3 / A.4)', () => {
  it('only przewoznik may be granted anything: documents read + add, never delete', () => {
    expect(extraOptions('przewoznik', false)).toEqual([
      'carrier_documents.read',
      'carrier_documents.add',
    ]);
    for (const role of ALL_ROLES.filter((r) => r !== 'przewoznik')) {
      expect(extraOptions(role, false), role).toEqual([]);
      expect(extraOptions(role, true), role).toEqual([]);
    }
  });

  it('never offers an extra the role already holds', () => {
    for (const role of ALL_ROLES) {
      for (const lider of [false, true]) {
        const base = permissionsFor(role, lider);
        expect(extraOptions(role, lider).filter((p) => base.includes(p))).toEqual([]);
        expect(grantableExtraFor(role)).toEqual(expect.arrayContaining(extraOptions(role, lider)));
      }
    }
  });

  it('«Odebrane» = the role set (with the leader rights), nothing for admin', () => {
    expect(deniedOptions('admin', false)).toEqual([]);
    expect(deniedOptions('przewoznik', false)).toHaveLength(13);
    expect(deniedOptions('opiekun', false)).toHaveLength(20);
    expect(deniedOptions('planista', true)).toContain('vehicles.planner_transfer.decide');
    expect(deniedOptions('planista', false)).not.toContain('vehicles.planner_transfer.decide');
  });

  it('isLiderPermission marks rights that come from LIDER_PERMISSIONS only', () => {
    expect(isLiderPermission('planista', 'vehicles.planner_transfer.decide')).toBe(true);
    expect(isLiderPermission('planista', 'vehicles.read')).toBe(false);
    // admin holds `decide` by role, not by the flag.
    expect(isLiderPermission('admin', 'vehicles.planner_transfer.decide')).toBe(false);
  });
});

describe('requiredFor', () => {
  it('follows DEPENDENT_PERMISSIONS transitively', () => {
    expect(requiredFor('carrier_documents.add')).toEqual(['carrier_documents.read']);
    expect(requiredFor('claims.verify_pending_authorization')).toEqual([
      'claims.read',
      'claims.verify',
    ]);
    expect(requiredFor('claims.read')).toEqual([]);
  });
});

describe('toggleExtra (A.3 — dependencies both ways)', () => {
  const options = extraOptions('przewoznik', false);

  it('ticking `.add` ticks `.read` too and announces it', () => {
    expect(toggleExtra([], 'carrier_documents.add', true, options)).toEqual({
      extra: ['carrier_documents.read', 'carrier_documents.add'],
      autoAdded: ['carrier_documents.read'],
      autoRemoved: [],
    });
  });

  it('ticking `.add` with `.read` already ticked announces nothing', () => {
    expect(
      toggleExtra(['carrier_documents.read'], 'carrier_documents.add', true, options),
    ).toEqual({
      extra: ['carrier_documents.read', 'carrier_documents.add'],
      autoAdded: [],
      autoRemoved: [],
    });
  });

  it('clearing `.read` clears `.add` and announces it', () => {
    expect(
      toggleExtra(
        ['carrier_documents.read', 'carrier_documents.add'],
        'carrier_documents.read',
        false,
        options,
      ),
    ).toEqual({ extra: [], autoAdded: [], autoRemoved: ['carrier_documents.add'] });
  });

  it('clearing `.add` keeps `.read`', () => {
    expect(
      toggleExtra(
        ['carrier_documents.read', 'carrier_documents.add'],
        'carrier_documents.add',
        false,
        options,
      ),
    ).toEqual({ extra: ['carrier_documents.read'], autoAdded: [], autoRemoved: [] });
  });

  it('ticking `.read` alone adds nothing else', () => {
    expect(toggleExtra([], 'carrier_documents.read', true, options).extra).toEqual([
      'carrier_documents.read',
    ]);
  });

  it('leaves entries outside the options (dropped by a role change) alone', () => {
    const result = toggleExtra(['claims.verify'], 'carrier_documents.read', true, options);
    expect(result.extra).toEqual(['claims.verify', 'carrier_documents.read']);
  });
});

describe('toggleDenied', () => {
  it('adds / removes without side effects, in catalog order', () => {
    expect(toggleDenied(['km.read'], 'claims.read', true)).toEqual(['claims.read', 'km.read']);
    expect(toggleDenied(['claims.read', 'km.read'], 'claims.read', false)).toEqual(['km.read']);
    expect(toggleDenied(['claims.read'], 'claims.read', true)).toEqual(['claims.read']);
  });
});

describe('droppedOnRoleChange (A.7)', () => {
  it('without overrides nothing is kept or dropped — for every role × lider', () => {
    for (const role of ALL_ROLES) {
      for (const lider of [false, true]) {
        expect(droppedOnRoleChange(role, lider, NONE)).toEqual({ kept: NONE, dropped: NONE });
      }
    }
  });

  it('a carrier keeps his document grant', () => {
    const full = { extra: ['carrier_documents.read', 'carrier_documents.add'] as Permission[], denied: [] };
    expect(droppedOnRoleChange('przewoznik', false, full)).toEqual({ kept: full, dropped: NONE });
  });

  it('another role drops the grant; switching back brings it back (computed, not erased)', () => {
    const full = {
      extra: ['carrier_documents.read', 'carrier_documents.add'] as Permission[],
      denied: ['claims.read'] as Permission[],
    };
    expect(droppedOnRoleChange('pracownik', false, full)).toEqual({
      kept: { extra: [], denied: ['claims.read'] },
      dropped: { extra: ['carrier_documents.read', 'carrier_documents.add'], denied: [] },
    });
    expect(droppedOnRoleChange('przewoznik', false, full).dropped).toEqual(NONE);
  });

  it('drops denials the new role does not grant', () => {
    const full = { extra: [], denied: ['claims.verify', 'claims.read'] as Permission[] };
    expect(droppedOnRoleChange('przewoznik', false, full)).toEqual({
      kept: { extra: [], denied: ['claims.read'] },
      dropped: { extra: [], denied: ['claims.verify'] },
    });
  });

  it('admin drops every denial', () => {
    const full = { extra: [], denied: ['claims.read', 'claims.verify'] as Permission[] };
    expect(droppedOnRoleChange('admin', false, full)).toEqual({
      kept: NONE,
      dropped: { extra: [], denied: ['claims.read', 'claims.verify'] },
    });
  });

  it('clearing the leader flag drops a denied leader right', () => {
    const full = { extra: [], denied: ['vehicles.planner_transfer.decide'] as Permission[] };
    expect(droppedOnRoleChange('planista', true, full).dropped).toEqual(NONE);
    expect(droppedOnRoleChange('planista', false, full).dropped).toEqual({
      extra: [],
      denied: ['vehicles.planner_transfer.decide'],
    });
  });

  it('the kept lists always pass the api checks (assertOverridesFit) — every role × lider', () => {
    const everything = { extra: [...grantableExtraFor('przewoznik')], denied: [...permissionsFor('admin')] };
    for (const role of ALL_ROLES) {
      for (const lider of [false, true]) {
        const { kept } = droppedOnRoleChange(role, lider, everything);
        const grantable = grantableExtraFor(role);
        const revocable = revocablePermissionsFor(role, lider);
        expect(kept.extra.every((p) => grantable.includes(p)), role).toBe(true);
        expect(kept.denied.every((p) => revocable.includes(p)), role).toBe(true);
      }
    }
  });
});

describe('effectivePreview (A.6)', () => {
  it('without overrides = permissionsFor, all from the role — every role × lider', () => {
    for (const role of ALL_ROLES) {
      for (const lider of [false, true]) {
        const preview = effectivePreview(role, lider, NONE);
        expect(preview.map((e) => e.permission)).toEqual(permissionsFor(role, lider));
        expect(preview.every((e) => e.source === 'role')).toBe(true);
      }
    }
  });

  it('marks extras and removes denials, in catalog order', () => {
    const preview = effectivePreview('przewoznik', false, {
      extra: ['carrier_documents.read', 'carrier_documents.add'],
      denied: ['claims.submit'],
    });
    expect(preview).toHaveLength(13 + 2 - 1);
    expect(preview.filter((e) => e.source === 'extra').map((e) => e.permission)).toEqual([
      'carrier_documents.read',
      'carrier_documents.add',
    ]);
    expect(preview.map((e) => e.permission)).not.toContain('claims.submit');
    expect(preview.map((e) => e.permission).slice(0, 3)).toEqual([
      'claims.read',
      'carrier_documents.read',
      'carrier_documents.add',
    ]);
  });

  it('everything revoked → empty', () => {
    expect(
      effectivePreview('dyspozytor', false, { extra: [], denied: [...permissionsFor('dyspozytor')] }),
    ).toEqual([]);
  });
});

describe('dependentsOf / applyDependents (A.4 «Odbierz również»)', () => {
  it('lists the still-effective dependents of a revoked right', () => {
    const effective = permissionsFor('pracownik');
    expect(dependentsOf('claims.read', effective)).toEqual(['claims.verify']);
    expect(dependentsOf('dashboard.read', effective)).toEqual([]);
    expect(dependentsOf('claims.read', ['claims.read'])).toEqual([]);
  });

  it('the hint for a carrier vehicle revocation names the vehicle-card rights', () => {
    const effective = permissionsFor('przewoznik');
    expect(dependentsOf('vehicles.read', effective)).toEqual([
      'vehicles.rates.read',
      'vehicles.fuel_card.read',
    ]);
  });

  it('applying revokes the dependents too, after which there is no hint', () => {
    const next = applyDependents('pracownik', false, { extra: [], denied: ['claims.read'] }, 'claims.read');
    expect(next).toEqual({ extra: [], denied: ['claims.read', 'claims.verify'] });
    const effective = effectivePreview('pracownik', false, next).map((e) => e.permission);
    expect(dependentsOf('claims.read', effective)).toEqual([]);
  });

  it('includes leader rights (a lider planista revoking vehicles.read)', () => {
    const next = applyDependents('planista', true, { extra: [], denied: ['vehicles.read'] }, 'vehicles.read');
    expect(next.denied).toEqual([
      'vehicles.read',
      'vehicles.rates.read',
      'vehicles.planner_transfer.request',
      'vehicles.planner_transfer.decide',
      'vehicles.planner_history.read',
    ]);
  });

  it('nothing to apply → the same state', () => {
    const full = { extra: [], denied: ['dashboard.read'] as Permission[] };
    expect(applyDependents('pracownik', false, full, 'dashboard.read')).toBe(full);
  });
});

describe('overridesPatch (A.7 — only what changed)', () => {
  const stored = {
    extraPermissions: ['carrier_documents.read'] as Permission[],
    deniedPermissions: [] as Permission[],
  };

  it('unchanged → nothing is sent', () => {
    expect(overridesPatch({ extra: ['carrier_documents.read'], denied: [] }, stored)).toEqual({});
  });

  it('a changed list is sent whole; the other one is not', () => {
    expect(
      overridesPatch(
        { extra: ['carrier_documents.read', 'carrier_documents.add'], denied: [] },
        stored,
      ),
    ).toEqual({ extraPermissions: ['carrier_documents.read', 'carrier_documents.add'] });
    expect(
      overridesPatch({ extra: ['carrier_documents.read'], denied: ['claims.submit'] }, stored),
    ).toEqual({ deniedPermissions: ['claims.submit'] });
  });

  it('clearing sends []', () => {
    expect(overridesPatch(NONE, stored)).toEqual({ extraPermissions: [] });
  });

  it('order does not count as a change', () => {
    expect(
      overridesPatch(
        { extra: [], denied: ['km.read', 'claims.read'] },
        { extraPermissions: [], deniedPermissions: ['claims.read', 'km.read'] },
      ),
    ).toEqual({});
  });
});

describe('overridesMarker (A.11)', () => {
  it('hides the zero part', () => {
    expect(overridesMarker(0, 0)).toBeNull();
    expect(overridesMarker(1, 0)).toBe('+1');
    expect(overridesMarker(0, 2)).toBe('−2');
    expect(overridesMarker(1, 2)).toBe('+1 −2');
  });
});
