import { describe, expect, it } from 'vitest';
import {
  AssignableRole,
  LIDER_ROLES,
  RoleSchema,
  type Role,
} from '@magguarantee/shared';

import {
  liderAfterRoleOverrideChange,
  liderCheckboxState,
  liderCreateValue,
  liderPatchValue,
  type LiderCheckboxState,
} from './liderCheckboxState';

const ALL_ROLES: readonly Role[] = RoleSchema.options;
const LIDER: readonly Role[] = LIDER_ROLES;
const NON_LIDER: readonly Role[] = ALL_ROLES.filter((r) => !LIDER.includes(r));
const OVERRIDES: readonly Role[] = AssignableRole.options;
const LIDER_OVERRIDES = OVERRIDES.filter((r) => LIDER.includes(r));
const NON_LIDER_OVERRIDES = OVERRIDES.filter((r) => !LIDER.includes(r));

const HIDDEN: LiderCheckboxState = { mode: 'hidden' };
const ENABLED: LiderCheckboxState = { mode: 'enabled' };
const MANAGED: LiderCheckboxState = { mode: 'disabled', reason: 'managed' };
const PENDING: LiderCheckboxState = { mode: 'disabled', reason: 'pendingSync' };

describe('liderCheckboxState', () => {
  it('fixture sanity: 5 leader roles, 3 others; overrides cover both kinds', () => {
    expect(LIDER).toHaveLength(5);
    expect(NON_LIDER).toEqual(
      expect.arrayContaining(['admin', 'przewoznik', 'weryfikator']),
    );
    expect(LIDER_OVERRIDES.length).toBeGreaterThan(0);
    expect(NON_LIDER_OVERRIDES).toContain('weryfikator');
  });

  describe('create', () => {
    it.each(LIDER)('%s → enabled', (role) => {
      expect(
        liderCheckboxState({ isEdit: false, managedBy: 'local', role, roleOverride: '' }),
      ).toEqual(ENABLED);
    });

    it.each(NON_LIDER)('%s → hidden', (role) => {
      expect(
        liderCheckboxState({ isEdit: false, managedBy: 'local', role, roleOverride: '' }),
      ).toEqual(HIDDEN);
    });

    it('ignores managedBy / roleOverride leftovers — a new account is local', () => {
      expect(
        liderCheckboxState({
          isEdit: false,
          managedBy: 'magspace',
          role: 'planista',
          roleOverride: 'weryfikator',
        }),
      ).toEqual(ENABLED);
    });
  });

  describe('edit, local (incl. switched to local in this edit)', () => {
    it.each(LIDER)('%s → enabled', (role) => {
      expect(
        liderCheckboxState({ isEdit: true, managedBy: 'local', role, roleOverride: '' }),
      ).toEqual(ENABLED);
    });

    it.each(NON_LIDER)('%s → hidden', (role) => {
      expect(
        liderCheckboxState({ isEdit: true, managedBy: 'local', role, roleOverride: '' }),
      ).toEqual(HIDDEN);
    });

    it('a stale override does not matter once the account is local', () => {
      expect(
        liderCheckboxState({
          isEdit: true,
          managedBy: 'local',
          role: 'weryfikator',
          roleOverride: 'planista',
        }),
      ).toEqual(HIDDEN);
      expect(
        liderCheckboxState({
          isEdit: true,
          managedBy: 'local',
          role: 'planista',
          roleOverride: 'weryfikator',
        }),
      ).toEqual(ENABLED);
    });
  });

  describe('edit, magspace without roleOverride (mapping owns the flag)', () => {
    it.each(LIDER)('%s → disabled (managed)', (role) => {
      expect(
        liderCheckboxState({ isEdit: true, managedBy: 'magspace', role, roleOverride: '' }),
      ).toEqual(MANAGED);
    });

    it.each(NON_LIDER)('%s → hidden', (role) => {
      expect(
        liderCheckboxState({ isEdit: true, managedBy: 'magspace', role, roleOverride: '' }),
      ).toEqual(HIDDEN);
    });
  });

  describe('edit, magspace with roleOverride', () => {
    it.each(
      LIDER.flatMap((role) => LIDER_OVERRIDES.map((o) => [role, o] as const)),
    )('role %s + override %s → enabled', (role, roleOverride) => {
      expect(
        liderCheckboxState({ isEdit: true, managedBy: 'magspace', role, roleOverride }),
      ).toEqual(ENABLED);
    });

    it.each(
      NON_LIDER.flatMap((role) => LIDER_OVERRIDES.map((o) => [role, o] as const)),
    )(
      'role %s + override %s → disabled (pendingSync, variant A)',
      (role, roleOverride) => {
        expect(
          liderCheckboxState({ isEdit: true, managedBy: 'magspace', role, roleOverride }),
        ).toEqual(PENDING);
      },
    );

    it.each(
      ALL_ROLES.flatMap((role) => NON_LIDER_OVERRIDES.map((o) => [role, o] as const)),
    )('role %s + override %s → hidden', (role, roleOverride) => {
      expect(
        liderCheckboxState({ isEdit: true, managedBy: 'magspace', role, roleOverride }),
      ).toEqual(HIDDEN);
    });
  });
});

describe('liderAfterRoleOverrideChange', () => {
  it.each([true, false])(
    'setting any override resets to false (stored %s)',
    (stored) => {
      for (const o of OVERRIDES) {
        expect(liderAfterRoleOverrideChange(o, stored)).toBe(false);
      }
    },
  );

  it.each([true, false])(
    'clearing the override restores the stored value (%s)',
    (stored) => {
      expect(liderAfterRoleOverrideChange('', stored)).toBe(stored);
    },
  );
});

describe('liderPatchValue', () => {
  it('enabled: sends only a change', () => {
    expect(liderPatchValue(ENABLED, true, true)).toBeUndefined();
    expect(liderPatchValue(ENABLED, false, false)).toBeUndefined();
    expect(liderPatchValue(ENABLED, true, false)).toBe(true);
    expect(liderPatchValue(ENABLED, false, true)).toBe(false);
  });

  it('enabled after a reset (lider → other leader role): the explicit false goes out', () => {
    // planista+lider → dyspozytor: the role select reset the form value.
    expect(liderPatchValue(ENABLED, false, true)).toBe(false);
  });

  it('hidden: a stored leader is cleared (leader → non-leader role)', () => {
    expect(liderPatchValue(HIDDEN, false, true)).toBe(false);
    // Even if the form value were somehow still true.
    expect(liderPatchValue(HIDDEN, true, true)).toBe(false);
  });

  it('hidden: nothing to send for a non-leader', () => {
    expect(liderPatchValue(HIDDEN, false, false)).toBeUndefined();
    expect(liderPatchValue(HIDDEN, true, false)).toBeUndefined();
  });

  it('disabled (managed): never sent — the mapping owns it', () => {
    expect(liderPatchValue(MANAGED, true, true)).toBeUndefined();
    expect(liderPatchValue(MANAGED, false, true)).toBeUndefined();
    expect(liderPatchValue(MANAGED, true, false)).toBeUndefined();
    expect(liderPatchValue(MANAGED, false, false)).toBeUndefined();
  });

  it('disabled (pendingSync): the flag cannot be set yet', () => {
    expect(liderPatchValue(PENDING, true, false)).toBeUndefined();
    expect(liderPatchValue(PENDING, false, false)).toBeUndefined();
    expect(liderPatchValue(PENDING, false, true)).toBe(false);
  });
});

describe('liderCreateValue', () => {
  it('uses the ticked value only when the checkbox is usable', () => {
    expect(liderCreateValue(ENABLED, true)).toBe(true);
    expect(liderCreateValue(ENABLED, false)).toBe(false);
    expect(liderCreateValue(HIDDEN, true)).toBe(false);
    expect(liderCreateValue(MANAGED, true)).toBe(false);
    expect(liderCreateValue(PENDING, true)).toBe(false);
  });
});
