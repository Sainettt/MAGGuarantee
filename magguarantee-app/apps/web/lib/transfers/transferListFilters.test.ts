import { describe, expect, it } from 'vitest';
import { PlannerTransferListQuerySchema } from '@magguarantee/shared';

import {
  DECIDED_FILTERS,
  DEFAULT_DECIDED_FILTER,
  DEFAULT_MINE_FILTER,
  MINE_FILTERS,
  mineEmptyKind,
  mineFilterLabelKey,
  parseDecidedFilter,
  parseMineFilter,
  parseTransferTab,
} from './transferListFilters';

describe('parseTransferTab (§17.5.1)', () => {
  it('keeps the known tabs', () => {
    expect(parseTransferTab('pending', true)).toBe('pending');
    expect(parseTransferTab('decided', true)).toBe('decided');
    expect(parseTransferTab('mine', true)).toBe('mine');
  });

  it('«mine» on a list without that tab (opiekun, planista, lider) → the first tab', () => {
    expect(parseTransferTab('mine', false)).toBe('pending');
  });

  it('anything unknown → the first (default) tab', () => {
    expect(parseTransferTab('', true)).toBe('pending');
    expect(parseTransferTab('bogus', true)).toBe('pending');
  });
});

describe('«Rozpatrzone» filter', () => {
  it('defaults to every terminal status', () => {
    expect(DEFAULT_DECIDED_FILTER).toBe('decided');
  });

  it.each(DECIDED_FILTERS)('keeps %s', (f) => {
    expect(parseDecidedFilter(f)).toBe(f);
  });

  it('«pending» is not a «Rozpatrzone» option → back to the default', () => {
    expect(parseDecidedFilter('pending')).toBe('decided');
    expect(parseDecidedFilter('bogus')).toBe('decided');
  });
});

describe('«Moje wnioski» filter (§17.5.8)', () => {
  it('defaults to «Oczekujące» — the only state in which the author can still act', () => {
    expect(DEFAULT_MINE_FILTER).toBe('pending');
    expect(MINE_FILTERS[0]).toBe(DEFAULT_MINE_FILTER);
  });

  it('options follow the §17.5.8 table order', () => {
    expect(MINE_FILTERS).toEqual(['pending', 'decided', 'approved', 'rejected', 'cancelled']);
  });

  it.each(MINE_FILTERS)('%s maps 1:1 onto an api `status` value (one query, one pager)', (f) => {
    const parsed = PlannerTransferListQuerySchema.safeParse({ scope: 'mine', status: f });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.status).toBe(f);
  });

  it.each(MINE_FILTERS)('keeps %s', (f) => {
    expect(parseMineFilter(f)).toBe(f);
  });

  it('anything unknown → «Oczekujące»', () => {
    expect(parseMineFilter('')).toBe('pending');
    expect(parseMineFilter('all')).toBe('pending');
  });

  it.each([
    ['pending', 'filter.pending'],
    ['decided', 'filter.allDecided'],
    ['approved', 'filter.approved'],
    ['rejected', 'filter.rejected'],
    ['cancelled', 'filter.cancelled'],
  ] as const)('%s is labelled by transfers.%s', (f, key) => {
    expect(mineFilterLabelKey(f)).toBe(key);
  });

  it.each([
    ['pending', 'pendingAuthor'],
    ['decided', 'decided'],
    ['approved', 'decidedFiltered'],
    ['rejected', 'decidedFiltered'],
    ['cancelled', 'decidedFiltered'],
  ] as const)('an empty %s page explains itself with empty.%s', (f, kind) => {
    expect(mineEmptyKind(f)).toBe(kind);
  });
});
