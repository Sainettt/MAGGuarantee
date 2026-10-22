// SLA «attention» rows (docs/21): the REKLAMACJA marker decision and the row
// aria-label rendered through the REAL message bundles — proves the ICU
// `kind` select parses in both locales and that the parameters the component
// passes are exactly the ones `dashboard.sla.rowAria` uses.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { slaRowView, type SlaRowView } from './slaRow';

function load(locale: 'pl' | 'en'): AbstractIntlMessages {
  const file = fileURLToPath(
    new URL(`../../messages/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(file, 'utf8')) as AbstractIntlMessages;
}

function translator(locale: 'pl' | 'en') {
  return createTranslator({
    locale,
    messages: load(locale),
    namespace: 'dashboard.sla',
    onError: (error) => {
      throw error;
    },
  });
}

/** Build the row aria-label exactly as <SlaAttentionSection> does. */
function rowAria(locale: 'pl' | 'en', nrZgl: string, view: SlaRowView): string {
  const t = translator(locale);
  const { countdown } = view;
  const status =
    countdown.key === 'lastDay'
      ? t('countdown.lastDay')
      : t(`countdown.${countdown.key}`, { days: countdown.days });
  return t('rowAria', { nrZgl, kind: view.kind, status });
}

describe('slaRowView', () => {
  it('marks a REKLAMACJA row', () => {
    expect(slaRowView({ status: 'REKLAMACJA', workingDaysLeft: -2 }).kind).toBe(
      'reklamacja',
    );
  });

  it('leaves a verification row unmarked', () => {
    expect(
      slaRowView({ status: 'NA_WERYFIKACJI', workingDaysLeft: 1 }).kind,
    ).toBe('weryfikacja');
  });

  it('derives the countdown from the sign, like <SlaCountdownBadge>', () => {
    expect(slaRowView({ status: 'REKLAMACJA', workingDaysLeft: -3 }).countdown)
      .toEqual({ key: 'overdue', days: 3 });
    expect(slaRowView({ status: 'REKLAMACJA', workingDaysLeft: 0 }).countdown)
      .toEqual({ key: 'lastDay' });
    expect(
      slaRowView({ status: 'NA_WERYFIKACJI', workingDaysLeft: 2 }).countdown,
    ).toEqual({ key: 'dueSoon', days: 2 });
  });
});

describe('dashboard.sla.rowAria', () => {
  const reklamacja = slaRowView({ status: 'REKLAMACJA', workingDaysLeft: -2 });
  const weryfikacja = slaRowView({
    status: 'NA_WERYFIKACJI',
    workingDaysLeft: 0,
  });

  it('names the reklamacja on a REKLAMACJA row (PL)', () => {
    expect(rowAria('pl', '123/2026', reklamacja)).toBe(
      'Wniosek 123/2026, reklamacja — 2 dni po terminie, otwórz wniosek',
    );
  });

  it('stays plain on a verification row (PL)', () => {
    expect(rowAria('pl', '124/2026', weryfikacja)).toBe(
      'Wniosek 124/2026 — dziś ostatni dzień, otwórz wniosek',
    );
  });

  it('names the reclamation on a REKLAMACJA row (EN)', () => {
    expect(rowAria('en', '123/2026', reklamacja)).toBe(
      'Claim 123/2026, reclamation — 2 days overdue, open claim',
    );
  });

  it('stays plain on a verification row (EN)', () => {
    expect(rowAria('en', '124/2026', weryfikacja)).toBe(
      'Claim 124/2026 — last day today, open claim',
    );
  });

  it('no longer promises a verification for every row', () => {
    for (const locale of ['pl', 'en'] as const) {
      const label = rowAria(locale, '1/2026', reklamacja);
      expect(label).not.toMatch(/weryfikacj|verification/i);
    }
  });
});
