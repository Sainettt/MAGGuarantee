// The locked checkbox mechanics of §16.3: un-ticking WRITES 0, ticking writes
// NOTHING, an empty blur un-ticks, and no transition can emit a NULL.

import { describe, expect, it } from 'vitest';

import {
  commitOnBlur,
  isChecked,
  isOff,
  toggleGuarantee,
  type GuaranteeCellState,
} from './guaranteeCell';

function state(patch: Partial<GuaranteeCellState> = {}): GuaranteeCellState {
  return {
    value: 540,
    nullMeansOff: false,
    text: '540',
    draft: false,
    lastPositive: 540,
    ...patch,
  };
}

describe('checked / off derivation', () => {
  it('NULL kmPerDay is CHECKED (the fallback guarantee applies)', () => {
    const s = state({ value: null, text: '' });
    expect(isOff(s)).toBe(false);
    expect(isChecked(s)).toBe(true);
  });

  it('NULL kmPerSaturday is OFF (its fallback is zero)', () => {
    const s = state({ value: null, nullMeansOff: true, text: '' });
    expect(isOff(s)).toBe(true);
    expect(isChecked(s)).toBe(false);
  });

  it('a draft over an off week reads as checked', () => {
    expect(isChecked(state({ value: 0, text: '', draft: true }))).toBe(true);
  });
});

describe('un-ticking writes 0 immediately', () => {
  it('from an active week', () => {
    const action = toggleGuarantee(state({ value: 540, text: '540' }), false);
    expect(action.write).toBe(0);
    expect(action.draft).toBe(false);
    expect(action.remember).toBe(540);
  });

  it('from an UNCONFIGURED week (NULL → 0, never back to NULL)', () => {
    const action = toggleGuarantee(state({ value: null, text: '' }), false);
    expect(action.write).toBe(0);
  });

  it('remembers the typed value, not just the stored one', () => {
    const action = toggleGuarantee(state({ value: 540, text: '600' }), false);
    expect(action.remember).toBe(600);
    expect(action.write).toBe(0);
  });

  it('cancelling a draft writes nothing — the server is already off', () => {
    const action = toggleGuarantee(
      state({ value: 0, text: '540', draft: true }),
      false,
    );
    expect(action.write).toBeUndefined();
    expect(action.draft).toBe(false);
  });
});

describe('ticking writes NOTHING', () => {
  it('only unlocks the input and focuses it', () => {
    const action = toggleGuarantee(
      state({ value: 0, text: '', draft: false, lastPositive: null }),
      true,
    );
    expect(action.write).toBeUndefined();
    expect(action.draft).toBe(true);
    expect(action.text).toBe('');
    expect(action.focusInput).toBe(true);
  });

  it('pre-fills the remembered value as a DRAFT (still unwritten)', () => {
    const action = toggleGuarantee(
      state({ value: 0, text: '', draft: false, lastPositive: 600 }),
      true,
    );
    expect(action.text).toBe('600');
    expect(action.write).toBeUndefined();
    expect(action.draft).toBe(true);
  });
});

describe('blur', () => {
  it('an empty draft un-ticks the box and announces it', () => {
    const action = commitOnBlur(state({ value: 0, text: '', draft: true }));
    expect(action.write).toBeUndefined();
    expect(action.draft).toBe(false);
    expect(action.announceReverted).toBe(true);
  });

  it('an emptied CONFIGURED cell restores the stored value (no NULL write)', () => {
    const action = commitOnBlur(state({ value: 540, text: '' }));
    expect(action.write).toBeUndefined();
    expect(action.text).toBe('540');
    expect(action.announceReverted).toBeUndefined();
  });

  it('garbage restores the stored value without writing', () => {
    const action = commitOnBlur(state({ value: 540, text: 'abc' }));
    expect(action.write).toBeUndefined();
    expect(action.text).toBe('540');
  });

  it('a value in a draft is written', () => {
    const action = commitOnBlur(state({ value: 0, text: '600', draft: true }));
    expect(action.write).toBe(600);
    // The draft survives until the new value lands, so a failed write leaves
    // the box ticked.
    expect(action.draft).toBe(true);
  });

  it('an explicit 0 typed into an ACTIVE cell switches the week off', () => {
    const action = commitOnBlur(state({ value: 540, text: '0' }));
    expect(action.write).toBe(0);
  });

  it('an explicit 0 typed into a draft just stays off', () => {
    const action = commitOnBlur(state({ value: 0, text: '0', draft: true }));
    expect(action.write).toBeUndefined();
    expect(action.draft).toBe(false);
  });

  it('an unchanged value writes nothing', () => {
    expect(commitOnBlur(state({ value: 540, text: '540' })).write).toBeUndefined();
  });
});

describe('invariant: no transition can emit a null / negative write', () => {
  const states: GuaranteeCellState[] = [
    state({ value: null, text: '' }),
    state({ value: null, text: '-5' }),
    state({ value: 0, text: '', draft: true }),
    state({ value: 0, text: 'abc', draft: true }),
    state({ value: 540, text: '' }),
    state({ value: 540, text: '600' }),
    state({ value: null, nullMeansOff: true, text: '' }),
  ];

  it('holds for every toggle and blur transition', () => {
    for (const s of states) {
      for (const action of [
        toggleGuarantee(s, true),
        toggleGuarantee(s, false),
        commitOnBlur(s),
      ]) {
        if (action.write !== undefined) {
          expect(typeof action.write).toBe('number');
          expect(action.write).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
