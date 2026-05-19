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
  /** Called when the row body (not an action button) is clicked. */
  onRowClick?: (row: T) => void;
  /** Rendered inside the table body when `rows.length === 0`. */
  empty?: ReactNode;
  /** Loading state — show a centered "Loading…". */
  isLoading?: boolean;
  className?: string;
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
  empty,
  isLoading,
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
            {isLoading && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-12 text-center text-sm text-text-sub"
                >
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-0">
                  {empty ?? (
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
                  className={cn(
                    'border-b border-border last:border-b-0',
                    'hover:bg-brand-50 dark:hover:bg-brand/10 transition-colors',
                    onRowClick && 'cursor-pointer',
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
