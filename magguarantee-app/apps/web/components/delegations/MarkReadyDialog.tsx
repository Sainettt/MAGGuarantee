'use client';

// §7.10.2 dialogs A + B — eksport's `/ready` transitions (plain confirm, no
// input). One component, two `variant`s so the eksport board can render either
// the advance (A: `zgloszony → gotowy`) or the guarded rollback (B:
// `gotowy → zgloszony`, pre-`w_trasie` only) without duplicating the §7.1
// confirm-<Dialog> shell.
//
// Shape per §7.10.2: centered <Dialog>, `bg-card`, ghost «Anuluj» = dismiss
// (NOT the business-cancel — delegation-cancel stays carrier/admin-only and is
// not on this board), brand-red primary. `await onConfirm()`; close on resolve,
// stay open on reject so the parent can toast and the operator can retry.

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

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
   * Runs the transition. Awaited — dialog closes on resolve, stays open on
   * reject (parent surfaces the error toast).
   */
  onConfirm: () => void | Promise<void>;
}

export function MarkReadyDialog({
  open,
  onOpenChange,
  plate,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: Props) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
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
              single-purpose eksport role (§7.10.2). */}
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={busy}
            aria-label={`${confirmLabel} — ${plate}`}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
