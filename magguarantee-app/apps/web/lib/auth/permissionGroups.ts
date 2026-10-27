// Permission labels and domain groups for the admin UI (docs/14 «UserSheet —
// blok „Uprawnienia indywidualne”» A.5 / A.12, docs/25 §3 B6).
//
// A permission is shown to a human by its LABEL, never by its id:
// `t(permissionLabelKey(p))` in the `permissions` namespace, where the key
// repeats the id as nested objects (`vehicles.rates.read` →
// `permissions.labels.vehicles.rates.read`). The domain of a permission comes
// from its id prefix; domains are listed in the order of the catalog sections
// of `PERMISSIONS`, so sorting by domain and sorting by catalog order agree
// (`permissionGroups.test.ts` pins both, plus a domain and a PL/EN label for
// every catalog id).

import { PERMISSIONS, type Permission } from './permissions';

export type PermissionGroupId =
  | 'claims'
  | 'carriers'
  | 'fleet'
  | 'delegations'
  | 'panels'
  | 'integrations'
  | 'administration';

/** Domain → the first id segments it owns, in catalog-section order. */
export const PERMISSION_GROUPS: readonly {
  id: PermissionGroupId;
  prefixes: readonly string[];
}[] = [
  { id: 'claims', prefixes: ['claims', 'dashboard'] },
  { id: 'carriers', prefixes: ['carriers', 'carrier_documents'] },
  { id: 'fleet', prefixes: ['vehicles', 'drivers', 'trailers', 'fleet', 'gps'] },
  { id: 'delegations', prefixes: ['delegations', 'km'] },
  { id: 'panels', prefixes: ['panel'] },
  { id: 'integrations', prefixes: ['lookups', 'integrations', 'bugbot'] },
  {
    id: 'administration',
    prefixes: ['users', 'sso', 'teams', 'trailer_types', 'limits', 'audit', 'diagnostics'],
  },
];

const GROUP_BY_PREFIX: ReadonlyMap<string, PermissionGroupId> = new Map(
  PERMISSION_GROUPS.flatMap((g) => g.prefixes.map((prefix) => [prefix, g.id] as const)),
);

/** The domain of `permission` (by its first id segment); `undefined` = unmapped (a test forbids it). */
export function permissionGroupOf(permission: Permission): PermissionGroupId | undefined {
  return GROUP_BY_PREFIX.get(permission.split('.')[0] ?? '');
}

/** next-intl key of the label, relative to the `permissions` namespace. */
export function permissionLabelKey(permission: Permission): `labels.${Permission}` {
  return `labels.${permission}`;
}

/** next-intl key of a domain heading, relative to the `permissions` namespace. */
export function permissionGroupKey(group: PermissionGroupId): `groups.${PermissionGroupId}` {
  return `groups.${group}`;
}

const CATALOG_INDEX: ReadonlyMap<Permission, number> = new Map(
  PERMISSIONS.map((p, i) => [p, i] as const),
);

/** `permissions` deduplicated, in catalog (= domain) order. */
export function sortPermissions(permissions: Iterable<Permission>): Permission[] {
  return [...new Set(permissions)].sort(
    (a, b) => (CATALOG_INDEX.get(a) ?? 0) - (CATALOG_INDEX.get(b) ?? 0),
  );
}

/**
 * `permissions` split by domain — only the non-empty domains, in domain
 * order, each list in catalog order (the «Odebrane» list of the user form).
 */
export function groupPermissions(
  permissions: Iterable<Permission>,
): { group: PermissionGroupId; permissions: Permission[] }[] {
  const sorted = sortPermissions(permissions);
  return PERMISSION_GROUPS.map((g) => ({
    group: g.id,
    permissions: sorted.filter((p) => permissionGroupOf(p) === g.id),
  })).filter((g) => g.permissions.length > 0);
}
