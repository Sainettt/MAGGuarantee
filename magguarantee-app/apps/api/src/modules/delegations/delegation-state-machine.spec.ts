import { ConflictException } from '@nestjs/common';

import type { DelegationStatus } from '@magguarantee/shared';

import {
  assertLegalDelegationTransition,
  isLegalDelegationTransition,
  legalDelegationTargets,
  type LegalDelegationTransition,
} from './delegation-state-machine';

describe('delegation-state-machine', () => {
  // The only TWO legal verifier-driven edges (owner decision 2026-06-10).
  const LEGAL: LegalDelegationTransition[] = [
    { from: 'zgloszony', to: 'w_trasie' },
    { from: 'w_trasie', to: 'zjechal' },
  ];

  it.each(LEGAL)('legal: $from → $to', ({ from, to }) => {
    expect(isLegalDelegationTransition(from, to)).toBe(true);
    expect(() => assertLegalDelegationTransition(from, to)).not.toThrow();
  });

  const ILLEGAL: { from: DelegationStatus; to: DelegationStatus }[] = [
    // Self-loops are never legal.
    { from: 'zgloszony', to: 'zgloszony' },
    { from: 'w_trasie', to: 'w_trasie' },
    { from: 'zjechal', to: 'zjechal' },
    // Skipping a step — cannot jump straight to zjechal.
    { from: 'zgloszony', to: 'zjechal' },
    // The verifier has NO cancel authority — `anulowany` is unreachable here.
    { from: 'zgloszony', to: 'anulowany' },
    { from: 'w_trasie', to: 'anulowany' },
    // Reversing the lifecycle.
    { from: 'w_trasie', to: 'zgloszony' },
    { from: 'zjechal', to: 'w_trasie' },
    // Terminal sinks — nothing the verifier can do moves them.
    { from: 'zjechal', to: 'zgloszony' },
    { from: 'anulowany', to: 'w_trasie' },
    { from: 'anulowany', to: 'zjechal' },
    { from: 'anulowany', to: 'zgloszony' },
  ];

  it.each(ILLEGAL)('illegal: $from → $to → 409', ({ from, to }) => {
    expect(isLegalDelegationTransition(from, to)).toBe(false);
    expect(() => assertLegalDelegationTransition(from, to)).toThrow(
      ConflictException,
    );
  });

  it('legalDelegationTargets(zgloszony) = [w_trasie]', () => {
    expect(legalDelegationTargets('zgloszony')).toEqual(['w_trasie']);
  });

  it('legalDelegationTargets(w_trasie) = [zjechal]', () => {
    expect(legalDelegationTargets('w_trasie')).toEqual(['zjechal']);
  });

  it('legalDelegationTargets is empty for terminal/owner-only states', () => {
    expect(legalDelegationTargets('zjechal')).toEqual([]);
    expect(legalDelegationTargets('anulowany')).toEqual([]);
  });

  it('error message names the offending transition (Polish)', () => {
    try {
      assertLegalDelegationTransition('zjechal', 'w_trasie');
      throw new Error('Expected ConflictException');
    } catch (e) {
      const err = e as { message: string };
      expect(err.message).toContain('zjechal');
      expect(err.message).toContain('w_trasie');
      expect(err.message).toMatch(/Niedozwolone/);
    }
  });
});
