// docs/14 A.5 / A.12 — every catalog permission has a domain and a PL/EN label,
// domains follow the catalog sections, labels follow the convention.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { describe, expect, it } from 'vitest';

import {
  PERMISSION_GROUPS,
  groupPermissions,
  permissionGroupKey,
  permissionGroupOf,
  permissionLabelKey,
  sortPermissions,
} from './permissionGroups';
import { PERMISSIONS, type Permission } from './permissions';

type Messages = { [key: string]: string | Messages };

function load(locale: 'pl' | 'en'): Messages {
  const file = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
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

const LOCALES = ['pl', 'en'] as const;

// Given verbatim by docs/14 A.12 although it is 47 characters long.
const LENGTH_EXEMPT: readonly Permission[] = ['claims.verify_pending_authorization'];

describe('permission domains (A.5)', () => {
  it('the catalog has 45 permissions', () => {
    expect(PERMISSIONS).toHaveLength(45);
  });

  it.each(PERMISSIONS)('%s has a domain', (p) => {
    expect(permissionGroupOf(p)).toBeDefined();
  });

  it('a prefix belongs to one domain only', () => {
    const prefixes = PERMISSION_GROUPS.flatMap((g) => g.prefixes);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('every domain owns at least one permission', () => {
    for (const g of PERMISSION_GROUPS) {
      expect(PERMISSIONS.some((p) => permissionGroupOf(p) === g.id)).toBe(true);
    }
  });

  it('domains are contiguous catalog sections, in catalog order', () => {
    const sequence = PERMISSIONS.map((p) => permissionGroupOf(p));
    const runs = sequence.filter((g, i) => i === 0 || g !== sequence[i - 1]);
    expect(runs).toEqual(PERMISSION_GROUPS.map((g) => g.id));
  });

  it('sortPermissions = catalog order, deduplicated', () => {
    expect(sortPermissions(['km.read', 'claims.read', 'km.read', 'audit.read'])).toEqual([
      'claims.read',
      'km.read',
      'audit.read',
    ]);
  });

  it('groupPermissions keeps only non-empty domains, in domain order', () => {
    expect(groupPermissions(['km.verify', 'claims.read', 'vehicles.read', 'km.read'])).toEqual([
      { group: 'claims', permissions: ['claims.read'] },
      { group: 'fleet', permissions: ['vehicles.read'] },
      { group: 'delegations', permissions: ['km.read', 'km.verify'] },
    ]);
    expect(groupPermissions([])).toEqual([]);
  });
});

describe.each(LOCALES)('permission labels — %s', (locale) => {
  const messages = load(locale);
  const t = createTranslator({
    locale,
    messages: messages as AbstractIntlMessages,
    namespace: 'permissions',
    onError: (error) => {
      throw error;
    },
  });

  it.each(PERMISSIONS)('%s has a label', (p) => {
    const raw = lookup(messages, `permissions.${permissionLabelKey(p)}`);
    expect(typeof raw).toBe('string');
    expect(t(permissionLabelKey(p))).not.toBe(p);
  });

  it('labels follow the convention: ≤ 45 chars, capitalised, no final dot, not an id', () => {
    for (const p of PERMISSIONS) {
      const label = t(permissionLabelKey(p));
      if (!LENGTH_EXEMPT.includes(p)) expect(label.length, p).toBeLessThanOrEqual(45);
      expect(label[0], p).toBe(label[0]?.toUpperCase());
      expect(label.endsWith('.'), p).toBe(false);
      expect(label.includes('_'), p).toBe(false);
    }
  });

  it('no two permissions share a label', () => {
    const labels = PERMISSIONS.map((p) => t(permissionLabelKey(p)));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('the label tree has no keys outside the catalog', () => {
    const flatten = (node: Messages, prefix: string): string[] =>
      Object.entries(node).flatMap(([k, v]) =>
        typeof v === 'string' ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`),
      );
    const labels = lookup(messages, 'permissions.labels') as Messages;
    expect(flatten(labels, '').sort()).toEqual([...PERMISSIONS].sort());
  });

  it('every domain heading and the leader suffix exist', () => {
    for (const g of PERMISSION_GROUPS) {
      expect(typeof lookup(messages, `permissions.${permissionGroupKey(g.id)}`)).toBe('string');
    }
    expect(typeof lookup(messages, 'permissions.liderSuffix')).toBe('string');
  });

  it('the labels docs/14 A.12 gives verbatim', () => {
    const given: Partial<Record<Permission, [string, string]>> = {
      'carrier_documents.read': ['Podgląd dokumentów firmy i floty', 'View company and fleet documents'],
      'carrier_documents.add': ['Dodawanie dokumentów firmy', 'Upload company documents'],
      'carrier_documents.delete': ['Usuwanie dokumentów firmy', 'Delete company documents'],
      'claims.read': ['Podgląd wniosków', 'View claims'],
      'claims.verify': ['Weryfikacja wniosków', 'Verify claims'],
      'claims.verify_pending_authorization': [
        'Weryfikacja wniosków czekających na autoryzację',
        'Verify claims awaiting authorisation',
      ],
      'dashboard.read': ['Podgląd pulpitu', 'View dashboard'],
      'vehicles.rates.read': ['Podgląd stawek ciągnika', 'View vehicle rates'],
      'vehicles.fuel_card.read': ['Podgląd karty paliwowej', 'View fuel card'],
      'fleet.write': ['Edycja floty (ciągniki, kierowcy, naczepy)', 'Edit fleet (vehicles, drivers, trailers)'],
      'km.verify': ['Weryfikacja przebiegu dziennego', 'Verify daily mileage'],
      'panel.opiekun': ['Panel opiekuna', 'Carrier-success manager panel'],
    };
    for (const [p, [pl, en]] of Object.entries(given) as [Permission, [string, string]][]) {
      expect(t(permissionLabelKey(p))).toBe(locale === 'pl' ? pl : en);
    }
  });
});
