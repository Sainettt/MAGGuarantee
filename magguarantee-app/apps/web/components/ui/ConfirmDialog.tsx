'use client';

// <ConfirmDialog> — the bare (no-reason) confirm variant of the destructive-
// confirm family (docs/14-design-system.md §7.1(a), §7.7.4). A centered
// <Dialog> with danger framing for irreversible actions that DON'T need a
// free-form justification (vs <ConfirmDeleteWithReasonDialog> which does).
//
// Behaviour mirrors the reason variant: `await onConfirm()`, close on resolve,
// stay OPEN on reject so the parent can surface an error toast and the user can
// retry. The confirm button is `<Button variant="destructive">`.

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

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  /** Confirm button label, e.g. «Wyczyść». */
  confirmLabel: string;
  cancelLabel: string;
  /**
   * Runs the action. Awaited — the dialog closes on resolve and stays open on
   * reject (parent toasts). May be sync or async.
   */
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Stay open; parent surfaces the error toast so the user can retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
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
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
