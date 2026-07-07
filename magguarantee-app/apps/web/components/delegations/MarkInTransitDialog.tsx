'use client';

// §7.10.2 dialog C — weryfikator's `/in-transit` transition (`gotowy →
// w_trasie`). The §7.1(b) confirm-with-date shape (mirrors <MarkReturnedDialog>):
// a single DATE-ONLY field (`actualDepartureAt`, `YYYY-MM-DD`) that records the
// day the vehicle ACTUALLY started driving — the verifier may set the status
// days after the fact, so they backdate the real start.
//
// Behaviour (locked in §7.10.2 dialog C):
//   - default = TODAY (not the reported `departureAt`): the common case is
//     «marking it today»; the verifier lowers it only when the truck actually
//     left earlier.
//   - `min` = the reported departure DATE (`departureAt`); the field must not
//     allow an earlier day. `max` = today (no future).
//   - required (empty → «Podaj datę wyjazdu»); future-date guarded, and a
//     before-reported-departure guard. The api re-validates (422
//     DEPARTURE_DATE_FUTURE / DEPARTURE_BEFORE_REPORTED).
//   - stays OPEN on error so the typed date isn't lost.
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

const BUSINESS_TZ = 'Europe/Warsaw';

/** `YYYY-MM-DD` of today in the MAGTRANS operating timezone. */
function todayBusinessTzIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plate: string;
  /** The outing's reported departure day — the earliest allowed value (`min`). */
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
   * Runs the transition with the chosen date. Awaited — dialog closes on
   * resolve, stays OPEN on reject (parent toasts; the date stays typed).
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
  const today = useMemo(() => todayBusinessTzIso(), []);
  // Default = today (NOT the reported departure): the verifier lowers it only
  // when the truck actually started driving on an earlier day.
  const departureDay = departureAt.slice(0, 10);

  const [value, setValue] = useState(today);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  // Re-seed when a different delegation opens the dialog.
  useEffect(() => {
    if (open) {
      setValue(today);
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, departureAt]);

  const error = !value
    ? requiredMsg
    : value > today
      ? futureMsg
      : value < departureDay
        ? beforeDepartureMsg
        : undefined;
  const valid = !error;

  const handleConfirm = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    try {
      await onConfirm(value);
      onOpenChange(false);
    } catch {
      // Stay open so the date isn't re-typed; parent surfaces the error toast.
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
            type="date"
            className="h-10"
            min={departureDay}
            max={today}
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
