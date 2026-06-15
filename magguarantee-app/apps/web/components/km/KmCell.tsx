'use client';

// <KmCell> — the three-state cell at the heart of the weekly km-grid
// (docs/14-design-system.md §7.7.1, §7.7.4). Exactly three presentational
// states:
//   • drove — km value + leading text-success Check, faint `bg-success/10`.
//   • idle  — muted «nie jeździ» pill on `bg-input`, no number.
//   • empty — faint centered `—` on `bg-card`, NO tint (unchecked ≠ error).
//
// Two modes:
//   • view — inert. Meaning carried by icon + text, never colour alone.
//   • edit — the cell is a single focusable button (board only). Click /
//     Enter / Space opens the <KmCellEditorDialog> (§7.7.4 REWORK #4) for that
//     (vehicle, day). There is NO inline editor and NO cell-to-cell keyboard
//     chaining any more — the old commit-on-blur / Esc-revert / Enter-to-move
//     spreadsheet machine was removed. The cell is purely a display primitive;
//     all mutation happens inside the modal.
//
// No new tokens: tints are `bg-{success}/10` opacity variants; the focus ring is
// the brand ring; soft surfaces are `bg-input` only.

import { Check, Lock, ParkingSquare, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { VehicleKmCellDto } from '@magguarantee/shared';

import { cn } from '@/lib/utils';

interface KmCellProps {
  cell: VehicleKmCellDto;
  mode: 'view' | 'edit';
  /** Weekend (Sat/Sun) — faint `bg-input` tint to separate the work week.
   *  Today's brand accent lives on the column header (§7.7.3), not the cell. */
  isWeekend?: boolean;
  /**
   * §7.7.1a — time-gated lock modifier (edit board only). `true` when the cell's
   * day is today or a future day; the cell renders as inert non-button chrome
   * (dimmed value, corner `<Lock>`, `cursor-not-allowed`, not focusable).
   * Always `false` in `mode="view"` (read-only cells are already inert).
   */
  isLocked?: boolean;
  /** a11y label for the cell button, e.g. «WGM1234, Pn 09.06: Jechał». */
  ariaLabel: string;
  /** a11y label for a §7.7.1a locked cell (state + locked suffix). */
  lockedAriaLabel?: string;
  /** Open the modal editor for this cell (edit mode only). */
  onOpenEditor?: (cell: VehicleKmCellDto) => void;
}

/**
 * Read-only cell body — the three locked visuals (§7.7.1). Shared by both modes.
 * `lockedEmpty` swaps the faint `—` for nothing (§7.7.1a: the corner `<Lock>`
 * glyph is then the only mark on a locked-and-blank future cell).
 */
function CellDisplay({
  cell,
  lockedEmpty = false,
}: {
  cell: VehicleKmCellDto;
  lockedEmpty?: boolean;
}) {
  const t = useTranslations('weryfikator.km.cell');
  if (cell.state === 'drove') {
    return (
      <span className="inline-flex items-center justify-center gap-1">
        <Check size={12} className="text-success" aria-hidden="true" />
        <span className="font-mono font-semibold tabular-nums text-text">
          {cell.km ?? 0}
        </span>
      </span>
    );
  }
  if (cell.state === 'idle') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-text-sub">
        <ParkingSquare size={12} aria-hidden="true" />
        {t('idle')}
      </span>
    );
  }
  // §7.7.1a — on a locked `empty` cell the corner <Lock> glyph IS the only mark;
  // drop the faint `—` so a blank future cell reads as "locked, nothing to
  // enter" rather than "to-do".
  if (lockedEmpty) return null;
  return (
    <span className="text-text-sub/60" aria-hidden="true">
      —
    </span>
  );
}

export function KmCell({
  cell,
  mode,
  isWeekend,
  isLocked = false,
  ariaLabel,
  lockedAriaLabel,
  onOpenEditor,
}: KmCellProps) {
  const tCell = useTranslations('weryfikator.km.cell');

  // Cell surface tint by state (locked §7.7.1).
  const surface =
    cell.state === 'drove'
      ? 'bg-success/10'
      : cell.state === 'idle'
        ? 'bg-input'
        : isWeekend
          ? 'bg-input/50'
          : 'bg-card';

  const hasNotes = Boolean(cell.notes && cell.notes.trim());

  // ── Locked cell (§7.7.1a) — edit board only, today + future days ─────────
  // NON-button inert chrome: dimmed value, corner <Lock>, cursor-not-allowed,
  // NOT in the tab order, NO cell hover / brand ring. The lock sits UNDER any
  // state tint (`bg-input` base; a locked `drove` keeps its `bg-success/10`
  // wash). Meaning is carried by the glyph + cursor + aria, never colour alone.
  if (isLocked) {
    const lockedSurface = cell.state === 'drove' ? 'bg-success/10' : 'bg-input';
    return (
      <td className={cn('relative h-12 px-1.5 py-1 text-center align-middle', lockedSurface)}>
        <div
          aria-disabled="true"
          aria-label={lockedAriaLabel ?? ariaLabel}
          title={tCell('lockedHint')}
          className="flex h-full w-full cursor-not-allowed items-center justify-center opacity-60"
        >
          <CellDisplay cell={cell} lockedEmpty={cell.state == null} />
          {hasNotes ? (
            <StickyNote
              size={10}
              className="ml-1 inline text-text-sub"
              aria-hidden="true"
            />
          ) : null}
        </div>
        <Lock
          size={11}
          className="pointer-events-none absolute right-1 top-1 text-text-sub"
          aria-hidden="true"
        />
      </td>
    );
  }

  // ── View mode — inert ───────────────────────────────────────────────────
  if (mode === 'view') {
    return (
      <td
        className={cn('h-12 px-1.5 py-1 text-center align-middle', surface)}
        aria-label={ariaLabel}
      >
        <CellDisplay cell={cell} />
        {hasNotes ? (
          <StickyNote
            size={10}
            className="ml-1 inline text-text-sub"
            aria-label={cell.notes ?? undefined}
          />
        ) : null}
      </td>
    );
  }

  // ── Edit mode — a single focusable button that opens the modal editor ───
  return (
    <td className={cn('h-12 p-0 align-middle', surface)}>
      <button
        type="button"
        onClick={() => onOpenEditor?.(cell)}
        aria-label={ariaLabel}
        className={cn(
          'flex h-12 w-full items-center justify-center px-1.5 py-1 text-center',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
          'hover:bg-brand-50 dark:hover:bg-brand/10 transition-colors',
        )}
      >
        <CellDisplay cell={cell} />
        {hasNotes ? (
          <StickyNote
            size={10}
            className="ml-1 inline text-text-sub"
            aria-hidden="true"
          />
        ) : null}
      </button>
    </td>
  );
}
