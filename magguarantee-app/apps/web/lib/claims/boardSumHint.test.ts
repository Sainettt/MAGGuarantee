// The «Wg tablicy przebiegów» hint source (ClaimModal km input).

import { describe, expect, it } from 'vitest';

import { boardSumHintKm } from './boardSumHint';

describe('boardSumHintKm', () => {
  it('offers the live board sum, not the declared mileage', () => {
    // Carrier declared 9350; the weryfikator later filled a day — board 9850.
    expect(boardSumHintKm({ boardSumKm: 9850 }, true)).toBe(9850);
  });

  it('a real 0 is offered («0 km»), not hidden', () => {
    expect(boardSumHintKm({ boardSumKm: 0 }, true)).toBe(0);
  });

  it('null (no vehicle / bad date / board unavailable) hides the hint', () => {
    expect(boardSumHintKm({ boardSumKm: null }, true)).toBeUndefined();
  });

  it('absent key or no preview yet hides the hint', () => {
    expect(boardSumHintKm({}, true)).toBeUndefined();
    expect(boardSumHintKm(undefined, true)).toBeUndefined();
    expect(boardSumHintKm(null, true)).toBeUndefined();
  });

  it('hidden wherever the km input is not editable', () => {
    expect(boardSumHintKm({ boardSumKm: 9850 }, false)).toBeUndefined();
    expect(boardSumHintKm({ boardSumKm: 0 }, false)).toBeUndefined();
  });
});
