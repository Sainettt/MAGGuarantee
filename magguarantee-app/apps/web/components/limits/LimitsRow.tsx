'use client';

// `<LimitsRow>` — one (year × month) row of the admin limits table.
// docs/14-design-system.md §`<LimitsRow>` + §16.1–§16.3 (AUTHORITATIVE).
//
// THREE ROW STATES, readable at a glance across all 12 rows:
//   A `default`  — no row / NULL `kmPerDay`: the global fallback (540 km/day,
//                  0,50 €/km) silently applies. Amber sub-line + a
//                  "540 (domyślnie)" placeholder — state A is NEVER expressed
//                  by an empty cell alone, that is exactly the trap this
//                  feature removes.
//   B `disabled` — `0`: guarantee switched off. The only muted (`bg-input/40`)
//                  row in the table + "gwarancja wyłączona (0 km)".
//   C `active`   — `> 0`: an ordinary row, no sub-line.
// No `line-through` anywhere: a disabled month is a valid configuration, not a
// deletion.
//
// CHECKBOX MECHANICS (§16.3, locked):
//   • un-ticking WRITES `0` immediately;
//   • ticking WRITES NOTHING — it only unlocks the input and moves the cell
//     into the fourth `unsaved` state (ticking must not write NULL: NULL would
//     hand the month back the 540 fallback);
//   • blurring an empty field un-ticks the box again and announces it to
//     screen readers;
//   • NO path in this component ever sends `null`.
// The last `> 0` value is remembered for the session, so an accidental
// un-tick + re-tick pre-fills the old number as a DRAFT (still unwritten).
//
// The checkbox lives INSIDE the cell it governs (§16.2) — a checkbox in the
// first column or in a `<th>` would read as row-selection / select-all.
//
// Writes are handed to the parent (`onSave`), which serializes them per
// `yearMonth` — clicking a checkbox blurs the input, so one gesture can emit
// two writes to the same month.

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type {
  MonthlyLimitDto,
  UpdateMonthlyLimitDto,
} from '@magguarantee/shared';

import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import {
  commitOnBlur,
  isOff as isGuaranteeOff,
  toggleGuarantee,
  type GuaranteeCellAction,
  type GuaranteeCellState,
} from '@/lib/limits/guaranteeCell';
import {
  FALLBACK_KM_PER_DAY,
  FALLBACK_RATE_PER_KM,
  formatLimitInput,
  isMonthDisabled,
  parseLimitInput,
} from '@/lib/limits/limitState';
import { cn } from '@/lib/utils';

export interface LimitsRowProps {
  year: number;
  month: number;
  monthLabel: string;
  /** `null` when the backend has no row for this month yet. */
  row: MonthlyLimitDto | null;
  /** Returns a promise so the cell can switch to its `saving` state. */
  onSave: (
    year: number,
    month: number,
    body: UpdateMonthlyLimitDto,
  ) => Promise<void>;
}

type CellState = 'idle' | 'saving' | 'success' | 'error';

function formatRateLabel(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ── Guarantee cell (checkbox + number) ──────────────────────────────

interface GuaranteeCellProps {
  /** Server value: `null` = not configured, `0` = off, `>0` = on. */
  value: number | null;
  /**
   * `true` for `kmPerSaturday`, whose NULL and `0` are behaviourally
   * identical (the Saturday fallback IS zero) — it renders as a plain
   * on/off with no "domyślne" sub-state (§16.1).
   */
  nullMeansOff: boolean;
  /** Checkbox name — MUST name the month (§16.2: SR walks cell by cell). */
  ariaLabel: string;
  /** Input name — the column + month, so it never duplicates the checkbox. */
  inputAriaLabel: string;
  placeholder?: string;
  onCommit: (value: number) => Promise<void>;
}

function GuaranteeCell({
  value,
  nullMeansOff,
  ariaLabel,
  inputAriaLabel,
  placeholder,
  onCommit,
}: GuaranteeCellProps) {
  const t = useTranslations('limits');
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Set while the pointer goes down on THIS cell's checkbox, so the blur it
  // causes doesn't commit the text the toggle is about to override.
  const togglingRef = useRef(false);
  const lastPositive = useRef<number | null>(
    value != null && value > 0 ? value : null,
  );

  const [text, setText] = useState(() => formatLimitInput(value));
  /** Box ticked on an OFF month, nothing written yet — the `unsaved` state. */
  const [draft, setDraft] = useState(false);
  const [cell, setCell] = useState<CellState>('idle');
  const [announcement, setAnnouncement] = useState('');

  const machineState: GuaranteeCellState = {
    value,
    nullMeansOff,
    text,
    draft,
    lastPositive: lastPositive.current,
  };
  const off = isGuaranteeOff(machineState);

  // Mirror external changes (refetch, optimistic patch, year switch).
  useEffect(() => {
    setText(formatLimitInput(value));
    if (value != null && value > 0) lastPositive.current = value;
    // A real value landed ⇒ the draft has been persisted (or overridden).
    if (!(value === 0 || (nullMeansOff && value == null))) setDraft(false);
  }, [value, nullMeansOff]);

  useEffect(() => {
    if (cell !== 'success') return;
    const timer = window.setTimeout(() => setCell('idle'), 800);
    return () => window.clearTimeout(timer);
  }, [cell]);

  const checked = !off || draft;
  const editable = checked;
  const unsaved = off && draft;

  const commit = async (next: number): Promise<void> => {
    setCell('saving');
    try {
      await onCommit(next);
      setCell('success');
    } catch {
      setText(formatLimitInput(value));
      setCell('error');
      window.setTimeout(() => setCell('idle'), 1200);
    }
  };

  // Every transition comes from the pure machine in `lib/limits/guaranteeCell`
  // — this component only applies its effects. That is what keeps the
  // "un-tick writes 0 / tick writes nothing / no NULL ever" contract testable.
  const apply = (action: GuaranteeCellAction): void => {
    if (action.remember !== undefined) lastPositive.current = action.remember;
    if (action.text !== undefined) setText(action.text);
    setDraft(action.draft);
    setAnnouncement(action.announceReverted ? t('unsavedRevertedSr') : '');
    if (action.focusInput) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (action.write !== undefined) void commit(action.write);
  };

  const handleToggle = (next: boolean): void => {
    apply(toggleGuarantee(machineState, next));
  };

  const cancelDraft = (): void => {
    apply({
      draft: false,
      text: formatLimitInput(value),
      announceReverted: true,
    });
  };

  const handleBlur = (): void => {
    // The blur caused by clicking THIS cell's own checkbox must not commit the
    // text the toggle is about to override.
    if (togglingRef.current) return;
    if (!editable) return;
    apply(commitOnBlur(machineState));
  };

  // With a remembered draft the short line is enough; from a cold page the
  // user needs the full instruction (§16.3).
  const subline = !unsaved
    ? null
    : lastPositive.current != null
      ? t('unsaved')
      : t('unsavedHint');

  return (
    <div>
      <div className="flex items-center gap-2">
        {/* 36×36 hit area (WCAG 2.2 AA target size is 24×24; 36 is the
            deliberate density compromise recorded in §16.2). */}
        <label
          className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-input"
          onPointerDown={() => {
            togglingRef.current = true;
            window.setTimeout(() => {
              togglingRef.current = false;
            }, 0);
          }}
        >
          <Checkbox
            className="h-4 w-4"
            checked={checked}
            disabled={cell === 'saving'}
            aria-label={ariaLabel}
            onChange={(e) => handleToggle(e.target.checked)}
          />
        </label>
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            aria-label={inputAriaLabel}
            aria-describedby={subline ? hintId : undefined}
            value={editable ? text : '0'}
            readOnly={!editable}
            disabled={cell === 'saving'}
            placeholder={editable ? placeholder : undefined}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                if (draft) cancelDraft();
                else setText(formatLimitInput(value));
              }
            }}
            className={cn(
              'h-9 w-24 tabular-nums transition-colors',
              !editable && 'cursor-not-allowed bg-input/40 text-text-sub',
              unsaved && 'border-warning bg-warning/5 focus:border-warning',
              cell === 'error' && 'border-danger focus:border-danger',
              cell === 'success' && 'border-success focus:border-success',
            )}
          />
          {cell === 'saving' && (
            <Loader2
              aria-hidden
              size={14}
              className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-text-sub"
            />
          )}
        </div>
      </div>
      {subline && (
        <p
          id={hintId}
          className="mt-1 max-w-[16rem] text-[11px] text-warning-dark dark:text-warning"
        >
          {subline}
        </p>
      )}
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

// ── Rate cell (no on/off — a price, not a quantity) ─────────────────

interface RateCellProps {
  value: number | null;
  ariaLabel: string;
  /** The month pays nothing — the kept rate renders muted with a hint. */
  muted: boolean;
  mutedTitle: string;
  onCommit: (value: number) => Promise<void>;
}

function RateCell({
  value,
  ariaLabel,
  muted,
  mutedTitle,
  onCommit,
}: RateCellProps) {
  const [text, setText] = useState(() => formatLimitInput(value));
  const [cell, setCell] = useState<CellState>('idle');

  useEffect(() => {
    setText(formatLimitInput(value));
  }, [value]);

  useEffect(() => {
    if (cell !== 'success') return;
    const timer = window.setTimeout(() => setCell('idle'), 800);
    return () => window.clearTimeout(timer);
  }, [cell]);

  const handleBlur = async (): Promise<void> => {
    const parsed = parseLimitInput(text);
    if (parsed.kind !== 'value') {
      setText(formatLimitInput(value));
      return;
    }
    if (parsed.value === value) return;
    setCell('saving');
    try {
      await onCommit(parsed.value);
      setCell('success');
    } catch {
      setText(formatLimitInput(value));
      setCell('error');
      window.setTimeout(() => setCell('idle'), 1200);
    }
  };

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        disabled={cell === 'saving'}
        title={muted ? mutedTitle : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void handleBlur()}
        className={cn(
          'h-9 w-24 tabular-nums transition-colors',
          // Kept + editable, just visually quiet: the rate survives a disabled
          // month so it doesn't have to be retyped when it comes back on.
          muted && 'text-text-sub',
          cell === 'error' && 'border-danger focus:border-danger',
          cell === 'success' && 'border-success focus:border-success',
        )}
      />
      {cell === 'saving' && (
        <Loader2
          aria-hidden
          size={14}
          className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-text-sub"
        />
      )}
    </div>
  );
}

export function LimitsRow({
  year,
  month,
  monthLabel,
  row,
  onSave,
}: LimitsRowProps) {
  const t = useTranslations('limits');
  const kmPerDay = row?.kmPerDay ?? null;
  const ratePerKm = row?.ratePerKm ?? null;
  const kmPerSaturday = row?.kmPerSaturday ?? null;

  const unconfigured = kmPerDay == null;
  const monthOff = isMonthDisabled(row);

  return (
    <tr
      className={cn(
        'border-b border-border last:border-b-0',
        monthOff && 'bg-input/40',
      )}
    >
      <td className="h-12 px-3 py-2 align-middle">
        <span
          className={cn(
            'block',
            monthOff ? 'text-text-sub' : 'font-semibold text-text',
          )}
        >
          {monthLabel}
        </span>
        {unconfigured && (
          <span className="mt-0.5 block text-[11px] text-warning-dark dark:text-warning">
            {t('stateDefault', {
              kmPerDay: FALLBACK_KM_PER_DAY,
              rate: formatRateLabel(FALLBACK_RATE_PER_KM),
            })}
          </span>
        )}
        {monthOff && (
          <span className="mt-0.5 block text-[11px] text-text-sub">
            {t('stateDisabled')}
          </span>
        )}
      </td>
      <td className="h-12 px-3 py-2 align-middle">
        <GuaranteeCell
          value={kmPerDay}
          nullMeansOff={false}
          ariaLabel={t('toggleDay', { month: `${monthLabel} ${year}` })}
          inputAriaLabel={`${t('columns.kmPerDay')} — ${monthLabel} ${year}`}
          placeholder={t('placeholderDefault', { value: FALLBACK_KM_PER_DAY })}
          onCommit={(v) => onSave(year, month, { kmPerDay: v })}
        />
      </td>
      <td className="h-12 px-3 py-2 align-middle">
        <GuaranteeCell
          value={kmPerSaturday}
          nullMeansOff
          ariaLabel={t('toggleSaturday', { month: `${monthLabel} ${year}` })}
          inputAriaLabel={`${t('columns.kmPerSaturday')} — ${monthLabel} ${year}`}
          onCommit={(v) => onSave(year, month, { kmPerSaturday: v })}
        />
      </td>
      <td className="h-12 px-3 py-2 align-middle">
        <RateCell
          value={ratePerKm}
          ariaLabel={`${t('columns.ratePerKm')} — ${monthLabel} ${year}`}
          muted={monthOff}
          mutedTitle={t('disabledRateHint')}
          onCommit={(v) => onSave(year, month, { ratePerKm: v })}
        />
      </td>
      <td className="h-12 px-3 py-2 align-middle text-xs tabular-nums text-text-sub">
        {row?.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}
      </td>
    </tr>
  );
}
