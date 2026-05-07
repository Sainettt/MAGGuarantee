import { UnprocessableEntityException } from '@nestjs/common';

import type { ClaimStatus } from '@magguarantee/shared';

import {
  assertLegalTransition,
  isLegalTransition,
  legalTargets,
  type LegalTransition,
} from './claim-state-machine';

describe('claim-state-machine', () => {
  // The 9 documented legal edges (kept literal so the test is self-documenting).
  const LEGAL: LegalTransition[] = [
    { from: 'NA_WERYFIKACJI', to: 'OCZEKUJE_NA_AUTORYZACJE' },
    { from: 'NA_WERYFIKACJI', to: 'ZAAKCEPTOWANO' },
    { from: 'NA_WERYFIKACJI', to: 'ODRZUCONO' },
    { from: 'OCZEKUJE_NA_AUTORYZACJE', to: 'ZAAKCEPTOWANO' },
    { from: 'OCZEKUJE_NA_AUTORYZACJE', to: 'ODRZUCONO' },
    { from: 'ZAAKCEPTOWANO', to: 'REKLAMACJA' },
    { from: 'ODRZUCONO', to: 'REKLAMACJA' },
    { from: 'REKLAMACJA', to: 'ZAAKCEPTOWANO' },
    { from: 'REKLAMACJA', to: 'ODRZUCONO' },
  ];

  it.each(LEGAL)('legal: $from → $to', ({ from, to }) => {
    expect(isLegalTransition(from, to)).toBe(true);
    expect(() => assertLegalTransition(from, to)).not.toThrow();
  });

  // A handful of explicitly-illegal edges, including cycles, terminal-state
  // transitions, and reverse-direction moves.
  const ILLEGAL: { from: ClaimStatus; to: ClaimStatus }[] = [
    // Self-loops are never legal.
    { from: 'NA_WERYFIKACJI', to: 'NA_WERYFIKACJI' },
    { from: 'ZAAKCEPTOWANO', to: 'ZAAKCEPTOWANO' },
    // Skipping the verification queue entirely.
    { from: 'NA_WERYFIKACJI', to: 'REKLAMACJA' },
    // Reversing a decided claim back to verification queue.
    { from: 'ZAAKCEPTOWANO', to: 'NA_WERYFIKACJI' },
    { from: 'ODRZUCONO', to: 'NA_WERYFIKACJI' },
    // Going from a decided claim straight to a different decision.
    { from: 'ZAAKCEPTOWANO', to: 'ODRZUCONO' },
    { from: 'ODRZUCONO', to: 'ZAAKCEPTOWANO' },
    // Authorization-pending cannot un-pend itself.
    { from: 'OCZEKUJE_NA_AUTORYZACJE', to: 'NA_WERYFIKACJI' },
    // Reklamacja cannot rebound back to its own input states.
    { from: 'REKLAMACJA', to: 'NA_WERYFIKACJI' },
    { from: 'REKLAMACJA', to: 'OCZEKUJE_NA_AUTORYZACJE' },
    // Maksima override is a frozen sink — no outbound transitions.
    { from: 'AUTORYZACJA_KWOTA_MAKSIMA', to: 'ZAAKCEPTOWANO' },
    { from: 'AUTORYZACJA_KWOTA_MAKSIMA', to: 'ODRZUCONO' },
  ];

  it.each(ILLEGAL)('illegal: $from → $to', ({ from, to }) => {
    expect(isLegalTransition(from, to)).toBe(false);
    expect(() => assertLegalTransition(from, to)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('legalTargets matches the matrix for NA_WERYFIKACJI', () => {
    expect(legalTargets('NA_WERYFIKACJI').sort()).toEqual(
      ['OCZEKUJE_NA_AUTORYZACJE', 'ZAAKCEPTOWANO', 'ODRZUCONO'].sort(),
    );
  });

  it('legalTargets is empty for AUTORYZACJA_KWOTA_MAKSIMA', () => {
    expect(legalTargets('AUTORYZACJA_KWOTA_MAKSIMA')).toEqual([]);
  });

  it('error message names the offending transition (Polish)', () => {
    try {
      assertLegalTransition('ZAAKCEPTOWANO', 'NA_WERYFIKACJI');
      fail('Expected UnprocessableEntityException');
    } catch (e) {
      const err = e as { message: string };
      expect(err.message).toContain('ZAAKCEPTOWANO');
      expect(err.message).toContain('NA_WERYFIKACJI');
      expect(err.message).toMatch(/Niedozwolone/);
    }
  });
});
