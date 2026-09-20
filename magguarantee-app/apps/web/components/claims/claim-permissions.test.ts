// Gating of «Przelicz wg aktualnych limitów» (§16.6 + §6.5.13).
//
// Mirrors the server: `@Roles('admin', 'pracownik')` on
// `POST /claims/:nrZgl/recalc-limits` + the `CLAIM_LIMITS_REFRESH_BLOCKED`
// gate that allows only `NA_WERYFIKACJI`.

import { describe, expect, it } from 'vitest';
import type { ClaimStatus, Role } from '@magguarantee/shared';

import { deriveClaimPermissions } from './claim-permissions';

const ALL_ROLES: Role[] = [
  'admin',
  'pracownik',
  'opiekun',
  'przewoznik',
  'planista',
  'dyspozytor',
  'eksport',
  'weryfikator',
];

const DECIDED: ClaimStatus[] = ['ZAAKCEPTOWANO', 'ODRZUCONO'];

function show(role: Role | undefined, status: ClaimStatus, mode: 'view' | 'edit' = 'edit') {
  return deriveClaimPermissions({ role, status, mode }).showRecalcLimitsButton;
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
    const perms = deriveClaimPermissions({
      role: 'pracownik',
      status: 'NA_WERYFIKACJI',
      mode: 'edit',
    });
    expect(perms.factsEditable).toBe(true);
    expect(perms.showVerifyButton).toBe(true);
  });
});
