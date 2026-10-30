// The weekly limits page strings rendered through the REAL message bundles
// (docs/14 §18.9): the ICU strings parse, the Polish plurals pick the right
// form, and the parameters are exactly the ones the components pass.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { buildCalendarYear } from './calendarGrid';

function load(locale: 'pl' | 'en'): AbstractIntlMessages {
  const file = fileURLToPath(
    new URL(`../../messages/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(file, 'utf8')) as AbstractIntlMessages;
}

function translator(locale: 'pl' | 'en', namespace: string) {
  return createTranslator({
    locale,
    messages: load(locale),
    namespace,
    onError: (error) => {
      throw error;
    },
  });
}

describe('limits.* (pl)', () => {
  const t = translator('pl', 'limits');

  it('quarter label carries the week range of the shown year', () => {
    const q4 = buildCalendarYear(2026).quarters[3]!;
    expect(t('quarter', { q: String(q4.quarter), from: q4.fromWeek, to: q4.toWeek })).toBe(
      'IV kwartał · tyg. 40–53',
    );
    expect(t('quarter', { q: '1', from: 1, to: 13 })).toBe('I kwartał · tyg. 1–13');
  });

  it('defaults notice — Polish plural forms', () => {
    const args = { kmPerDay: '540', rate: '0,50' };
    expect(t('defaultsNotice', { count: 1, ...args })).toBe(
      '1 tydzień nie ma konfiguracji — obowiązuje 540 km/dzień i 0,50 €/km.',
    );
    expect(t('defaultsNotice', { count: 4, ...args })).toMatch(/^4 tygodnie nie mają/u);
    expect(t('defaultsNotice', { count: 53, ...args })).toMatch(/^53 tygodnie nie mają/u);
    expect(t('defaultsNotice', { count: 12, ...args })).toMatch(/^12 tygodni nie ma/u);
  });

  it('tile aria-label, with and without the current-week suffix', () => {
    const base = {
      week: 44,
      range: '26 października – 1 listopada 2026',
      kmPerDay: '540 km (wartość domyślna)',
      saturday: 'brak gwarancji',
      rate: '0,50 €',
    };
    expect(t('tileAria', { ...base, current: 'true' })).toBe(
      'Tydzień 44, 26 października – 1 listopada 2026: gwarancja dzienna 540 km (wartość domyślna), sobota brak gwarancji, stawka 0,50 €, bieżący tydzień',
    );
    expect(t('tileAria', { ...base, current: 'false' })).not.toMatch(/bieżący/u);
  });

  it('values, panel and selection', () => {
    expect(t('valueDefault', { value: '540' })).toBe('540 dom.');
    expect(t('valueOff')).toBe('wył.');
    expect(t('panel.saturday', { date: '06.06' })).toBe('Km / sobota (06.06)');
    expect(
      t('panel.maxWeekly', { formula: '5 × 540 + 300', total: '3000' }),
    ).toBe('Maks. w tygodniu (bez świąt): 5 × 540 + 300 = 3000 km');
    expect(t('selection.title', { count: 13 })).toBe('Zaznaczono 13 tygodni');
    expect(t('selection.title', { count: 2 })).toBe('Zaznaczono 2 tygodnie');
    expect(t('selection.weeks', { list: '10–22' })).toBe('tyg. 10–22');
    expect(t('toggleDay', { week: 'Tydzień 23' })).toBe('Gwarancja km/dzień — Tydzień 23');
  });

  it('bulk summary and apply button', () => {
    expect(t('bulk.summaryHeadline', { changed: 13, total: 13 })).toBe(
      'Zmienisz 13 z 13 tygodni.',
    );
    expect(t('bulk.summaryHeadline', { changed: 1, total: 1 })).toBe(
      'Zmienisz 1 z 1 tygodnia.',
    );
    expect(t('bulk.summaryOverwrite', { count: 9 })).toBe(
      '9 tygodni ma już ustawione wartości — zostaną nadpisane.',
    );
    expect(t('bulk.apply', { count: 13 })).toBe('Zastosuj do 13 tygodni');
    expect(t('bulk.apply', { count: 1 })).toBe('Zastosuj do 1 tygodnia');
    expect(t('bulk.successToast', { count: 3 })).toBe('Zaktualizowano 3 tygodnie');
    expect(t('bulk.changesTable', { count: 13 })).toBe('Tabela zmian (13)');
    expect(t('bulk.fillFrom', { week: 10 })).toBe('Wypełnij wartościami tyg. 10');
  });

  it('year span with the ISO week count', () => {
    const tWeek = translator('pl', 'common.isoWeek');
    expect(
      t('yearSpan', {
        weeks: tWeek('count', { count: 53 }),
        from: '29.12.2025',
        to: '03.01.2027',
      }),
    ).toBe('53 tygodnie · 29.12.2025 – 03.01.2027');
  });
});

describe('limits.* (en)', () => {
  const t = translator('en', 'limits');

  it('parses with the same parameters', () => {
    expect(t('quarter', { q: '4', from: 40, to: 53 })).toBe('Q4 · weeks 40–53');
    expect(t('defaultsNotice', { count: 1, kmPerDay: '540', rate: '0,50' })).toBe(
      '1 week has no configuration — 540 km/day and 0,50 €/km apply.',
    );
    expect(t('selection.title', { count: 13 })).toBe('13 weeks selected');
    expect(t('bulk.apply', { count: 1 })).toBe('Apply to 1 week');
    expect(t('bulk.summaryHeadline', { changed: 2, total: 5 })).toBe(
      'You are changing 2 of 5 weeks.',
    );
    expect(
      t('tileAria', {
        week: 1,
        range: 'r',
        kmPerDay: 'a',
        saturday: 'b',
        rate: 'c',
        current: 'false',
      }),
    ).toBe('Week 1, r: daily guarantee a, Saturday b, rate c');
  });

  it('the audit label of the new target type exists next to the old one', () => {
    const tAudit = translator('en', 'audit.targetTypes');
    expect(tAudit('WeeklyLimit')).toBe('Weekly limit');
    expect(tAudit('MonthlyLimit')).toBe('Monthly limit');
  });
});
