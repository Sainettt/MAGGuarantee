import { describe, expect, it } from 'vitest';
import { UpdateUserSchema } from '@magguarantee/shared';

import { CARRIER_LOCKED_FIELDS, isCarrierAccount, omitCarrierLockedFields } from './carrierAccount';

describe('carrier account in the user form (A.8)', () => {
  it('recognises the stored przewoznik row only', () => {
    expect(isCarrierAccount({ role: 'przewoznik' })).toBe(true);
    expect(isCarrierAccount({ role: 'pracownik' })).toBe(false);
    expect(isCarrierAccount(null)).toBe(false);
  });

  it('never sends role / lider / liderId / managedBy / roleOverride', () => {
    const body = {
      email: 'a@b.pl',
      name: 'Jan',
      active: true,
      role: 'pracownik',
      lider: false,
      liderId: null,
      managedBy: 'local',
      roleOverride: null,
      extraPermissions: ['carrier_documents.read'],
    };
    expect(omitCarrierLockedFields(body)).toEqual({
      email: 'a@b.pl',
      name: 'Jan',
      active: true,
      extraPermissions: ['carrier_documents.read'],
    });
  });

  it('the locked fields are real PATCH fields (a rename would leave one behind)', () => {
    for (const field of CARRIER_LOCKED_FIELDS) {
      expect(Object.keys(UpdateUserSchema.shape)).toContain(field);
    }
  });
});
