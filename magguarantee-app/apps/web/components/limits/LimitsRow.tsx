'use client';

// Phase 4.5 — `<LimitsRow>` per docs/14-design-system.md L819.
//
// One row per (year × month). Two editable inputs (kmPerDay, ratePerKm)
// with save-on-blur. Local state buffers the input while the user types so
// each keystroke doesn't fire a request; on blur we diff against the
// server value and PUT only if it changed.
//
// Cell states (per DS):
//   - idle    : default border
//   - saving  : input disabled + small spinner right-of-input
//   - success : short green underline (200ms after save), then fades out
//   - error   : restored value + toast (parent handles toast via mutation)
//
// We deliberately keep the row a pure "presentational" component — it
// delegates the mutation call back to the parent so the page owns the
// optimistic-cache plumbing and Sonner toasts (single source of truth).

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  MonthlyLimitDto,
  UpdateMonthlyLimitDto,
} from '@magguarantee/shared';

import { Input } from '@/components/ui/Input';
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

/** Parse the raw text input into a positive number, or `null` if empty. */
function parseNumeric(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // Accept comma as decimal separator (PL convention) — convert before parse.
  const normalized = trimmed.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return 'invalid';
  return n;
}

function formatNumeric(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  return String(n);
}

interface CellProps {
  initial: number | null;
  field: 'kmPerDay' | 'ratePerKm';
  step: string;
  ariaLabel: string;
  onCommit: (value: number) => Promise<void>;
}

function EditableCell({
  initial,
  field: _field,
  step,
  ariaLabel,
  onCommit,
}: CellProps) {
  void _field;
  const [value, setValue] = useState<string>(formatNumeric(initial));
  const [state, setState] = useState<CellState>('idle');

  // External value can change (server refetch after success, optimistic
  // patch settles, year switch) — mirror it back into the input when not
  // editing.
  useEffect(() => {
    setValue(formatNumeric(initial));
  }, [initial]);

  // Success-flash fades back to idle after 800ms so the user sees confirmation
  // without the underline lingering.
  useEffect(() => {
    if (state !== 'success') return;
    const t = window.setTimeout(() => setState('idle'), 800);
    return () => window.clearTimeout(t);
  }, [state]);

  const handleBlur = async () => {
    const parsed = parseNumeric(value);
    if (parsed === 'invalid') {
      // Reset to last known good value and bail — Zod on the server would
      // reject anyway and the optimistic toast spam is louder than helpful.
      setValue(formatNumeric(initial));
      setState('idle');
      return;
    }
    if (parsed === null) {
      // Empty value — leave as null on the server (which means "unset").
      // No-op if it was already null.
      if (initial === null) return;
      // Backend's `UpdateMonthlyLimitSchema` requires `positive()`, so we
      // can't send null to clear; treat "empty" as "no change" for now.
      setValue(formatNumeric(initial));
      return;
    }
    if (parsed === initial) return;
    setState('saving');
    try {
      await onCommit(parsed);
      setState('success');
    } catch {
      setValue(formatNumeric(initial));
      setState('error');
      window.setTimeout(() => setState('idle'), 1200);
    }
  };

  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        step={step}
        aria-label={ariaLabel}
        value={value}
        disabled={state === 'saving'}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void handleBlur()}
        className={cn(
          'h-9 w-28 tabular-nums',
          state === 'error' && 'border-danger focus:border-danger',
        )}
      />
      {state === 'saving' && (
        <Loader2
          aria-hidden
          size={14}
          className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-text-sub"
        />
      )}
      {state === 'success' && (
        <span
          aria-hidden
          className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-success"
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
  const kmPerDay = row?.kmPerDay ?? null;
  const ratePerKm = row?.ratePerKm ?? null;
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-3 py-2 h-12 align-middle font-semibold text-text">
        {monthLabel}
      </td>
      <td className="px-3 py-2 h-12 align-middle">
        <EditableCell
          initial={kmPerDay}
          field="kmPerDay"
          step="0.01"
          ariaLabel={`kmPerDay ${monthLabel}`}
          onCommit={(v) => onSave(year, month, { kmPerDay: v })}
        />
      </td>
      <td className="px-3 py-2 h-12 align-middle">
        <EditableCell
          initial={ratePerKm}
          field="ratePerKm"
          step="0.0001"
          ariaLabel={`ratePerKm ${monthLabel}`}
          onCommit={(v) => onSave(year, month, { ratePerKm: v })}
        />
      </td>
      <td className="px-3 py-2 h-12 align-middle text-xs text-text-sub tabular-nums">
        {row?.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}
      </td>
    </tr>
  );
}
