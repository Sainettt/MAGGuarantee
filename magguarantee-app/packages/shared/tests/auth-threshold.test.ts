// Tests for `getAuthThreshold` — the SOFT authorization-threshold hint.
//
// Pure port of `Code.gs:5967-5974`. The threshold is informational only (shown
// in the Maksim authorization email) and is NOT a gate — these tests pin the
// numeric bands and the legacy `Math.floor(parseFloat(...) || 0)` semantics so
// the API email row and any future web nudge stay byte-identical to the legacy
// value for every input.
//
// Band table: 10–15 → 300, 16–30 → 500, 31–60 → 800, 61+ → 1000. Values < 10
// also return 300 (legacy fall-through). NaN / negative / non-finite → 300.

import { describe, expect, it } from 'vitest';

import { getAuthThreshold } from '../src/domain/auth-threshold';

describe('getAuthThreshold — band boundaries', () => {
  it('10–15 driven days → 300 (lowest paid band)', () => {
    expect(getAuthThreshold(10)).toBe(300);
    expect(getAuthThreshold(15)).toBe(300);
  });

  it('boundary 15/16 → 300 then 500', () => {
    expect(getAuthThreshold(15)).toBe(300);
    expect(getAuthThreshold(16)).toBe(500);
  });

  it('16–30 driven days → 500', () => {
    expect(getAuthThreshold(16)).toBe(500);
    expect(getAuthThreshold(23)).toBe(500);
    expect(getAuthThreshold(30)).toBe(500);
  });

  it('boundary 30/31 → 500 then 800', () => {
    expect(getAuthThreshold(30)).toBe(500);
    expect(getAuthThreshold(31)).toBe(800);
  });

  it('31–60 driven days → 800', () => {
    expect(getAuthThreshold(31)).toBe(800);
    expect(getAuthThreshold(45)).toBe(800);
    expect(getAuthThreshold(60)).toBe(800);
  });

  it('boundary 60/61 → 800 then 1000', () => {
    expect(getAuthThreshold(60)).toBe(800);
    expect(getAuthThreshold(61)).toBe(1000);
  });

  it('61+ driven days → 1000 (highest band)', () => {
    expect(getAuthThreshold(61)).toBe(1000);
    expect(getAuthThreshold(120)).toBe(1000);
    expect(getAuthThreshold(9_999)).toBe(1000);
  });
});

describe('getAuthThreshold — fractional inputs are floored', () => {
  it('15.9 → floor 15 → 300', () => {
    expect(getAuthThreshold(15.9)).toBe(300);
  });

  it('16.0 → 500 (exact boundary, no fraction to floor away)', () => {
    expect(getAuthThreshold(16.0)).toBe(500);
  });

  it('30.99 → floor 30 → 500 (does not cross into the 800 band)', () => {
    expect(getAuthThreshold(30.99)).toBe(500);
  });

  it('60.5 → floor 60 → 800', () => {
    expect(getAuthThreshold(60.5)).toBe(800);
  });

  it('61.001 → floor 61 → 1000', () => {
    expect(getAuthThreshold(61.001)).toBe(1000);
  });
});

describe('getAuthThreshold — legacy fall-through + `|| 0` fallback', () => {
  it('0 → 300 (below the lowest documented band, legacy fall-through)', () => {
    expect(getAuthThreshold(0)).toBe(300);
  });

  it('single-digit values (< 10) → 300', () => {
    expect(getAuthThreshold(1)).toBe(300);
    expect(getAuthThreshold(9)).toBe(300);
    expect(getAuthThreshold(9.9)).toBe(300);
  });

  it('negative → 300 (Math.floor keeps it below every band)', () => {
    expect(getAuthThreshold(-1)).toBe(300);
    expect(getAuthThreshold(-100)).toBe(300);
  });

  it('NaN → 300 (legacy `parseFloat(...) || 0` collapses NaN to 0)', () => {
    expect(getAuthThreshold(Number.NaN)).toBe(300);
  });

  it('Infinity / -Infinity → 300 (non-finite guarded to 0)', () => {
    expect(getAuthThreshold(Number.POSITIVE_INFINITY)).toBe(300);
    expect(getAuthThreshold(Number.NEGATIVE_INFINITY)).toBe(300);
  });
});
