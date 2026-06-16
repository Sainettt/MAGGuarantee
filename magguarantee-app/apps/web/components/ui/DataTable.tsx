'use client';

// Minimal data-table for Phase 2 admin CRUD. Not TanStack Table — we don't
// need sort/filter logic client-side (server already handles `q`, `active`,
// `cursor`/`limit`). Per docs/14-design-system.md § DataTable: 48px row
// height, header in `bg-bg`, hover row in `brand-50`, sticky header.
//
// Columns are typed: `accessor` extracts the cell value from the row, `cell`
// optionally renders a custom node. Action columns just declare `cell` and
// don't use `accessor`.
//
// Phase 3.4 — added per-column `width` and `truncate` sizing intents (docs/14
// § Phase 3.4.B). These map to concrete Tailwind utilities on `<th>` / `<td>`
// so admin tables can keep dense columns (NIP, login, badges) at content-fit
// while flex columns (Name, Company) absorb the remainder and truncate.

import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

export interface DataTableColumn<T> {
  /** Stable id used for React keys. */
  id: string;
  /** Header label. */
  header: ReactNode;
  /** Cell renderer; receives the row. */
  cell: (row: T) => ReactNode;
  /** Optional className applied to both the th and td. */
  className?: string;
  /** Right-align (e.g. for numeric / action columns). */
  align?: 'left' | 'right' | 'center';
  /**
   * Column sizing intent — drives Tailwind width utilities on `<th>`/`<td>`.
   *
   * - `'tight'`  : content has a short fixed length (NIP, login, dates,
   *                badges). Width hugs content; never stretches.
   *                → `w-px whitespace-nowrap`
   * - `'auto'`   : let the browser size from content (default).
   * - `'flex'`   : column absorbs remaining width. Pair with the cell
   *                renderer's own `truncate` / `line-clamp-N` for overflow
   *                control. We add `min-w-0` so the cell can shrink below
   *                its natural content width.
   * - `number`   : explicit px width hint. Applied via inline style on both
   *                the th and td and locked with `whitespace-nowrap`.
   */
  width?: 'tight' | 'auto' | 'flex' | number;
  /**
   * Truncation behaviour for text cells. Applied to a generated wrapper
   * `<div>` around the cell renderer so the cell renderer itself stays
   * agnostic. Default: no truncation, content wraps.
   *
   * - `'ellipsis'` : single line + ellipsis (`truncate`).
   * - `'clamp-2'`  : 2-line cap (`line-clamp-2`).
   *
   * If your cell renderer already owns its own truncation (e.g. needs a
   * `title=` attribute for the full text), leave this undefined and apply
   * the classes inside `cell`.
   */
  truncate?: 'ellipsis' | 'clamp-2';
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  /** Stable key per row. */
  rowKey: (row: T) => string;
  /** Called when the row body (not an action button) is clicked. When set,
   *  the row becomes a keyboard-operable activation target (§6.4.3):
   *  `role="button"`, `tabIndex={0}`, Enter/Space activate, brand focus ring. */
  onRowClick?: (row: T) => void;
  /**
   * Optional per-row accessible label used as the `aria-label` of the
   * activatable `<tr>` (only applied when `onRowClick` is set). Lets SR users
   * know what a row click opens, e.g. «Pokaż szczegóły: WGM 1234» (§6.4.3).
   * When omitted, no `aria-label` is set; the row stays mouse + keyboard
   * clickable but is announced only by its cell content.
   */
  rowAriaLabel?: (row: T) => string;
  /**
   * Rendered inside the table body when `rows.length === 0` and no filters are
   * active (the §8.2 "no data yet" empty — pass an `<EmptyState>` with an
   * `action` for create-capable roles, informational only for read-only roles).
   */
  empty?: ReactNode;
  /**
   * §8.2 filtered-empty — rendered when `rows.length === 0` **and**
   * `hasActiveFilters` is true. Should offer a «Wyczyść filtry» reset action,
   * never a create CTA. When omitted, `empty` is shown for both cases.
   */
  emptyFiltered?: ReactNode;
  /** Drives the §8.2 data-vs-filtered empty split. */
  hasActiveFilters?: boolean;
  /** Loading state — renders the §8.1 table-skeleton (geometry-preserving rows). */
  isLoading?: boolean;
  /**
   * Number of skeleton rows rendered while `isLoading` (§8.1 recipe: 8 rows for
   * a full table; pass a smaller count for compact embedded tables). Default 8.
   */
  skeletonRows?: number;
  className?: string;
}

/** §8.1 — one skeleton `<tr>` whose cells mirror the real column count + widths
 *  so the loaded content drops in with no layout jump. Per-cell widths are
 *  pseudo-random-but-stable (driven by row+col index) to read as real data. */
function TableSkeletonRow<T>({
  columns,
  rowIndex,
}: {
  columns: DataTableColumn<T>[];
  rowIndex: number;
}) {
  return (
    <tr className="border-b border-border last:border-b-0" aria-hidden>
      {columns.map((col, colIndex) => {
        // Deterministic width in the 50–85% band so columns look varied but
        // never jump between renders.
        const pct = 50 + ((rowIndex * 7 + colIndex * 13) % 36);
        const align = ALIGN_CLASSES[col.align ?? 'left'];
        return (
          <td
            key={col.id}
            style={widthStyle(col)}
            className={cn('px-3 py-2 h-12 align-middle', align, widthClasses(col))}
          >
            <Skeleton
              className={cn('h-4', col.align === 'right' && 'ml-auto')}
              style={{ width: `${pct}%` }}
            />
          </td>
        );
      })}
    </tr>
  );
}

const ALIGN_CLASSES: Record<NonNullable<DataTableColumn<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

function widthClasses<T>(col: DataTableColumn<T>): string {
  if (col.width === 'tight') return 'w-px whitespace-nowrap';
  if (col.width === 'flex') return 'min-w-0';
  if (typeof col.width === 'number') return 'whitespace-nowrap';
  return '';
}

function widthStyle<T>(col: DataTableColumn<T>): CSSProperties | undefined {
  if (typeof col.width === 'number') return { width: col.width };
  return undefined;
}

function truncateClasses<T>(col: DataTableColumn<T>): string {
  if (col.truncate === 'ellipsis') return 'truncate';
  if (col.truncate === 'clamp-2') return 'line-clamp-2 break-words';
  return '';
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowAriaLabel,
  empty,
  emptyFiltered,
  hasActiveFilters,
  isLoading,
  skeletonRows = 8,
  className,
}: DataTableProps<T>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card shadow-card overflow-hidden',
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  style={widthStyle(col)}
                  className={cn(
                    'px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border',
                    ALIGN_CLASSES[col.align ?? 'left'],
                    widthClasses(col),
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: skeletonRows }).map((_, i) => (
                <TableSkeletonRow
                  key={`sk-${i}`}
                  columns={columns}
                  rowIndex={i}
                />
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-0">
                  {(hasActiveFilters && emptyFiltered ? emptyFiltered : empty) ?? (
                    <p className="py-12 text-center text-sm text-text-sub">
                      No items.
                    </p>
                  )}
                </td>
              </tr>
            )}
            {!isLoading &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  // Keyboard + a11y for activatable rows (§6.4.3). All gated on
                  // `onRowClick` so non-clickable tables are untouched.
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick ? rowAriaLabel?.(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            // Space would otherwise scroll the page; suppress it.
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    'border-b border-border last:border-b-0',
                    'hover:bg-brand-50 dark:hover:bg-brand/10 transition-colors',
                    onRowClick &&
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset',
                  )}
                >
                  {columns.map((col) => {
                    const trunc = truncateClasses(col);
                    const rendered = col.cell(row);
                    return (
                      <td
                        key={col.id}
                        style={widthStyle(col)}
                        className={cn(
                          'px-3 py-2 h-12 text-text align-middle',
                          ALIGN_CLASSES[col.align ?? 'left'],
                          widthClasses(col),
                          col.className,
                        )}
                      >
                        {trunc ? <div className={trunc}>{rendered}</div> : rendered}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
