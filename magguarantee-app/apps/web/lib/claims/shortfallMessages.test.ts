// The niedojazd readout rendered through the REAL message bundles (docs/14
// §16.5.10): proves the ICU strings parse, the `scope` select picks the right
// wording and the helper's parameters are exactly the ones the messages use.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { shortfallView, type AmountSource } from './shortfall';

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
    namespace: 'employee.claims.modal.shortfall',
    onError: (error) => {
      throw error;
    },
  });
}

const bold = { b: (chunks: string) => `<b>${chunks}</b>` };

/** Render what <ShortfallReadout> renders, as plain strings. */
function render(locale: 'pl' | 'en', src: AmountSource): string[] {
  const t = translator(locale);
  const view = shortfallView(src);
  switch (view.kind) {
    case 'none':
      return [];
    case 'shortfall':
      return [
        t.markup('line', { scope: view.scope, km: view.km, ...bold }),
        t('formula', {
          scope: view.scope,
          guaranteed: view.guaranteed,
          driven: view.driven,
          km: view.km,
          rate: view.rate,
        }),
      ];
    case 'metEqual':
      return [t('metEqual', { scope: view.scope, guaranteed: view.guaranteed })];
    case 'metOver':
      return [
        t('metOver', {
          scope: view.scope,
          driven: view.driven,
          guaranteed: view.guaranteed,
          km: view.km,
        }),
      ];
  }
}

const mixed: AmountSource = {
  kmGuaranteed: 7630,
  kmDifference: 2180,
  ratePerKmEffective: 0.5,
  paymentEur: 1090,
  breakdown: { mileageSource: 'board' },
};

describe('niedojazd messages (pl)', () => {
  it('mixed period — sentence + formula of the real case', () => {
    expect(render('pl', mixed)).toEqual([
      'W miesiącach z gwarancją pojazd przejechał o <b>2180 km mniej</b>, niż gwarantowano.',
      'Niedojazd: 7630 km gwarant. − 5450 km wg weryfikatora = 2180 km × 0,50 €/km',
    ]);
  });

  it('all-active period — «Pojazd przejechał» + «km przebiegu»', () => {
    expect(
      render('pl', { ...mixed, breakdown: { mileageSource: 'declared' } }),
    ).toEqual([
      'Pojazd przejechał o <b>2180 km mniej</b>, niż gwarantowano.',
      'Niedojazd: 7630 km gwarant. − 5450 km przebiegu = 2180 km × 0,50 €/km',
    ]);
  });

  it('exactly met — one line', () => {
    expect(render('pl', { ...mixed, kmDifference: 0, paymentEur: 0 })).toEqual([
      'W miesiącach z gwarancją pojazd przejechał dokładnie tyle, ile gwarantowano (7630 km). Gwarancja wyjeżdżona — dopłata nie przysługuje.',
    ]);
  });

  it('over-driven — one line, absolute value, no minus', () => {
    const [line] = render('pl', {
      ...mixed,
      breakdown: { mileageSource: 'declared' },
      kmDifference: -500,
      paymentEur: 0,
    });
    expect(line).toBe(
      'Pojazd przejechał 8130 km przy 7630 km gwarantowanych — o 500 km więcej. Gwarancja wyjeżdżona — dopłata nie przysługuje.',
    );
    expect(line).not.toMatch(/-\d/);
  });

  it('no guarantee — nothing', () => {
    expect(
      render('pl', { ...mixed, kmGuaranteed: 0, kmDifference: 0, paymentEur: 0 }),
    ).toEqual([]);
  });
});

describe('niedojazd messages (en)', () => {
  it('mixed period — sentence + formula', () => {
    expect(render('en', mixed)).toEqual([
      'In the guaranteed months the vehicle drove <b>2180 km less</b> than guaranteed.',
      'Shortfall: 7630 guaranteed km − 5450 km per verifier = 2180 km × 0,50 €/km',
    ]);
  });

  it('over-driven — absolute value', () => {
    expect(
      render('en', {
        ...mixed,
        breakdown: { mileageSource: 'declared' },
        kmDifference: -500,
        paymentEur: 0,
      }),
    ).toEqual([
      'The vehicle drove 8130 km against 7630 guaranteed km — 500 km more. Guarantee met — no compensation is due.',
    ]);
  });
});
