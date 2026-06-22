import { UnprocessableEntityException } from '@nestjs/common';

import type { DelegationStatus } from '@magguarantee/shared';

import {
  assertLegalDelegationTransition,
  CANCELLABLE_DELEGATION_STATUSES,
  isLegalDelegationTransition,
  legalDelegationTargets,
} from './delegation-state-machine';

// Phase 7 REWORK (2026-06-20 #4) — delegation lifecycle:
//   zgloszony → gotowy → w_trasie → zjechal
//   gotowy → zgloszony (rollback, pre-w_trasie only)
//   {zgloszony, gotowy, w_trasie} → anulowany

const ALL: DelegationStatus[] = [
  'zgloszony',
  'gotowy',
  'w_trasie',
  'zjechal',
  'anulowany',
];

const LEGAL: ReadonlyArray<[DelegationStatus, DelegationStatus]> = [
  ['zgloszony', 'gotowy'],
  ['zgloszony', 'anulowany'],
  ['gotowy', 'w_trasie'],
  ['gotowy', 'zgloszony'], // rollback, pre-w_trasie
  ['gotowy', 'anulowany'],
  ['w_trasie', 'zjechal'],
  ['w_trasie', 'anulowany'],
];

describe('delegation-state-machine — legal edges', () => {
  it.each(LEGAL)('accepts %s → %s', (from, to) => {
    expect(isLegalDelegationTransition(from, to)).toBe(true);
    expect(() => assertLegalDelegationTransition(from, to)).not.toThrow();
  });

  it('rollback gotowy → zgloszony is allowed (pre-w_trasie)', () => {
    expect(isLegalDelegationTransition('gotowy', 'zgloszony')).toBe(true);
  });
});

describe('delegation-state-machine — illegal edges', () => {
  it('rollback after w_trasie is forbidden (w_trasie → zgloszony / w_trasie → gotowy)', () => {
    expect(isLegalDelegationTransition('w_trasie', 'zgloszony')).toBe(false);
    expect(isLegalDelegationTransition('w_trasie', 'gotowy')).toBe(false);
  });

  it('cannot skip gotowy (zgloszony → w_trasie)', () => {
    expect(isLegalDelegationTransition('zgloszony', 'w_trasie')).toBe(false);
  });

  it('cannot skip w_trasie (gotowy → zjechal)', () => {
    expect(isLegalDelegationTransition('gotowy', 'zjechal')).toBe(false);
  });

  it('terminal statuses have no outbound edges', () => {
    expect(legalDelegationTargets('zjechal')).toEqual([]);
    expect(legalDelegationTargets('anulowany')).toEqual([]);
  });

  it('self-edges are never legal', () => {
    for (const s of ALL) {
      expect(isLegalDelegationTransition(s, s)).toBe(false);
    }
  });

  it('every non-listed edge is rejected and assert throws 422', () => {
    const legalSet = new Set(LEGAL.map(([f, t]) => `${f}->${t}`));
    for (const from of ALL) {
      for (const to of ALL) {
        if (from === to) continue;
        const expected = legalSet.has(`${from}->${to}`);
        expect(isLegalDelegationTransition(from, to)).toBe(expected);
        if (!expected) {
          expect(() => assertLegalDelegationTransition(from, to)).toThrow(
            UnprocessableEntityException,
          );
        }
      }
    }
  });
});

describe('delegation-state-machine — cancellable statuses', () => {
  it('exposes the active-status cancel allow-list', () => {
    expect(CANCELLABLE_DELEGATION_STATUSES).toEqual([
      'zgloszony',
      'gotowy',
      'w_trasie',
    ]);
    expect(CANCELLABLE_DELEGATION_STATUSES).not.toContain('zjechal');
    expect(CANCELLABLE_DELEGATION_STATUSES).not.toContain('anulowany');
  });
});
