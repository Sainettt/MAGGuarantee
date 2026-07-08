'use client';

// <FormDialog> — the centered large dialog shell for the three fleet forms
// (docs/14-design-system.md §13.1). Composes the existing <Dialog> primitive:
// portal, overlay (`bg-black/40 backdrop-blur-sm`), focus-restore, Escape-close
// and `animate-modal-in` are all INHERITED — not re-implemented here.
//
// The wrapper overrides <DialogContent>'s baked-in `max-w-md p-6` via `className`
// (cn() uses tailwind-merge, so the wider box + `p-0` cleanly win) and adds the
// three structural bands (header / scrollable body / sticky footer) mirroring
// <Sheet>'s proven SheetHeader/Body/Footer — including the anti-shake trio on
// the body so tall checkbox grids don't cause scroll shake.
//
// The confirm-style <Dialog> callers (delete / deactivate) are untouched — they
// keep their default `max-w-md p-6`; only this wrapper opts into the wide shell.

import type { ReactNode } from 'react';

import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';

// Re-export the title / description primitives so form dialogs pull everything
// from one module (they still resolve against the <Dialog> context).
export { DialogTitle as FormDialogTitle } from '@/components/ui/Dialog';
export { DialogDescription as FormDialogDescription } from '@/components/ui/Dialog';

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function FormDialog({ open, onOpenChange, children }: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'w-[calc(100%-2rem)] sm:max-w-[900px]',
          'max-h-[90dvh] p-0',
          'flex flex-col overflow-hidden',
        )}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Sticky top band — clears the built-in close × via `pr-12`. */
export function FormDialogHeader({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'shrink-0 border-b border-border px-6 py-4 pr-12',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The ONLY scroller — carries the anti-shake trio (see SheetBody). */
export function FormDialogBody({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto px-6 py-5',
        '[overflow-anchor:none] overflow-x-hidden [scrollbar-gutter:stable]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Sticky bottom band — validation summary (mr-auto) + actions (right). */
export function FormDialogFooter({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'shrink-0 border-t border-border bg-card px-6 py-3',
        'flex items-center justify-end gap-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
