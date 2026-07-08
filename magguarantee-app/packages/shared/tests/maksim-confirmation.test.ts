// Tests for `requiresMaksimConfirmation` — the HARD over-threshold gate.
//
// The predicate is `paymentEur > getAuthThreshold(drivenDays)` — STRICTLY
// greater. These fixtures pin the exactly-on-threshold vs strictly-greater
// behavior at EVERY band boundary (300 / 500 / 800 / 1000 €) so FE (amber hint
// → hard block) and BE (gate arming) agree. On-threshold must NEVER trigger;
// one cent above must.

import { describe, expect, it } from 'vitest';

import { requiresMaksimConfirmation } from '../src/domain/maksim-confirmation';

describe('requiresMaksimConfirmation — 300 € band (10–15 driven days)', () => {
  it('EXACTLY on 300 does NOT trigger', () => {
    expect(requiresMaksimConfirmation({ paymentEur: 300, drivenDays: 12 })).toBe(
      false,
    );
  });

  it('one cent above 300 triggers', () => {
    expect(
      requiresMaksimConfirmation({ paymentEur: 300.01, drivenDays: 12 }),
    ).toBe(true);
  });

  it('below 300 does not trigger', () => {
    expect(requiresMaksimConfirmation({ paymentEur: 299.99, drivenDays: 12 })).toBe(
      false,
    );
    expect(requiresMaksimConfirmation({ paymentEur: 0, drivenDays: 12 })).toBe(
      false,
    );
  });
});

describe('requiresMaksimConfirmation — 500 € band (16–30 driven days)', () => {
  it('EXACTLY on 500 does NOT trigger', () => {
    expect(requiresMaksimConfirmation({ paymentEur: 500, drivenDays: 20 })).toBe(
      false,
    );
  });

  it('one cent above 500 triggers', () => {
    expect(
      requiresMaksimConfirmation({ paymentEur: 500.01, drivenDays: 20 }),
    ).toBe(true);
  });

  it('300 (below THIS band threshold) does not trigger at 20 days', () => {
    // 20 days → threshold 500; a 300 dopłata is under it.
    expect(requiresMaksimConfirmation({ paymentEur: 300, drivenDays: 20 })).toBe(
      false,
    );
  });
});

describe('requiresMaksimConfirmation — 800 € band (31–60 driven days)', () => {
  it('EXACTLY on 800 does NOT trigger', () => {
    expect(requiresMaksimConfirmation({ paymentEur: 800, drivenDays: 45 })).toBe(
      false,
    );
  });

  it('one cent above 800 triggers', () => {
    expect(
      requiresMaksimConfirmation({ paymentEur: 800.01, drivenDays: 45 }),
    ).toBe(true);
  });

  it('500 (over the 500-band, but under the 800-band) does not trigger at 45 days', () => {
    expect(requiresMaksimConfirmation({ paymentEur: 500, drivenDays: 45 })).toBe(
      false,
    );
  });
});

describe('requiresMaksimConfirmation — 1000 € band (61+ driven days)', () => {
  it('EXACTLY on 1000 does NOT trigger', () => {
    expect(
      requiresMaksimConfirmation({ paymentEur: 1000, drivenDays: 70 }),
    ).toBe(false);
  });

  it('one cent above 1000 triggers', () => {
    expect(
      requiresMaksimConfirmation({ paymentEur: 1000.01, drivenDays: 70 }),
    ).toBe(true);
  });

  it('a huge dopłata clearly over the top band triggers', () => {
    expect(
      requiresMaksimConfirmation({ paymentEur: 5000, drivenDays: 120 }),
    ).toBe(true);
  });
});

describe('requiresMaksimConfirmation — band boundary transitions', () => {
  it('same dopłata (350) triggers on the 300-band but not the 500-band', () => {
    // 12 days → threshold 300, 350 > 300 → gate. 20 days → threshold 500,
    // 350 < 500 → no gate. Proves the drivenDays band, not a fixed number.
    expect(requiresMaksimConfirmation({ paymentEur: 350, drivenDays: 12 })).toBe(
      true,
    );
    expect(requiresMaksimConfirmation({ paymentEur: 350, drivenDays: 20 })).toBe(
      false,
    );
  });

  it('fractional drivenDays floor into the correct band (15.9 → 300-band)', () => {
    // 15.9 floors to 15 → 300-band. 320 > 300 → gate.
    expect(
      requiresMaksimConfirmation({ paymentEur: 320, drivenDays: 15.9 }),
    ).toBe(true);
    // 16.0 → 500-band. 320 < 500 → no gate.
    expect(
      requiresMaksimConfirmation({ paymentEur: 320, drivenDays: 16.0 }),
    ).toBe(false);
  });
});

describe('requiresMaksimConfirmation — degenerate drivenDays fall back to 300-band', () => {
  it('drivenDays 0 / negative / NaN collapse to the 300 threshold', () => {
    // getAuthThreshold(...) → 300 for these; 301 > 300 → gate, 300 → no gate.
    expect(requiresMaksimConfirmation({ paymentEur: 301, drivenDays: 0 })).toBe(
      true,
    );
    expect(requiresMaksimConfirmation({ paymentEur: 300, drivenDays: 0 })).toBe(
      false,
    );
    expect(requiresMaksimConfirmation({ paymentEur: 301, drivenDays: -5 })).toBe(
      true,
    );
    expect(
      requiresMaksimConfirmation({ paymentEur: 301, drivenDays: Number.NaN }),
    ).toBe(true);
  });
});
