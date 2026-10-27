// docs/14 B.9 tests (1)–(3): the controls of <CarrierDocumentsTab> per viewer.
// (1) is the regression guard — opiekun and admin keep the pre-B6 render.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  effectivePermissionsFor,
  permissionsFor,
  type Permission,
} from '@/lib/auth/permissions';

import {
  carrierDocumentsRights,
  carrierDocumentsUi as uiFor,
  type CarrierDocumentsUi,
} from './carrierDocumentsAccess';

const carrierDocumentsUi = (permissions: readonly Permission[]): CarrierDocumentsUi =>
  uiFor(carrierDocumentsRights(permissions));

/** What the component rendered before B6 for every viewer (opiekun + admin). */
const PRE_B6: CarrierDocumentsUi = {
  companyFooter: 'upload',
  uploadHintKey: 'sheet.uploadHint',
  showDelete: true,
  fleetFooter: 'manageElsewhere',
};

describe('carrierDocumentsUi', () => {
  it.each(['opiekun', 'admin'] as const)('(1) %s — unchanged: «Usuń», upload footer, «Zarządzaj w oknie …»', (role) => {
    expect(carrierDocumentsUi(permissionsFor(role, false))).toEqual(PRE_B6);
    expect(carrierDocumentsUi(permissionsFor(role, true))).toEqual(PRE_B6);
  });

  it('(1) all three document rights + fleet.write alone give the pre-B6 render', () => {
    expect(
      carrierDocumentsUi([
        'carrier_documents.read',
        'carrier_documents.add',
        'carrier_documents.delete',
        'fleet.write',
      ]),
    ).toEqual(PRE_B6);
  });

  it('(2) carrier with .read + .add — upload with the add-only hint, no «Usuń», fleet by opiekun', () => {
    const permissions = effectivePermissionsFor(
      'przewoznik',
      false,
      ['carrier_documents.read', 'carrier_documents.add'],
      [],
    );
    expect(carrierDocumentsUi(permissions)).toEqual({
      companyFooter: 'upload',
      uploadHintKey: 'sheet.uploadHintAddOnly',
      showDelete: false,
      fleetFooter: 'byOpiekun',
    });
  });

  it('(3) carrier with .read only — no upload, «company by opiekun», no «Usuń»', () => {
    const permissions = effectivePermissionsFor('przewoznik', false, ['carrier_documents.read'], []);
    expect(carrierDocumentsUi(permissions)).toEqual({
      companyFooter: 'byOpiekun',
      uploadHintKey: 'sheet.uploadHint',
      showDelete: false,
      fleetFooter: 'byOpiekun',
    });
  });

  it('an opiekun whose .delete was revoked keeps upload with the add-only wording', () => {
    const permissions = effectivePermissionsFor('opiekun', false, [], ['carrier_documents.delete']);
    expect(carrierDocumentsUi(permissions)).toEqual({
      ...PRE_B6,
      uploadHintKey: 'sheet.uploadHintAddOnly',
      showDelete: false,
    });
  });

  it('every footer key exists in both bundles', () => {
    type Messages = { [key: string]: string | Messages };
    for (const locale of ['pl', 'en'] as const) {
      const file = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
      const messages = JSON.parse(readFileSync(file, 'utf8')) as Messages;
      const sheet = (messages.opieka as Messages).documents as Messages;
      for (const key of [
        'sheet.uploadHint',
        'sheet.uploadHintAddOnly',
        'sheet.companyByOpiekun',
        'sheet.fleetByOpiekun',
        'sheet.manageInVehicle',
        'sheet.manageInTrailer',
        'sheet.manageInDriver',
      ]) {
        const [group, leaf] = key.split('.') as [string, string];
        expect(typeof (sheet[group] as Messages)[leaf], `${locale} ${key}`).toBe('string');
      }
    }
  });
});
