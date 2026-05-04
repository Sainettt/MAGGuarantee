'use client';

// Minimal data-table for Phase 2 admin CRUD. Not TanStack Table — we don't
// need sort/filter logic client-side (server already handles `q`, `active`,
// `cursor`/`limit`). Per docs/14-design-system.md § DataTable: 48px row
// height, header in `bg-bg`, hover row in `brand-50`, sticky header.
//
// Columns are typed: `accessor` extracts the cell value from the row, `cell`
// optionally renders a custom node. Action columns just declare `cell` and
// don't use `accessor`.

import { type ReactNode } from 'react';

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
                  className={cn(
                    'px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border',
                    ALIGN_CLASSES[col.align ?? 'left'],
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
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        'px-3 py-2 h-12 text-text align-middle',
                        ALIGN_CLASSES[col.align ?? 'left'],
                        col.className,
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
