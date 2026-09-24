// Niedojazd readout under the dopłata field (docs/14 §16.5.10).

import { describe, expect, it } from 'vitest';
import type { ClaimStatus } from '@magguarantee/shared';

import { formatEur } from '@/lib/format/numbers';

import {
  formatShortfallKm,
  formatShortfallRate,
  selectAmountSource,
  shortfallView,
  showsStoredAmount,
  type AmountSource,
} from './shortfall';

/** pl-PL groups with a (narrow) no-break space — compare digits only. */
function plain(s: string): string {
  return s.replace(/\s/g, '');
}

/** Pre-formatted pl-PL number back to a JS number. */
function parsePl(s: string): number {
  return Number(plain(s).replace(',', '.'));
}

function src(patch: Partial<AmountSource> = {}): AmountSource {
  return {
    kmGuaranteed: 7630,
    kmDifference: 2180,
    ratePerKmEffective: 0.5,
    paymentEur: 1090,
    breakdown: { mileageSource: 'board' },
    ...patch,
  };
}

function claim(
  status: ClaimStatus,
  patch: Partial<AmountSource> = {},
): AmountSource & { status: ClaimStatus } {
  return { ...src(patch), status };
}

describe('shortfallView', () => {
  it('real case: 7630 − 5450 = 2180 km × 0,50 matches € 1090,00', () => {
    const s = src();
    const view = shortfallView(s);
    expect(view.kind).toBe('shortfall');
    if (view.kind !== 'shortfall') return;
    expect(view.scope).toBe('board');
    expect(plain(view.guaranteed)).toBe('7630');
    expect(plain(view.driven)).toBe('5450');
    expect(plain(view.km)).toBe('2180');
    expect(view.rate).toBe('0,50');
    // niedojazd × stawka is exactly the amount shown in the field.
    expect(formatEur(parsePl(view.km) * parsePl(view.rate))).toBe(
      formatEur(s.paymentEur),
    );
    expect(plain(formatEur(s.paymentEur))).toBe('€1090,00');
  });

  it('shortfall exactly 0 → metEqual only', () => {
    const view = shortfallView(src({ kmDifference: 0, paymentEur: 0 }));
    expect(view).toEqual({
      kind: 'metEqual',
      scope: 'board',
      guaranteed: formatShortfallKm(7630),
    });
  });

  it('negative → metOver with the ABSOLUTE value, never a minus', () => {
    const view = shortfallView(src({ kmDifference: -500, paymentEur: 0 }));
    expect(view.kind).toBe('metOver');
    if (view.kind !== 'metOver') return;
    expect(plain(view.km)).toBe('500');
    expect(plain(view.driven)).toBe('8130');
    for (const value of [view.km, view.guaranteed, view.driven]) {
      expect(value).not.toMatch(/[-−]/);
    }
  });

  it('all-active wording vs board wording follows the SOURCE breakdown', () => {
    const declared = shortfallView(
      src({ breakdown: { mileageSource: 'declared' } }),
    );
    const absent = shortfallView(src({ breakdown: {} }));
    const noBreakdown = shortfallView(src({ breakdown: null }));
    const board = shortfallView(src());
    expect(declared).toMatchObject({ kind: 'shortfall', scope: 'declared' });
    expect(absent).toMatchObject({ scope: 'declared' });
    expect(noBreakdown).toMatchObject({ scope: 'declared' });
    expect(board).toMatchObject({ scope: 'board' });
  });

  it('no guarantee anywhere in the period → nothing', () => {
    expect(
      shortfallView(src({ kmGuaranteed: 0, kmDifference: -300, paymentEur: 0 })),
    ).toEqual({ kind: 'none' });
    expect(
      shortfallView(src({ kmGuaranteed: 0, kmDifference: 0, paymentEur: 0 })),
    ).toEqual({ kind: 'none' });
  });

  it('non-finite numbers at runtime → nothing', () => {
    expect(
      shortfallView(src({ kmDifference: Number.NaN })),
    ).toEqual({ kind: 'none' });
  });

  it('km keep up to 2 decimals and hide float noise; rate 2–4 decimals', () => {
    // 1000 − 666.67 in JS is 333.33000000000004.
    const view = shortfallView(
      src({ kmGuaranteed: 1000, kmDifference: 666.67, ratePerKmEffective: 0.4875 }),
    );
    expect(view.kind).toBe('shortfall');
    if (view.kind !== 'shortfall') return;
    expect(view.driven).toBe('333,33');
    expect(view.km).toBe('666,67');
    expect(view.rate).toBe('0,4875');
    expect(formatShortfallRate(0.5)).toBe('0,50');
  });
});

describe('selectAmountSource', () => {
  const live = src({ kmDifference: 2980, paymentEur: 1490 });

  it('decided mixed claim → the STORED claim, not the live board', () => {
    for (const status of ['ZAAKCEPTOWANO', 'ODRZUCONO'] as const) {
      const stored = claim(status);
      expect(showsStoredAmount(stored)).toBe(true);
      expect(selectAmountSource(stored, live)).toBe(stored);
    }
  });

  it('everything else → the live preview once it exists', () => {
    const open = claim('NA_WERYFIKACJI');
    expect(selectAmountSource(open, live)).toBe(live);
    // Decided but all-active → live, as before the feature.
    const decidedDeclared = claim('ZAAKCEPTOWANO', {
      breakdown: { mileageSource: 'declared' },
    });
    expect(showsStoredAmount(decidedDeclared)).toBe(false);
    expect(selectAmountSource(decidedDeclared, live)).toBe(live);
    // Reklamacja is not in the rule.
    expect(selectAmountSource(claim('REKLAMACJA'), live)).toBe(live);
  });

  it('no preview yet / preview failed → the claim', () => {
    const open = claim('NA_WERYFIKACJI');
    expect(selectAmountSource(open, undefined)).toBe(open);
    expect(selectAmountSource(open, null)).toBe(open);
  });

  it('the readout and the field read the same object', () => {
    const stored = claim('ZAAKCEPTOWANO');
    const picked = selectAmountSource(stored, live);
    const view = shortfallView(picked);
    if (view.kind !== 'shortfall') throw new Error('expected a shortfall');
    expect(formatEur(parsePl(view.km) * parsePl(view.rate))).toBe(
      formatEur(picked.paymentEur),
    );
  });
});
