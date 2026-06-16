'use client';

// Hand-rolled anchored popover. Consistent with the project's no-Radix
// primitive policy (see Sheet.tsx / Dialog.tsx) — docs/14 § Phase 5 names
// shadcn `<Popover>`, but the codebase deliberately hand-rolls portal-based
// primitives to keep the dep set lean. This file fills that role: a portal
// panel positioned under an anchor element, closing on outside-click and
// Escape, with the trigger width exposed as a CSS var so callers can match it.
//
// Deviation logged in the web-agent report.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

interface PopoverCtx {
  open: boolean;
  setOpen: (open: boolean) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
}

const PopoverContext = createContext<PopoverCtx | null>(null);

function usePopover(): PopoverCtx {
  const ctx = useContext(PopoverContext);
  if (!ctx) throw new Error('Popover parts must be used inside <Popover>');
  return ctx;
}

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Popover({ open, onOpenChange, children }: PopoverProps) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const value = useMemo<PopoverCtx>(
    () => ({ open, setOpen: onOpenChange, anchorRef, contentRef }),
    [open, onOpenChange],
  );
  return (
    <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>
  );
}

/**
 * Registers its single child element as the popover anchor. The child is
 * expected to be the interactive trigger (a `<button>`). We attach a ref to
 * it via a wrapping fragment is not possible — so callers pass the trigger as
 * `children` and we measure its DOM node via a wrapper `<div className="contents">`.
 */
export function PopoverAnchor({ children }: { children: ReactNode }) {
  const { anchorRef } = usePopover();
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      // `display: contents` wrapper is transparent to layout; we measure the
      // first element child as the real anchor.
      anchorRef.current = (node?.firstElementChild as HTMLElement) ?? node;
    },
    [anchorRef],
  );
  return (
    <div ref={setRef} className="contents">
      {children}
    </div>
  );
}

export interface PopoverContentProps {
  className?: string;
  children?: ReactNode;
  /** Gap between the anchor and the panel, in px. */
  sideOffset?: number;
  /**
   * Horizontal alignment of the panel relative to the anchor.
   * `'start'` (default) pins the panel's left edge to the anchor's left edge;
   * `'end'` pins the panel's right edge to the anchor's right edge so a
   * right-aligned trigger (e.g. a row-actions kebab in a table's last column)
   * opens leftwards and never spills past the viewport's right edge.
   */
  align?: 'start' | 'end';
}

export function PopoverContent({
  className,
  children,
  sideOffset = 4,
  align = 'start',
}: PopoverContentProps) {
  const { open, setOpen, anchorRef, contentRef } = usePopover();
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left?: number;
    right?: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Position the panel under the anchor. Re-measure on open and on
  // scroll/resize so it tracks the trigger.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      setPos({
        top: r.bottom + sideOffset,
        width: r.width,
        ...(align === 'end'
          ? { right: window.innerWidth - r.right }
          : { left: r.left }),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, sideOffset, align, anchorRef]);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        contentRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, setOpen, anchorRef, contentRef]);

  if (!mounted || !open || !pos) return null;

  return createPortal(
    <div
      ref={contentRef}
      role="presentation"
      style={{
        position: 'fixed',
        top: pos.top,
        ...(pos.left != null ? { left: pos.left } : {}),
        ...(pos.right != null ? { right: pos.right } : {}),
        // `--radix-popover-trigger-width` is referenced by docs/14 § Phase 5
        // so MultiSelect can size the panel to the trigger; we expose the
        // same custom-property name for spec compatibility.
        ['--radix-popover-trigger-width' as string]: `${pos.width}px`,
      }}
      className={cn(
        'z-50 rounded border border-border bg-card shadow-card',
        'animate-modal-pop',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
