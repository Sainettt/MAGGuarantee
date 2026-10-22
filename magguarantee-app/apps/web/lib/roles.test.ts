// `roleLabelKey` (docs/28 — leaders): the label key for every role × lider
// flag, plus the guarantees that the local runtime mirror of `LIDER_ROLES`
// matches shared and that every key it can return exists in both bundles.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIDER_ROLES, RoleSchema, type Role } from '@magguarantee/shared';

import {
  LIDER_LABEL_ROLES,
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
// guarded on the client (`user.lider`), the rest by role here.
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
