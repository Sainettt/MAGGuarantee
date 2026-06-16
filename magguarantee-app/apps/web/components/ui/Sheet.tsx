'use client';

// Right-side drawer for Phase 2 admin edit forms. Phase 2 ships a hand-rolled
// implementation (portal + focus management + Escape close) rather than
// pulling Radix Dialog — this keeps Phase 1's npm dep set unchanged. The
// surface API mimics shadcn's <Sheet> closely enough that a Phase 3+ swap to
// Radix is mechanical (replace this file, callers stay).
//
// Behaviour:
//   - Click overlay → close.
//   - Press Escape → close.
//   - When open, body scroll is locked.
//   - Focus moves into the sheet on open; restored on close.
//
// We deliberately keep focus-trap minimal: Tab cycles through focusable
// elements inside the sheet. This is enough for Phase 2 forms; a full Radix
// trap is a Phase 3+ upgrade.

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
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

interface SheetCtx {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
}

const SheetContext = createContext<SheetCtx | null>(null);

function useSheet(): SheetCtx {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('Sheet components must be used inside <Sheet>');
  return ctx;
}

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const value = useMemo<SheetCtx>(
    () => ({ open, setOpen: onOpenChange, titleId, descriptionId }),
    [open, onOpenChange, titleId, descriptionId],
  );
  return (
    <SheetContext.Provider value={value}>{children}</SheetContext.Provider>
  );
}

export function SheetClose({
  children,
  asChild: _asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  void _asChild;
  const { setOpen } = useSheet();
  return (
    <button type="button" onClick={() => setOpen(false)} {...props}>
      {children}
    </button>
  );
}

export interface SheetContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Visual width — `default` is 480px, `wide` is 640px, `xl` is 720px
   * (per docs/14: Phase 4 employee verification modal). Phase 2 only used
   * `default` / `wide`; Phase 4 introduces `xl` for the
   * `<ClaimVerificationModal>` which needs a two-column form.
   */
  size?: 'default' | 'wide' | 'xl';
}

export function SheetContent({
  className,
  children,
  size = 'default',
  ...props
}: SheetContentProps) {
  const { open, setOpen, titleId, descriptionId } = useSheet();
  const tCommon = useTranslations('common');
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // Funnel `setOpen` through a ref so the focus/scroll/Escape effect below
  // depends only on `open`. Without this, callers that pass an inline arrow
  // `onOpenChange={(o) => …}` would create a fresh `setOpen` on every parent
  // render — the effect would re-run, focus would jump back to the first
  // input, and any text-field that triggers a state update on blur (NIP/VAT
  // VIES check etc.) would steal focus mid-typing.
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;

  // Mount portal target only on the client.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Focus management + Escape + body scroll lock. Runs once per open/close
  // transition.
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first focusable element inside the sheet.
    const focusable = contentRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenRef.current(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [open]);

  if (!mounted || !open) return null;

  const widthClass =
    size === 'xl'
      ? 'sm:max-w-[720px]'
      : size === 'wide'
        ? 'sm:max-w-[640px]'
        : 'sm:max-w-[480px]';

  return createPortal(
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label={tCommon('close')}
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          'absolute inset-y-0 right-0 flex h-full w-full flex-col',
          widthClass,
          'bg-card border-l border-border shadow-modal',
          'animate-slide-in',
          'focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <button
          type="button"
          aria-label={tCommon('close')}
          onClick={() => setOpen(false)}
          className={cn(
            'absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md',
            'text-text-sub hover:text-text hover:bg-input transition-colors',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
          )}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
    </div>,
    document.body,
  );
}

export function SheetHeader({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn('shrink-0 border-b border-border px-6 py-4 pr-12', className)}
    >
      {children}
    </div>
  );
}

export function SheetTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useSheet();
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

export function SheetDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = useSheet();
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

export function SheetBody({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto px-6 py-4',
        // `overflow-anchor: none` — disables browser scroll anchoring inside
        // the body. Tall forms whose content has a fractional total height
        // (e.g. the checkbox grids with wrapping labels in VehicleSheet /
        // TrailerSheet) make the browser repeatedly re-clamp scrollTop once
        // you've scrolled to the very bottom, which shows up as the whole form
        // "shaking" up/down. Turning anchoring off breaks that loop.
        '[overflow-anchor:none]',
        // Clip any incidental horizontal overflow (focus rings, sub-pixel grid
        // widths) so a horizontal scrollbar can't flicker in/out — that flicker
        // survived the vertical `scrollbar-gutter` reservation below.
        'overflow-x-hidden',
        // Reserve the vertical scrollbar's width so the bar appearing never
        // narrows the content and reflows the subgrid fields.
        '[scrollbar-gutter:stable]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SheetFooter({
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

// Provided for symmetry with shadcn's API; Phase 2 doesn't use them but keeps
// callers from breaking if they reach for them.
export const SheetTrigger = SheetClose;
export const SheetPortal = ({ children }: { children: ReactNode }) =>
  children as React.ReactElement;
