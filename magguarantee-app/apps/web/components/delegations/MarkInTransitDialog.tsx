'use client';

// §7.10.2 dialog C — weryfikator's `/in-transit` transition (`gotowy →
// w_trasie`). A single DATETIME field (`actualDepartureAt`) that records the
// exact MOMENT the vehicle actually started driving — the linked wniosek's
// `dateStart` derives from its DAY and `timeFrom` from its wall-clock `HH:mm`
// (the carrier no longer types a time window).
//
// Behaviour (Step 2 — precise times):
//   - `<input type="datetime-local">` — the verifier captures the day AND the
//     time in one control.
//   - default = the carrier-REPORTED `departureAt` (date + time), NOT today
//     (Task 4 auto-fill): the punctual case needs zero edits — the derived
//     `timeFrom` then equals the reported departure time. The verifier adjusts
//     only when the truck actually left at a different moment.
//   - `min` = start of the reported departure DAY; `max` = now (no future).
//   - required (empty → «Podaj datę i godzinę wyjazdu»); future-datetime guarded
//     and a before-reported-departure-DAY guard (earlier same-day IS allowed,
//     mirroring the api). The api re-validates (422 DEPARTURE_DATE_FUTURE /
//     DEPARTURE_BEFORE_REPORTED).
//   - stays OPEN on error so the typed value isn't lost.
//
// The wall-clock is sent VERBATIM (`datetimeLocalToApiIso` appends `:00Z`) —
// see `lib/format/datetimeLocal.ts` for the tz rationale.
//
// Server-side side effect: `actualDepartureAt` becomes the ACTUAL start of the
// guarantee period, so the api auto-recalcs the linked wniosek. That signal is
// invisible here — it surfaces later on the pracownik ClaimModal (§7.10.4).

import { useEffect, useMemo, useState } from 'react';

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
  datetimeLocalToApiIso,
  isoToDatetimeLocal,
  nowDatetimeLocal,
} from '@/lib/format/datetimeLocal';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plate: string;
  /** The outing's reported departure — auto-fill default + earliest allowed day. */
  departureAt: string;
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
   * Runs the transition with the chosen datetime as a full API ISO string
   * (`YYYY-MM-DDTHH:mm:00Z`). Awaited — dialog closes on resolve, stays OPEN on
   * reject (parent toasts; the value stays typed).
   */
  onConfirm: (actualDepartureAt: string) => void | Promise<void>;
}

export function MarkInTransitDialog({
  open,
  onOpenChange,
  plate,
  departureAt,
  title,
  description,
  dateLabel,
  confirmLabel,
  cancelLabel,
  requiredMsg,
  futureMsg,
  beforeDepartureMsg,
  onConfirm,
}: Props) {
  const now = useMemo(() => nowDatetimeLocal(), []);
  // Auto-fill default = the reported departure (date + time), local wall-clock.
  const departureDefault = useMemo(
    () => isoToDatetimeLocal(departureAt),
    [departureAt],
  );
  const departureDay = departureDefault.slice(0, 10);

  const [value, setValue] = useState(departureDefault);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  // Re-seed when a different delegation opens the dialog.
  useEffect(() => {
    if (open) {
      setValue(departureDefault);
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, departureAt]);

  const error = !value
    ? requiredMsg
    : value > now
      ? futureMsg
      : // earlier same-day start IS allowed — only a strictly earlier DAY blocks.
        value.slice(0, 10) < departureDay
        ? beforeDepartureMsg
        : undefined;
  const valid = !error;

  const handleConfirm = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    try {
      await onConfirm(datetimeLocalToApiIso(value));
      onOpenChange(false);
    } catch {
      // Stay open so the value isn't re-typed; parent surfaces the error toast.
      // A 422 (DEPARTURE_DATE_FUTURE / DEPARTURE_BEFORE_REPORTED) lands here too.
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
          htmlFor="deleg-actualDepartureAt"
        >
          <Input
            id="deleg-actualDepartureAt"
            type="datetime-local"
            className="h-10"
            min={`${departureDay}T00:00`}
            max={now}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !!error}
          />
        </FormField>

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
