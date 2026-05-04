'use client';

// Centered modal dialog. Hand-rolled (no Radix) to keep Phase 1's npm dep
// set unchanged. Used for confirmations (delete row, deactivate). Edit forms
// live in <Sheet>. Per docs/14, modal has shadow-modal + radius 16 +
// animate-modal-in.

import { X } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

interface DialogCtx {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const DialogContext = createContext<DialogCtx | null>(null);

function useDialog(): DialogCtx {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('Dialog components must be used inside <Dialog>');
  return ctx;
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const value = useMemo<DialogCtx>(
    () => ({ open, setOpen: onOpenChange, titleId, descriptionId }),
    [open, onOpenChange, titleId, descriptionId],
  );
  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
}

export function DialogClose({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useDialog();
  return (
    <button type="button" onClick={() => setOpen(false)} {...props}>
      {children}
    </button>
  );
}

export const DialogTrigger = DialogClose;

export function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen, titleId, descriptionId } = useDialog();
  const ref = useRef<HTMLDivElement | null>(null);
  const previous = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = ref.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous.current?.focus();
    };
  }, [open, setOpen]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          'absolute left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
          'bg-card border border-border rounded-xl shadow-modal p-6',
          'focus:outline-none animate-modal-in',
          className,
        )}
        {...props}
      >
        {children}
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className={cn(
            'absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md',
            'text-text-sub hover:text-text hover:bg-input transition-colors',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
          )}
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function DialogHeader({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <div className={cn('mb-4 pr-7', className)}>{children}</div>;
}

export function DialogTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useDialog();
  return (
    <h2
      id={titleId}
      className={cn('text-lg font-bold text-text leading-tight', className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function DialogDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = useDialog();
  return (
    <p
      id={descriptionId}
      className={cn('mt-1 text-sm text-text-sub', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn('mt-6 flex items-center justify-end gap-2', className)}
    >
      {children}
    </div>
  );
}
