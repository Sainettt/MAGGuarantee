'use client';

// §7.10.2 dialog D — weryfikator's `/returned` transition (`w_trasie →
// zjechal`). The §7.1(b) confirm-with-date shape: a single DATE-ONLY field
// (`actualReturnAt`, `YYYY-MM-DD`) pre-filled with `plannedReturnAt`. RHF + Zod
// (`mode:'onChange'`), submit disabled until valid, dialog stays OPEN on error
// so the date isn't re-typed.
//
// Differences vs the §7.1 legacy returned-dialog (locked in §7.10.2):
//   - pre-filled with `plannedReturnAt` (best default; verifier overrides only
//     if the truck came back a different day). Falls back to today if absent.
//   - date-only (`<Input type="date">`, never datetime-local).
//   - required (empty → inline «Podaj datę zjazdu»); future-date guarded
//     («Data zjazdu nie może być w przyszłości»). The api re-validates.
//
// Server-side side effects (`vehicle.lastDroveAt` bump + linked-wniosek
// auto-recalc) are invisible here — the signal surfaces later on the pracownik
// ClaimModal (§7.10.4).

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
  /** Best default for the date field — the carrier's planned return day. */
  plannedReturnAt: string | null;
  title: string;
  description: string;
  dateLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Inline error copy. */
  requiredMsg: string;
  futureMsg: string;
  /**
   * Runs the transition with the chosen date. Awaited — dialog closes on
   * resolve, stays OPEN on reject (parent toasts; the date stays typed).
   */
  onConfirm: (actualReturnAt: string) => void | Promise<void>;
}

export function MarkReturnedDialog({
  open,
  onOpenChange,
  plate,
  plannedReturnAt,
  title,
  description,
  dateLabel,
  confirmLabel,
  cancelLabel,
  requiredMsg,
  futureMsg,
  onConfirm,
}: Props) {
  const today = useMemo(() => todayBusinessTzIso(), []);
  // Pre-fill with the planned return (date-only slice), else today.
  const defaultDate = (plannedReturnAt ?? today).slice(0, 10);

  const [value, setValue] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  // Re-seed when a different delegation opens the dialog.
  useEffect(() => {
    if (open) {
      setValue(defaultDate);
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plannedReturnAt]);

  const error = !value ? requiredMsg : value > today ? futureMsg : undefined;
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
            type="date"
            className="h-10"
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
