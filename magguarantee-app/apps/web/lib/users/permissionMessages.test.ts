// Every message the «Uprawnienia indywidualne» block, the carrier row and the
// carrier «Dokumenty» tab render (docs/14 A.9 / A.13 / B.8) formats in both
// locales with the arguments the UI passes — an ICU typo (plural branch,
// missing placeholder) fails here instead of rendering a raw key.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { describe, expect, it } from 'vitest';

function translator(locale: 'pl' | 'en', namespace: string) {
  const file = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
  return createTranslator({
    locale,
    messages: JSON.parse(readFileSync(file, 'utf8')) as AbstractIntlMessages,
    namespace: namespace as never,
    onError: (error) => {
      throw error;
    },
  });
}

const ROLE = { role: 'Przewoźnik' };
const LIST = { list: 'A, B' };

const USERS_KEYS: [string, Record<string, string | number>][] = [
  ['permissions.title', {}],
  ['permissions.description', {}],
  ['permissions.magspaceHint', {}],
  ['permissions.empty', ROLE],
  ['permissions.extra.title', {}],
  ['permissions.extra.hint', ROLE],
  ['permissions.extra.autoAdded', LIST],
  ['permissions.extra.autoRemoved', LIST],
  ['permissions.denied.title', {}],
  ['permissions.denied.hint', {}],
  ['permissions.denied.toggleShow', { count: 13 }],
  ['permissions.denied.toggleHide', {}],
  ['permissions.denied.dependentsHint', LIST],
  ['permissions.denied.dependentsApply', {}],
  ['permissions.effective.title', {}],
  ['permissions.effective.hint', {}],
  ['permissions.effective.extraAria', {}],
  ['permissions.effective.none', {}],
  ['permissions.drop.title', {}],
  ['permissions.drop.extraTag', {}],
  ['permissions.drop.deniedTag', {}],
  ['permissions.auditNote', {}],
  ['permissions.listMarkerAria', { extra: 1, denied: 2 }],
  ['permissions.errors.notGrantable', { ...ROLE, ...LIST }],
  ['permissions.errors.notGrantableGeneric', ROLE],
  ['permissions.errors.notRevocable', { ...ROLE, ...LIST }],
  ['permissions.errors.notRevocableGeneric', ROLE],
  ['permissions.errors.adminCannotBeDenied', {}],
  ['fields.carrierLocked', {}],
  ['errors.carrierRoleLocked', {}],
];

describe.each(['pl', 'en'] as const)('B6 messages — %s', (locale) => {
  const users = translator(locale, 'users');

  it.each(USERS_KEYS)('users.%s formats', (key, values) => {
    const text = users(key, values);
    expect(text).not.toContain('{');
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('plural summaries and counters cover 0 / 1 / few / many', () => {
    for (const count of [0, 1, 2, 5, 22]) {
      expect(users('permissions.denied.summary', { count })).not.toContain('{');
    }
    for (const count of [1, 2, 5, 14, 22]) {
      expect(users('permissions.effective.count', { count })).toContain(String(count));
    }
  });

  it('Polish plural forms', () => {
    if (locale !== 'pl') return;
    expect(users('permissions.denied.summary', { count: 0 })).toBe('Nic nie odebrano');
    expect(users('permissions.denied.summary', { count: 1 })).toBe('Odebrano 1 uprawnienie');
    expect(users('permissions.denied.summary', { count: 3 })).toBe('Odebrano 3 uprawnienia');
    expect(users('permissions.denied.summary', { count: 5 })).toBe('Odebrano 5 uprawnień');
    expect(users('permissions.effective.count', { count: 14 })).toBe('14 uprawnień');
    expect(users('permissions.effective.count', { count: 22 })).toBe('22 uprawnienia');
  });

  it('carrier documents keys (B.8)', () => {
    const carrier = translator(locale, 'carrier');
    for (const key of ['tabs.documents', 'documents.title', 'documents.subtitleAdd', 'documents.subtitleRead']) {
      expect(carrier(key)).not.toContain('{');
    }
    const documents = translator(locale, 'opieka.documents');
    for (const key of ['sheet.uploadHintAddOnly', 'sheet.companyByOpiekun', 'sheet.fleetByOpiekun']) {
      expect(documents(key)).not.toContain('{');
    }
  });
});
