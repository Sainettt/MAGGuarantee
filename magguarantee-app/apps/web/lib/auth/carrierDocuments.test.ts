import { describe, expect, it } from 'vitest';
import { RoleSchema, type Role } from '@magguarantee/shared';

import { carrierDocumentsCarrierId } from './carrierDocuments';
import { effectivePermissionsFor, permissionsFor } from './permissions';

const CARRIER_ID = '00000000-0000-4000-8000-000000000001';
const GRANTED = effectivePermissionsFor('przewoznik', false, ['carrier_documents.read'], []);

describe('carrierDocumentsCarrierId (B.1)', () => {
  it('a carrier with the per-user grant and his company → his Carrier.id', () => {
    expect(
      carrierDocumentsCarrierId({ role: 'przewoznik', permissions: GRANTED, carrierId: CARRIER_ID }),
    ).toBe(CARRIER_ID);
  });

  it('a carrier without the grant → no tab', () => {
    expect(
      carrierDocumentsCarrierId({
        role: 'przewoznik',
        permissions: permissionsFor('przewoznik'),
        carrierId: CARRIER_ID,
      }),
    ).toBeNull();
  });

  it('the grant but no own company (carrierId null / not sent by an old api) → no tab', () => {
    expect(
      carrierDocumentsCarrierId({ role: 'przewoznik', permissions: GRANTED, carrierId: null }),
    ).toBeNull();
    expect(carrierDocumentsCarrierId({ role: 'przewoznik', permissions: GRANTED })).toBeNull();
  });

  it('a carrier whose panel.carrier was revoked → no tab', () => {
    const permissions = effectivePermissionsFor(
      'przewoznik',
      false,
      ['carrier_documents.read'],
      ['panel.carrier'],
    );
    expect(
      carrierDocumentsCarrierId({ role: 'przewoznik', permissions, carrierId: CARRIER_ID }),
    ).toBeNull();
  });

  it('nobody else ever gets it — admin included (holds .read by role, no carrier panel)', () => {
    const others: readonly Role[] = RoleSchema.options.filter((r) => r !== 'przewoznik');
    for (const role of others) {
      expect(
        carrierDocumentsCarrierId({
          role,
          permissions: [...permissionsFor(role, true), 'panel.carrier', 'carrier_documents.read'],
          carrierId: CARRIER_ID,
        }),
        role,
      ).toBeNull();
    }
  });

  it('version skew: without `permissions` the role catalog decides → no tab for a carrier', () => {
    expect(carrierDocumentsCarrierId({ role: 'przewoznik', carrierId: CARRIER_ID })).toBeNull();
  });
});
