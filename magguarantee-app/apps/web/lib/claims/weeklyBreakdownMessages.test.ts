// The weekly breakdown / recalc strings rendered through the REAL message
// bundles (docs/14 §18.9, §16.5.7): proves the ICU strings parse, the Polish
// plurals pick the right form and the parameters are the ones the components
// pass. The week label is built from `isoWeekLabelParts`, as `<IsoWeekLabel>`
// does.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { isoWeekLabelParts } from '@/lib/format/weekLabel';

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

function weekLabel(
  locale: 'pl' | 'en',
  isoWeek: string,
  periodStart: string,
  periodEnd: string,
): { label: string; full: string } {
  const t = translator(locale, 'common.isoWeek');
  const parts = isoWeekLabelParts({ isoWeek, periodStart, periodEnd }, locale);
  if (!parts) throw new Error(`bad key ${isoWeek}`);
  return {
    label: parts.singleDay
      ? t('withDay', { week: parts.week, day: parts.from })
      : t('withRange', { week: parts.week, from: parts.from, to: parts.to }),
    full: t('fullWeekTitle', { from: parts.fullFrom, to: parts.fullTo }),
  };
}

describe('common.isoWeek', () => {
  it('the first week of a claim, clipped to the period (pl)', () => {
    expect(weekLabel('pl', '2026-W23', '2026-06-03', '2026-06-07')).toEqual({
      label: 'Tydz. 23 · 03.06–07.06',
      full: 'Pełny tydzień: 01.06–07.06',
    });
  });

  it('en-GB dates and the «Wk» abbreviation', () => {
    expect(weekLabel('en', '2026-W24', '2026-06-08', '2026-06-14')).toEqual({
      label: 'Wk 24 · 08/06–14/06',
      full: 'Full week: 08/06–14/06',
    });
  });

  it('W01 carries the year of its December days', () => {
    expect(weekLabel('pl', '2026-W01', '2025-12-29', '2026-01-04').label).toBe(
      'Tydz. 1 · 29.12.2025–04.01',
    );
  });

  it('a single day is one date, not «31.05–31.05»', () => {
    expect(weekLabel('pl', '2026-W22', '2026-05-31', '2026-05-31').label).toBe(
      'Tydz. 22 · 31.05',
    );
  });

  it('count pluralises (pl: one / few / many)', () => {
    const t = translator('pl', 'common.isoWeek');
    expect(t('count', { count: 1 })).toBe('1 tydzień');
    expect(t('count', { count: 3 })).toBe('3 tygodnie');
    expect(t('count', { count: 13 })).toBe('13 tygodni');
  });
});

describe('carrier.breakdown — weekly wording', () => {
  it('mixed-period notices talk about weeks', () => {
    const t = translator('pl', 'carrier.breakdown');
    const b = (chunks: string) => `<b>${chunks}</b>`;
    expect(t.markup('mixedPeriodNotice', { count: 1, b })).toMatch(
      /^Okres obejmuje tydzień bez gwarancji\./u,
    );
    expect(t.markup('mixedPeriodNotice', { count: 2, b })).toMatch(
      /^Okres obejmuje tygodnie bez gwarancji\./u,
    );
    expect(t.markup('boardNotice', { count: 5, b })).toMatch(
      /^Okres obejmuje tygodni bez gwarancji\..*w tygodniach z gwarancją/u,
    );
    const en = translator('en', 'carrier.breakdown');
    expect(en.markup('mixedPeriodNotice', { count: 1, b })).toMatch(
      /^The period includes a week without/u,
    );
  });

  it('the «Sob.» column and its titles exist in both locales', () => {
    for (const locale of ['pl', 'en'] as const) {
      const t = translator(locale, 'carrier.breakdown');
      for (const key of [
        'week',
        'saturday',
        'kmInWeek',
        'saturdayNoneTitle',
        'saturdayNotCountedTitle',
        'guaranteeDisabledShort',
        'guaranteeSaturdayOnlyShort',
      ]) {
        expect(t(key)).not.toBe('');
      }
    }
  });
});

describe('employee.claims.modal.recalcLimits — changed weeks', () => {
  it('pl plurals', () => {
    const t = translator('pl', 'employee.claims.modal.recalcLimits');
    expect(t('changedWeeks', { count: 1 })).toBe('Zmienione limity (1 tydzień)');
    expect(t('changedWeeks', { count: 2 })).toBe('Zmienione limity (2 tygodnie)');
    expect(t('unchangedWeeks', { count: 1 })).toBe('Pozostały 1 tydzień bez zmian.');
    expect(t('unchangedWeeks', { count: 3 })).toBe('Pozostałe 3 tygodnie bez zmian.');
    expect(t('unchangedWeeks', { count: 7 })).toBe('Pozostałych 7 tygodni bez zmian.');
    expect(t('showAll', { count: 9 })).toBe('Pokaż wszystkie (9)');
  });

  it('en plurals', () => {
    const t = translator('en', 'employee.claims.modal.recalcLimits');
    expect(t('changedWeeks', { count: 2 })).toBe('Changed limits (2 weeks)');
    expect(t('unchangedWeeks', { count: 1 })).toBe('The other week is unchanged.');
    expect(t('unchangedWeeks', { count: 3 })).toBe('The other 3 weeks are unchanged.');
  });
});
