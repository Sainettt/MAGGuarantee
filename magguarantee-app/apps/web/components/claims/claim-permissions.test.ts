// Gating of «Przelicz wg aktualnych limitów» (§16.6 + §6.5.13), plus the
// docs/25 §3 B4 contract: the derivation now reads PERMISSIONS, and for every
// role × leader flag it must produce exactly what the former role-keyed
// version did.
//
// Mirrors the server: `claims.verify` on `POST /claims/:nrZgl/recalc-limits`
// + the `CLAIM_LIMITS_REFRESH_BLOCKED` gate that allows only `NA_WERYFIKACJI`.

import { describe, expect, it } from 'vitest';
import {
  ClaimStatusSchema,
  RoleSchema,
  type ClaimStatus,
  type Role,
} from '@magguarantee/shared';

import { permissionsFor, type Permission } from '@/lib/auth/permissions';

import {
  deriveClaimPermissions,
  type ClaimModalMode,
  type ClaimPermissions,
} from './claim-permissions';

const ALL_ROLES: readonly Role[] = RoleSchema.options;

const ALL_STATUSES: readonly ClaimStatus[] = ClaimStatusSchema.options;

const DECIDED: ClaimStatus[] = ['ZAAKCEPTOWANO', 'ODRZUCONO'];

/** What `/auth/me` sends for a role today (no overrides); `undefined` = loading. */
function perms(role: Role | undefined, lider = false): readonly Permission[] | undefined {
  return role === undefined ? undefined : permissionsFor(role, lider);
}

function show(role: Role | undefined, status: ClaimStatus, mode: ClaimModalMode = 'edit') {
  return deriveClaimPermissions({ permissions: perms(role), status, mode })
    .showRecalcLimitsButton;
}

describe('showRecalcLimitsButton', () => {
  it('is granted to admin and pracownik on a claim under verification', () => {
    expect(show('admin', 'NA_WERYFIKACJI')).toBe(true);
    expect(show('pracownik', 'NA_WERYFIKACJI')).toBe(true);
  });

  it('is REMOVED for every other role (never merely disabled)', () => {
    for (const role of ALL_ROLES) {
      if (role === 'admin' || role === 'pracownik') continue;
      expect(show(role, 'NA_WERYFIKACJI')).toBe(false);
    }
    expect(show(undefined, 'NA_WERYFIKACJI')).toBe(false);
  });

  it('is removed on decided wnioski — the amount is closed', () => {
    for (const status of DECIDED) {
      expect(show('admin', status)).toBe(false);
      expect(show('pracownik', status)).toBe(false);
    }
  });

  it('is removed while the amount is frozen for Maksim authorization', () => {
    expect(show('admin', 'OCZEKUJE_NA_AUTORYZACJE')).toBe(false);
    expect(show('pracownik', 'OCZEKUJE_NA_AUTORYZACJE')).toBe(false);
  });

  it('is removed in read-only view mode (a write needs edit mode)', () => {
    expect(show('admin', 'NA_WERYFIKACJI', 'view')).toBe(false);
  });

  it('does not disturb the other permission flags', () => {
    const result = deriveClaimPermissions({
      permissions: perms('pracownik'),
      status: 'NA_WERYFIKACJI',
      mode: 'edit',
    });
    expect(result.factsEditable).toBe(true);
    expect(result.showVerifyButton).toBe(true);
  });
});

describe('the OCZEKUJE_NA_AUTORYZACJE split (§6.5.13)', () => {
  it('admin (`claims.verify_pending_authorization`) keeps editable facts + verify', () => {
    const result = deriveClaimPermissions({
      permissions: perms('admin'),
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      mode: 'edit',
    });
    expect(result).toMatchObject({
      factsEditable: true,
      factsNotice: 'adminInfo',
      showVerifyButton: true,
    });
  });

  it('pracownik (`claims.verify` only) gets the locked block, no verify button', () => {
    const result = deriveClaimPermissions({
      permissions: perms('pracownik'),
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      mode: 'edit',
    });
    expect(result).toMatchObject({
      factsEditable: false,
      factsNotice: 'locked',
      showVerifyButton: false,
    });
  });

  it('while `/auth/me` loads (no permissions) everything gated is off', () => {
    const result = deriveClaimPermissions({
      permissions: undefined,
      status: 'OCZEKUJE_NA_AUTORYZACJE',
      mode: 'edit',
    });
    expect(result).toMatchObject({
      factsEditable: false,
      factsNotice: 'locked',
      showVerifyButton: false,
      showRecalcLimitsButton: false,
    });
  });
});

// ─── docs/25 §3 B4 — frozen pre-B4 derivation (role-keyed) ─────────────────
// A literal copy of the function as it was before the permissions layer. The
// new one must agree with it for every role × lider × status × mode.
function legacyDerive(
  status: ClaimStatus,
  role: Role | undefined,
  mode: ClaimModalMode,
): ClaimPermissions {
  const isAdmin = role === 'admin';
  const isEdit = mode === 'edit';
  const pendingAuthorization = status === 'OCZEKUJE_NA_AUTORYZACJE';
  const canVerifyInStatus =
    status === 'NA_WERYFIKACJI' || (pendingAuthorization && isAdmin);
  const factsEditable = isEdit && canVerifyInStatus;
  const factsNotice: ClaimPermissions['factsNotice'] = !pendingAuthorization
    ? null
    : isAdmin
      ? 'adminInfo'
      : 'locked';
  const canRecalcLimits =
    (isAdmin || role === 'pracownik') && status === 'NA_WERYFIKACJI';
  return {
    factsEditable,
    factsNotice,
    showVerifyButton: isEdit && canVerifyInStatus,
    requiresVerifiedCheckpoint: status === 'NA_WERYFIKACJI',
    payloadIncludesCorrections: factsEditable,
    showRecalcLimitsButton: isEdit && canRecalcLimits,
  };
}

describe('deriveClaimPermissions ≡ the pre-B4 role derivation', () => {
  const viewers: [Role | undefined, boolean][] = [
    [undefined, false],
    ...ALL_ROLES.flatMap((r): [Role, boolean][] => [
      [r, false],
      [r, true],
    ]),
  ];

  it.each(viewers)('%s (lider: %s) — every status × mode', (role, lider) => {
    for (const status of ALL_STATUSES) {
      for (const mode of ['view', 'edit'] as const) {
        expect(
          deriveClaimPermissions({ permissions: perms(role, lider), status, mode }),
        ).toEqual(legacyDerive(status, role, mode));
      }
    }
  });
});
