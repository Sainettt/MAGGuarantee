'use client';

// §7.10.2 dialog D — weryfikator's `/returned` transition (`w_trasie →
// zjechal`). A single DATETIME field (`actualReturnAt`) — the linked wniosek's
// `dateEnd` derives from its DAY and `timeTo` from its wall-clock `HH:mm`.
//
// Behaviour (Step 2 — precise times):
//   - `<input type="datetime-local">`: the verifier captures the day AND the
//     time the vehicle actually returned.
//   - default date = the carrier's planned return (`plannedReturnAt`, date-only,
//     falls back to today); default time = a sensible guess — current time when
//     the planned day is today/future, else end-of-day `23:59` for a past
//     planned day. The verifier overrides freely.
//   - `min` = the actual departure moment (`actualDepartureAt`, wall-clock;
//     falls back to the reported departure) — you cannot return before you left.
//     `max` = now (no future).
//   - required (empty → «Podaj datę i godzinę zjazdu»); future-datetime guarded
//     and a before-departure guard. The api re-validates (422 RETURN_DATE_FUTURE
//     / RETURN_BEFORE_DEPARTURE — the parent maps those to toasts on the rare
//     clock-skew / stale-data race the client guards don't catch).
//   - stays OPEN on error so the typed value isn't re-typed.
//
// The wall-clock is sent VERBATIM (`datetimeLocalToApiIso` appends `:00Z`) —
// see `lib/format/datetimeLocal.ts` for the tz rationale.
//
// Server-side side effects (`vehicle.lastDroveAt` bump + linked-wniosek
// auto-recalc) are invisible here — the signal surfaces later on the pracownik
// ClaimModal (§7.10.4).

import { useEffect, useMemo, useState } from 'react';
import { businessDateIso } from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { FormField } from '@/components/forms/Form';
import { Input } from '@/components/ui/Input';
import {
  actualIsoToDatetimeLocal,
  datetimeLocalToApiIso,
  isoToDatetimeLocal,
  nowDatetimeLocal,
} from '@/lib/format/datetimeLocal';
import { useVehicleDailyKmHistory } from '@/lib/hooks/useVehicleKm';

/** Inclusive list of `YYYY-MM-DD` days from `fromIso` to `toIso` (UTC, DST-safe). */
function eachUtcDay(fromIso: string, toIso: string): string[] {
  const [fy, fm, fd] = fromIso.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = toIso.split('-').map(Number) as [number, number, number];
  const out: string[] = [];
  let cur = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  while (cur <= end) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86_400_000;
  }
  return out;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plate: string;
  /** Best default for the date field — the carrier's planned return day. */
  plannedReturnAt: string | null;
  /**
   * The outing's vehicle (for the km-completeness hint) and its departure.
   * `vehicleId === null` (vehicle unassigned) silently skips the hint.
   */
  vehicleId: string | null;
  /**
   * Reported departure (a TRUE UTC instant — docs/19 #16) — km-window start
   * (its Warsaw calendar day) + fallback lower bound.
   */
  departureAt: string;
  /**
   * Actual departure moment (set once the outing went `w_trasie`) — the hard
   * lower bound: you cannot return before you left. Falls back to `departureAt`.
   */
  actualDepartureAt: string | null;
  title: string;
  description: string;
  dateLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Inline error copy. */
  requiredMsg: string;
  futureMsg: string;
  beforeDepartureMsg: string;
  /**
   * Non-blocking hint copy — given the count of past outing days that still
   * have NO km on the board, returns the warning line. Absent ⇒ no hint.
   */
  incompleteWarning?: (count: number) => string;
  /**
   * Runs the transition with the chosen datetime as a full API ISO string
   * (`YYYY-MM-DDTHH:mm:00Z`). Awaited — dialog closes on resolve, stays OPEN on
   * reject (parent toasts; the value stays typed).
   */
  onConfirm: (actualReturnAt: string) => void | Promise<void>;
}

export function MarkReturnedDialog({
  open,
  onOpenChange,
  plate,
  plannedReturnAt,
  vehicleId,
  departureAt,
  actualDepartureAt,
  title,
  description,
  dateLabel,
  confirmLabel,
  cancelLabel,
  requiredMsg,
  futureMsg,
  beforeDepartureMsg,
  incompleteWarning,
  onConfirm,
}: Props) {
  const now = useMemo(() => nowDatetimeLocal(), []);
  const today = now.slice(0, 10);

  // Pre-fill: planned return DAY (date-only) + a sensible default time. A past
  // planned day defaults to end-of-day; today/future to the current time (kept
  // non-future for the common «marking it now» case).
  const defaultValue = useMemo(() => {
    const day = (plannedReturnAt ?? today).slice(0, 10);
    const time = day < today ? '23:59' : now.slice(11, 16);
    return `${day}T${time}`;
  }, [plannedReturnAt, today, now]);

  // Hard lower bound — the actual departure (wall-clock), else reported.
  const minDatetime = actualDepartureAt
    ? actualIsoToDatetimeLocal(actualDepartureAt)
    : isoToDatetimeLocal(departureAt);

  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  // Re-seed when a different delegation opens the dialog.
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plannedReturnAt]);

  const error = !value
    ? requiredMsg
    : value > now
      ? futureMsg
      : minDatetime && value < minDatetime
        ? beforeDepartureMsg
        : undefined;
  const valid = !error;

  // Informational km-completeness hint (§7.10 — REWORK): pull this vehicle's
  // daily-km marks across the outing window `[departure … chosen return DAY]`
  // and count PAST days with no mark at all (a `drove`/`idle` cell both count as
  // «filled»; only «not checked» is missing). Today/future are excluded — the
  // board locks them, so flagging them would be noise. Read-only: never blocks.
  // Window start = the REPORTED departure's day. `departureAt` is a TRUE UTC
  // instant (docs/19 #16), so its day is the WARSAW calendar date — a raw ISO
  // slice is the UTC day, one day early for a departure declared at 00:00–00:59
  // CET / 00:00–01:59 CEST (UWAGI #30), which would fetch and flag a prior-trip
  // day. `returnDay` is the datetime-local field value (wall-clock) → raw slice.
  const departureDay = useMemo(
    () => businessDateIso(new Date(departureAt)),
    [departureAt],
  );
  const returnDay = value.slice(0, 10);
  const { data: kmHistory } = useVehicleDailyKmHistory(
    open && vehicleId ? vehicleId : null,
    { from: departureDay, to: returnDay || departureDay },
  );
  const missingDaysCount = useMemo(() => {
    if (!valid || !vehicleId) return 0;
    const filled = new Set((kmHistory ?? []).map((r) => r.date));
    return eachUtcDay(departureDay, returnDay).filter(
      (d) => d < today && !filled.has(d),
    ).length;
  }, [valid, vehicleId, kmHistory, departureDay, returnDay, today]);

  const handleConfirm = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    try {
      await onConfirm(datetimeLocalToApiIso(value));
      onOpenChange(false);
    } catch {
      // Stay open so the value isn't re-typed; parent surfaces the error toast
      // (incl. the 422 RETURN_DATE_FUTURE / RETURN_BEFORE_DEPARTURE mapping).
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <FormField
          label={dateLabel}
          required
          error={touched ? error : undefined}
          htmlFor="deleg-actualReturnAt"
        >
          <Input
            id="deleg-actualReturnAt"
            type="datetime-local"
            className="h-10"
            min={minDatetime || undefined}
            max={now}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !!error}
          />
        </FormField>

        {incompleteWarning && missingDaysCount > 0 && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-dark dark:bg-warning/15 dark:text-warning"
          >
            {incompleteWarning(missingDaysCount)}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={busy || !valid}
            aria-label={`${confirmLabel} — ${plate}`}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
