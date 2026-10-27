// docs/14 B.9 test (4): «Dokumenty» only with panel.carrier ∧ carrier_documents.read
// (and an own company), always last; the other tabs never move.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { carrierDocumentsCarrierId } from '@/lib/auth/carrierDocuments';
import {
  effectivePermissionsFor,
  permissionsFor,
  type Permission,
} from '@/lib/auth/permissions';

import { CARRIER_TABS, DOCUMENTS_TAB, carrierTabsFor } from './carrierTabsConfig';

const CARRIER_ID = '00000000-0000-4000-8000-000000000001';

const hrefs = (showDocuments: boolean) => carrierTabsFor(showDocuments).map((t) => t.href);

describe('carrier tabs', () => {
  it('every carrier: the six tabs, unchanged order', () => {
    expect(hrefs(false)).toEqual([
      '/carrier/claims',
      '/carrier/claims/new',
      '/carrier/fleet',
      '/carrier/delegations',
      '/carrier/porozumienie',
      '/carrier/km',
    ]);
  });

  it('«Dokumenty» comes last, 📁, and shifts nothing', () => {
    const tabs = carrierTabsFor(true);
    expect(tabs.slice(0, -1)).toEqual(CARRIER_TABS);
    expect(tabs.at(-1)).toEqual({
      href: '/carrier/dokumenty',
      matchPrefix: '/carrier/dokumenty',
      emoji: '📁',
      labelKey: 'documents',
    });
  });

  it('shown exactly for a carrier holding panel.carrier ∧ carrier_documents.read', () => {
    const granted = effectivePermissionsFor('przewoznik', false, ['carrier_documents.read'], []);
    const show = (permissions: readonly Permission[]) =>
      carrierDocumentsCarrierId({ role: 'przewoznik', permissions, carrierId: CARRIER_ID }) !==
      null;
    expect(show(granted)).toBe(true);
    expect(show(permissionsFor('przewoznik'))).toBe(false);
    expect(show(granted.filter((p) => p !== 'panel.carrier'))).toBe(false);
    // Admin sits in the carrier shell too, holds .read by role — never the tab.
    expect(
      carrierDocumentsCarrierId({
        role: 'admin',
        permissions: [...permissionsFor('admin')],
        carrierId: null,
      }),
    ).toBeNull();
  });

  it('the tab label exists in both bundles', () => {
    type Messages = { [key: string]: string | Messages };
    for (const locale of ['pl', 'en'] as const) {
      const file = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
      const messages = JSON.parse(readFileSync(file, 'utf8')) as Messages;
      const tabs = (messages.carrier as Messages).tabs as Messages;
      expect(typeof tabs[DOCUMENTS_TAB.labelKey], locale).toBe('string');
    }
  });
});
