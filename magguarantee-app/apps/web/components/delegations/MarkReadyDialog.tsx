'use client';

// §7.10.2 dialogs A + B — eksport's `/ready` transitions. One component, two
// `variant`s so the eksport board can render either the advance (A: `zgloszony
// → gotowy`) or the guarded rollback (B: `gotowy → zgloszony`, pre-`w_trasie`
// only) without duplicating the §7.1 confirm-<Dialog> shell.
//
// The ADVANCE branch now carries a MANDATORY «Nr zlecenia ze spedu»
// (`spedOrderNumber`) text field: eksport may only mark an outing załadowany
// once the SpedTrans zlecenie exists, so the number is required and stored on
// the delegation. The ROLLBACK branch stays a plain confirm — the field is
// neither shown nor sent (the server ignores it and clears the stored value).
//
// Shape per §7.10.2: centered <Dialog>, `bg-card`, ghost «Anuluj» = dismiss
// (NOT the business-cancel — delegation-cancel stays carrier/admin-only and is
// not on this board), brand-red primary. `await onConfirm(...)`; close on
// resolve, stay open on reject so the parent can toast and the operator can
// retry (the typed number is preserved).

import { useEffect, useState } from 'react';

import { FormField } from '@/components/forms/Form';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';

export type MarkReadyVariant = 'advance' | 'rollback';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant: MarkReadyVariant;
  /** Plate of the delegation — interpolated into the title/description copy. */
  plate: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  /**
   * «Nr zlecenia ze spedu» field copy — only used on the `advance` branch (the
   * field is neither rendered nor sent on `rollback`).
   */
  spedOrderNumberLabel: string;
  spedOrderNumberPlaceholder: string;
  spedOrderNumberRequired: string;
  /**
   * Runs the transition. On `advance` it receives the trimmed sped order
   * number; on `rollback` it is called with `undefined` (the field is not sent).
   * Awaited — dialog closes on resolve, stays open on reject (parent surfaces
   * the error toast; the typed number is preserved for a retry).
   */
  onConfirm: (spedOrderNumber?: string) => void | Promise<void>;
}

export function MarkReadyDialog({
  open,
  onOpenChange,
  variant,
  plate,
  title,
  description,
  confirmLabel,
  cancelLabel,
  spedOrderNumberLabel,
  spedOrderNumberPlaceholder,
  spedOrderNumberRequired,
  onConfirm,
}: Props) {
  const isAdvance = variant === 'advance';

  const [spedOrderNumber, setSpedOrderNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  // Reset the field every time the dialog opens (or the variant flips) so a
  // stale value can't leak between trips.
  useEffect(() => {
    if (open) {
      setSpedOrderNumber('');
      setTouched(false);
    }
  }, [open, variant]);

  const trimmed = spedOrderNumber.trim();
  // Required ONLY on the advance branch; rollback never shows/sends the field.
  const error = isAdvance && !trimmed ? spedOrderNumberRequired : undefined;
  const valid = !error;

  const handleConfirm = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    try {
      // Advance → send the trimmed number; rollback → omit it entirely.
      await onConfirm(isAdvance ? trimmed : undefined);
      onOpenChange(false);
    } catch {
      // Stay open; parent toasts so the operator can retry.
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

        {isAdvance && (
          <FormField
            label={spedOrderNumberLabel}
            required
            error={touched ? error : undefined}
            htmlFor="deleg-spedOrderNumber"
          >
            <Input
              id="deleg-spedOrderNumber"
              className="h-10"
              autoFocus
              maxLength={64}
              placeholder={spedOrderNumberPlaceholder}
              value={spedOrderNumber}
              onChange={(e) => setSpedOrderNumber(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !!error}
            />
          </FormField>
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
          {/* Brand-red default — this IS the page's primary affordance for the
              single-purpose eksport role (§7.10.2). Gated on `valid` so the
              advance flip can't fire without a sped order number. */}
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
