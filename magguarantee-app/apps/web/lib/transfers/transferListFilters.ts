// Tabs + status filters of <PlannerTransferList> (docs/14 §17.5.1, §17.5.8) —
// pure, so the mapping «what the user picked → what the api is asked → which
// empty state explains an empty answer» is unit-tested without rendering.
//
//   «Do decyzji» / «Oczekujące»  status=pending                (no filter)
//   «Rozpatrzone»                status=decided | one terminal  (DecidedFilter)
//   «Moje wnioski» (admin only)  scope=mine, status=any value   (MineFilter)
//
// Every filter option maps 1:1 onto an api `status` value (docs/13), so each
// tab is ONE query with ONE cursor pager — no client-side merging.

import type { PlannerTransferListQuery } from '@magguarantee/shared';

// ─── Tabs ────────────────────────────────────────────────

export type TransferTab = 'pending' | 'decided' | 'mine';

/**
 * Narrow the `<Tabs onValueChange>` string. Anything unknown — and «mine» on a
 * list that has no such tab — falls back to the first tab, the default one
 * (§17.5.1: predictability over «smart» switching).
 */
export function parseTransferTab(value: string, withMineTab: boolean): TransferTab {
  if (value === 'decided') return 'decided';
  if (value === 'mine' && withMineTab) return 'mine';
  return 'pending';
}

// ─── «Rozpatrzone» filter ────────────────────────────────

export const DECIDED_FILTERS = ['decided', 'approved', 'rejected', 'cancelled'] as const;
export type DecidedFilter = (typeof DECIDED_FILTERS)[number];
/** «Wszystkie» — every terminal status. */
export const DEFAULT_DECIDED_FILTER: DecidedFilter = 'decided';

export function parseDecidedFilter(value: string): DecidedFilter {
  return (DECIDED_FILTERS as readonly string[]).includes(value)
    ? (value as DecidedFilter)
    : DEFAULT_DECIDED_FILTER;
}

// ─── «Moje wnioski» filter (§17.5.8) ─────────────────────

/** Option order of the select = the order of the §17.5.8 table. */
export const MINE_FILTERS = [
  'pending',
  'decided',
  'approved',
  'rejected',
  'cancelled',
] as const satisfies readonly PlannerTransferListQuery['status'][];
export type MineFilter = (typeof MINE_FILTERS)[number];

/**
 * «Oczekujące»: the only thing an admin-author can still DO with his request
 * is cancel it, and that is possible only while it is pending.
 */
export const DEFAULT_MINE_FILTER: MineFilter = 'pending';

export function parseMineFilter(value: string): MineFilter {
  return (MINE_FILTERS as readonly string[]).includes(value)
    ? (value as MineFilter)
    : DEFAULT_MINE_FILTER;
}

/** `transfers.*` label of a «Moje wnioski» option (`decided` is «Wszystkie rozpatrzone»). */
export function mineFilterLabelKey(
  filter: MineFilter,
): `filter.${'pending' | 'allDecided' | 'approved' | 'rejected' | 'cancelled'}` {
  return filter === 'decided' ? 'filter.allDecided' : `filter.${filter}`;
}

/**
 * Which empty state explains an empty «Moje wnioski» page:
 *   `pendingAuthor`   — «Brak oczekujących wniosków» (+ «file from the vehicle form»);
 *   `decided`         — «Brak rozpatrzonych wniosków»;
 *   `decidedFiltered` — one terminal status → «Brak wyników» + «Wyczyść filtry»,
 *                       which goes back to {@link DEFAULT_MINE_FILTER}.
 */
export function mineEmptyKind(
  filter: MineFilter,
): 'pendingAuthor' | 'decided' | 'decidedFiltered' {
  if (filter === 'pending') return 'pendingAuthor';
  if (filter === 'decided') return 'decided';
  return 'decidedFiltered';
}
