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
//   • edit — in-cell editor (weryfikator board): a drove/nie-jeździ toggle +
//     a numeric km <Input> (drove only). Commit on blur / Enter → the parent's
//     `onCommit` (PUT upsert, optimistic). Esc reverts. Keyboard cell nav
//     (Enter = commit + move down, arrows/Tab handled by the grid) keeps the
//     board usable as a spreadsheet without a mouse.
//
// No new tokens: tints are `bg-{success}/10` opacity variants; the focus ring is
// the brand ring; soft surfaces are `bg-input` only.

import { Check, ParkingSquare, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { VehicleDayState, VehicleKmCellDto } from '@magguarantee/shared';

import { Input } from '@/components/ui/Input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/Popover';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/utils';

export interface KmCellCommit {
  state: VehicleDayState;
  km?: number;
  notes?: string;
}

export interface KmCellHandle {
  focus: () => void;
}

interface KmCellProps {
  cell: VehicleKmCellDto;
  mode: 'view' | 'edit';
  /** Weekend (Sat/Sun) — faint `bg-input` tint to separate the work week.
   *  Today's brand accent lives on the column header (§7.7.3), not the cell. */
  isWeekend?: boolean;
  /** a11y label for the cell button, e.g. «WGM1234, Pn 09.06: Jechał». */
  ariaLabel: string;
  /** Commit handler (edit mode). Returns void; the parent persists optimistically. */
  onCommit?: (next: KmCellCommit) => void;
  /** Enter-to-move-down: the grid focuses the same column on the next row. */
  onEnterDown?: () => void;
}

/**
 * Read-only cell body — the three locked visuals (§7.7.1). Shared by both modes
 * (edit mode renders this until the cell is activated for editing).
 */
function CellDisplay({ cell }: { cell: VehicleKmCellDto }) {
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
  return (
    <span className="text-text-sub/60" aria-hidden="true">
      —
    </span>
  );
}

export const KmCell = forwardRef<KmCellHandle, KmCellProps>(function KmCell(
  { cell, mode, isWeekend, ariaLabel, onCommit, onEnterDown },
  ref,
) {
  const t = useTranslations('weryfikator.km.cell');
  const tNotes = useTranslations('weryfikator.km.notesPopover');

  const [editing, setEditing] = useState(false);
  const [draftState, setDraftState] = useState<VehicleDayState>(
    cell.state ?? 'drove',
  );
  const [kmText, setKmText] = useState(
    cell.state === 'drove' && cell.km != null ? String(cell.km) : '',
  );
  const [kmError, setKmError] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesText, setNotesText] = useState(cell.notes ?? '');

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const kmInputRef = useRef<HTMLInputElement | null>(null);

  // Keep local draft in sync when the cached cell changes under us (e.g. the
  // optimistic patch reconciles with the server reply).
  useEffect(() => {
    if (editing) return;
    setDraftState(cell.state ?? 'drove');
    setKmText(cell.state === 'drove' && cell.km != null ? String(cell.km) : '');
    setNotesText(cell.notes ?? '');
  }, [cell.state, cell.km, cell.notes, editing]);

  useImperativeHandle(ref, () => ({
    focus: () => buttonRef.current?.focus(),
  }));

  const beginEdit = () => {
    if (mode !== 'edit') return;
    setEditing(true);
    // Defer focus until the input renders.
    requestAnimationFrame(() => kmInputRef.current?.focus());
  };

  const revert = () => {
    setDraftState(cell.state ?? 'drove');
    setKmText(cell.state === 'drove' && cell.km != null ? String(cell.km) : '');
    setNotesText(cell.notes ?? '');
    setKmError(false);
    setEditing(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const commit = (opts?: { moveDown?: boolean }) => {
    if (draftState === 'drove') {
      const km = Number(kmText);
      if (kmText.trim() === '' || Number.isNaN(km) || km <= 0) {
        setKmError(true);
        return;
      }
      setKmError(false);
      onCommit?.({ state: 'drove', km, notes: notesText.trim() || undefined });
    } else {
      setKmError(false);
      onCommit?.({ state: 'idle', notes: notesText.trim() || undefined });
    }
    setEditing(false);
    if (opts?.moveDown) onEnterDown?.();
    else requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const onInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit({ moveDown: true });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      revert();
    }
  };

  const onButtonKeyDown = (e: KeyboardEvent) => {
    if (mode !== 'edit') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      beginEdit();
    }
  };

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

  // ── Inert (view mode, or edit-mode not-yet-activated) ───────────────────
  if (!editing) {
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
    return (
      <td className={cn('h-12 p-0 align-middle', surface)}>
        <button
          ref={buttonRef}
          type="button"
          onClick={beginEdit}
          onKeyDown={onButtonKeyDown}
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

  // ── Inline editor (edit mode, activated) ────────────────────────────────
  return (
    <td className={cn('h-12 p-1 align-middle', surface)}>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-0.5" role="group" aria-label={ariaLabel}>
          <button
            type="button"
            aria-pressed={draftState === 'drove'}
            onClick={() => {
              setDraftState('drove');
              requestAnimationFrame(() => kmInputRef.current?.focus());
            }}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              draftState === 'drove'
                ? 'bg-success/15 text-success'
                : 'text-text-sub hover:bg-input',
            )}
          >
            {t('drove')}
          </button>
          <button
            type="button"
            aria-pressed={draftState === 'idle'}
            onClick={() => {
              setDraftState('idle');
              setKmText('');
              setKmError(false);
            }}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              draftState === 'idle'
                ? 'bg-text-sub/15 text-text'
                : 'text-text-sub hover:bg-input',
            )}
          >
            {t('idle')}
          </button>
          <Popover open={notesOpen} onOpenChange={setNotesOpen}>
            <PopoverAnchor>
              <button
                type="button"
                aria-label={t('notePlaceholder')}
                onClick={() => setNotesOpen((o) => !o)}
                className={cn(
                  'rounded p-0.5 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  notesText.trim() ? 'text-info' : 'text-text-sub hover:bg-input',
                )}
              >
                <StickyNote size={12} aria-hidden="true" />
              </button>
            </PopoverAnchor>
            <PopoverContent className="w-56 p-3">
              <p className="mb-1.5 text-xs font-semibold text-text-sub">
                {tNotes('title')}
              </p>
              <Textarea
                rows={3}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder={t('notePlaceholder')}
                className="text-sm"
              />
            </PopoverContent>
          </Popover>
        </div>

        {draftState === 'drove' ? (
          <Input
            ref={kmInputRef}
            inputMode="numeric"
            value={kmText}
            onChange={(e) => {
              setKmText(e.target.value);
              if (kmError) setKmError(false);
            }}
            onKeyDown={onInputKeyDown}
            onBlur={() => {
              // Don't commit while the notes popover steals focus.
              if (notesOpen) return;
              commit();
            }}
            aria-label={t('kmPlaceholder')}
            aria-invalid={kmError}
            placeholder={t('kmPlaceholder')}
            className={cn(
              'h-8 w-16 text-center font-mono tabular-nums',
              kmError && 'border-danger focus-visible:ring-danger',
            )}
          />
        ) : (
          <button
            type="button"
            onClick={() => commit()}
            onKeyDown={onInputKeyDown}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-text-sub',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            )}
          >
            <ParkingSquare size={12} aria-hidden="true" />
            {t('idle')}
          </button>
        )}
        {kmError ? (
          <span className="sr-only" role="alert">
            {t('kmRequired')}
          </span>
        ) : null}
      </div>
    </td>
  );
});
